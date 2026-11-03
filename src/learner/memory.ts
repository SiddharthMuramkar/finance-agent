import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { finishStep, jumpTo, navigate, recordCheckResult, returnToDefaultPath, type Jump, type Move, type Place, type Progress, type TeachingStep } from "@/course/navigator";
import { checkResults, insightAttempts, learnerState, misconceptions, OWNER_LEARNER_ID, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * Learner Memory: one Learner's place and results in SQL. Code reads and
 * writes it; the Course Navigator decides what the records mean. Every read
 * and write is of the given Learner's rows only (the owner's when none is
 * named, as the database's own default has it until every caller names one).
 */

export async function loadProgress(db: Db, learnerId = OWNER_LEARNER_ID): Promise<Progress> {
  const [state] = await db.select().from(learnerState).where(eq(learnerState.learnerId, learnerId));
  const topics = await db.select().from(topicProgress).where(eq(topicProgress.learnerId, learnerId));
  const passes = await db
    .select()
    .from(checkResults)
    .where(and(eq(checkResults.learnerId, learnerId), eq(checkResults.passed, true)));
  const settled = await db
    .select()
    .from(insightAttempts)
    .where(and(eq(insightAttempts.learnerId, learnerId), inArray(insightAttempts.released, ["found", "told"])))
    .orderBy(asc(insightAttempts.id));
  return {
    currentTopicId: state?.currentTopicId ?? null,
    topics: Object.fromEntries(
      topics.map((t) => [
        t.topicId,
        {
          step: t.step as TeachingStep,
          revealShown: t.revealShown,
          status: t.status,
          passedChecks: passes.filter((p) => p.topicId === t.topicId).map((p) => p.checkId),
          insight: settled.find((a) => a.topicId === t.topicId)?.released as "found" | "told" | undefined,
        },
      ]),
    ),
  };
}

/** Writes the Learner's place on the Course Map: one row per Learner, whose id is the Learner's. */
async function saveState(db: Db, learnerId: number, set: Partial<typeof learnerState.$inferInsert>) {
  await db
    .insert(learnerState)
    .values({ id: learnerId, learnerId, ...set })
    .onConflictDoUpdate({ target: learnerState.id, set });
}

/** Writes the current Topic and every Topic's step, reveal flag and status. Check passes are written separately. */
async function saveProgress(db: Db, progress: Progress, now: Date, learnerId: number) {
  await saveState(db, learnerId, { currentTopicId: progress.currentTopicId, updatedAt: now });
  for (const [topicId, t] of Object.entries(progress.topics)) {
    const values = { step: t.step, revealShown: t.revealShown, status: t.status, updatedAt: now };
    await db
      .insert(topicProgress)
      .values({ learnerId, topicId, ...values, startedAt: now })
      .onConflictDoUpdate({ target: [topicProgress.learnerId, topicProgress.topicId], set: values });
  }
}

/**
 * Choosing a Topic: saves the new current Topic and shows its Session at once. The shown Session is
 * cleared, so the Study Workspace shows the current Topic's own Session, or the Topic before its first
 * turn (the opener). Nothing waits for the next turn.
 */
async function saveCurrentTopic(db: Db, after: Progress, now: Date, learnerId: number) {
  await saveState(db, learnerId, { currentTopicId: after.currentTopicId, updatedAt: now, shownSessionId: null });
}

/**
 * The Learner chose a Topic (on the Course Map, after any prompt about unmet prerequisites). Only the
 * current Topic changes; every Topic keeps its progress. Its Session shows at once.
 */
export async function saveJump(db: Db, map: CourseMap, topicId: string, now = new Date(), learnerId = OWNER_LEARNER_ID): Promise<Jump> {
  const progress = await loadProgress(db, learnerId);
  const jump = jumpTo(map, progress, topicId);
  if (jump.ok) await saveCurrentTopic(db, jump.progress, now, learnerId);
  return jump;
}

/** The Learner goes back to the default path; the Topic they leave keeps its progress. Its Session shows at once. */
export async function saveReturnToDefaultPath(db: Db, map: CourseMap, now = new Date(), learnerId = OWNER_LEARNER_ID): Promise<void> {
  const progress = await loadProgress(db, learnerId);
  await saveCurrentTopic(db, returnToDefaultPath(progress), now, learnerId);
}

/**
 * What comes next, and Resume: the Learner opens their current Topic (the Course Navigator's place, which
 * is what comes next), whose Session shows at once. After a Topic passed in a turn, this is how the
 * Learner leaves it: until then the Study Workspace keeps showing the passed Topic's Session.
 */
export async function openCurrentTopic(db: Db, learnerId = OWNER_LEARNER_ID): Promise<void> {
  await saveState(db, learnerId, { shownSessionId: null });
}

/** Saves the start of the current Topic the first time the Learner reaches it. */
export async function ensureTopicStarted(db: Db, map: CourseMap, now = new Date(), learnerId = OWNER_LEARNER_ID): Promise<Place | null> {
  const progress = await loadProgress(db, learnerId);
  const place = navigate(map, progress);
  if (place?.status === "not_started") {
    await saveProgress(
      db,
      {
        currentTopicId: place.topic.id,
        topics: { ...progress.topics, [place.topic.id]: { step: "story", passedChecks: [], revealShown: false, status: "in_progress" } },
      },
      now,
      learnerId,
    );
    return navigate(map, await loadProgress(db, learnerId));
  }
  return place;
}

/** Applies the Tutor's "finished this Teaching Step" report if the Course Navigator accepts it. */
export async function saveFinishedStep(db: Db, map: CourseMap, step: TeachingStep, now = new Date(), learnerId = OWNER_LEARNER_ID): Promise<Move> {
  const move = finishStep(map, await loadProgress(db, learnerId), step);
  if (move.ok) await saveProgress(db, move.progress, now, learnerId);
  return move;
}

export type CheckResultInput = {
  checkId: string;
  passed: boolean;
  /** The Tutor's reasons, for a conversation Check. */
  evidence?: string;
  /** The model that taught the Check. */
  model?: string;
  /** The tool call that reported it. A result already saved under this ID is not saved again. */
  toolCallId?: string;
};

/**
 * Saves a Check result if the Course Navigator accepts it: only the current
 * Check, at its Check step. A pass moves the Learner on; anything else keeps
 * them at the Check. Every result is kept, with its evidence and model.
 */
export async function saveCheckResult(
  db: Db,
  map: CourseMap,
  input: CheckResultInput,
  now = new Date(),
  learnerId = OWNER_LEARNER_ID,
): Promise<{ ok: true; repeated: boolean } | { ok: false; reason: string }> {
  const { checkId, passed, evidence = null, model = null, toolCallId = null } = input;
  if (toolCallId) {
    const [done] = await db.select({ id: checkResults.id }).from(checkResults).where(eq(checkResults.toolCallId, toolCallId));
    if (done) return { ok: true, repeated: true };
  }
  const move = recordCheckResult(map, await loadProgress(db, learnerId), checkId, passed);
  if (!move.ok) return move;
  const topicId = map.check(checkId)!.topicId;
  await db.insert(checkResults).values({ learnerId, topicId, checkId, passed, evidence, model, toolCallId, createdAt: now });
  await saveProgress(db, move.progress, now, learnerId);
  return { ok: true, repeated: false };
}

/** The Learner's every saved Check result, oldest first, with its evidence and the model that taught it. */
export async function loadCheckResults(db: Db, learnerId = OWNER_LEARNER_ID) {
  return db.select().from(checkResults).where(eq(checkResults.learnerId, learnerId)).orderBy(asc(checkResults.id));
}

export type MisconceptionInput = { topicId: string; checkId?: string | null; description: string; model: string; toolCallId: string };

/** Saves a misconception the Tutor noticed. A repeat under the same tool call ID has no second effect. */
export async function saveMisconception(
  db: Db,
  map: CourseMap,
  input: MisconceptionInput,
  now = new Date(),
  learnerId = OWNER_LEARNER_ID,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!map.topic(input.topicId)) return { ok: false, reason: `Topic "${input.topicId}" is not on the Course Map.` };
  await db
    .insert(misconceptions)
    .values({ ...input, learnerId, checkId: input.checkId ?? null, createdAt: now })
    .onConflictDoNothing({ target: misconceptions.toolCallId });
  return { ok: true };
}

/** How many misconceptions the summary lists, newest kept. */
const SUMMARY_MISCONCEPTIONS = 8;

/** Prerequisites of a Topic, and theirs in turn, that are not passed, nearest first. */
function unmasteredPrerequisites(map: CourseMap, progress: Progress, topicId: string): string[] {
  const found: string[] = [];
  const queue = [...(map.topic(topicId)?.prerequisites ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (found.includes(id) || progress.topics[id]?.status === "passed") continue;
    found.push(id);
    queue.push(...(map.topic(id)?.prerequisites ?? []));
  }
  return found;
}

/**
 * A short plain-text account of where the Learner stands, built by code from
 * SQL: Topic and Teaching Step, unmastered prerequisites, misconceptions noted
 * in those Topics, and the last verdict at the current Check. No model call.
 * The workspace shows it on opening, and a new Session opens with it.
 */
export async function learnerSummary(db: Db, map: CourseMap, learnerId = OWNER_LEARNER_ID): Promise<string> {
  const progress = await loadProgress(db, learnerId);
  const place = navigate(map, progress);
  if (!place) return "Every Topic on the Course Map is passed.";
  const { topic, step, check } = place;
  const title = (id: string) => map.topic(id)?.title ?? id;
  const lines = [
    `${topic.title} (${topic.stage} Stage).`,
    place.status === "not_started"
      ? "Not started yet. Teaching Step: story."
      : `Teaching Step: ${step.replace("_", " ")}${check ? `, for Check ${topic.checks.indexOf(check) + 1} of ${topic.checks.length}` : ""}.`,
  ];
  const prerequisites = unmasteredPrerequisites(map, progress, topic.id);
  if (prerequisites.length) {
    const status = (id: string) => (progress.topics[id] ? "in progress" : "not started");
    lines.push(`Unmastered prerequisites: ${prerequisites.map((id) => `${title(id)} (${status(id)})`).join(", ")}.`);
  }
  const relevant = [topic.id, ...prerequisites];
  const noted = (
    await db
      .select()
      .from(misconceptions)
      .where(and(eq(misconceptions.learnerId, learnerId), inArray(misconceptions.topicId, relevant)))
      .orderBy(asc(misconceptions.id))
  ).slice(-SUMMARY_MISCONCEPTIONS);
  if (noted.length) {
    lines.push("Misconceptions noted:");
    for (const m of noted) lines.push(`- ${title(m.topicId)}${m.topicId === topic.id ? "" : " (prerequisite)"}: ${m.description}`);
  }
  if (step === "check" && check) {
    const [last] = await db
      .select()
      .from(checkResults)
      .where(and(eq(checkResults.learnerId, learnerId), eq(checkResults.checkId, check.id)))
      .orderBy(desc(checkResults.id))
      .limit(1);
    if (last && !last.passed) lines.push(`Last verdict at this Check: not yet.${last.evidence ? ` ${last.evidence}` : ""}`);
  }
  if (place.revealShown) lines.push("The reveal has been shown.");
  if (place.dueChecks.length) lines.push(`Checks due in passed Topics: ${place.dueChecks.map((c) => c.id).join(", ")}.`);
  return lines.join("\n");
}
