import { eq } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { finishStep, navigate, recordCheckResult, type Move, type Place, type Progress, type TeachingStep } from "@/course/navigator";
import { checkResults, learnerState, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * Learner Memory: the Learner's place and results in SQL. Code reads and
 * writes it; the Course Navigator decides what the records mean.
 */

export async function loadProgress(db: Db): Promise<Progress> {
  const [state] = await db.select().from(learnerState).where(eq(learnerState.id, 1));
  const topics = await db.select().from(topicProgress);
  const passes = await db.select().from(checkResults).where(eq(checkResults.passed, true));
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
        },
      ]),
    ),
  };
}

/** Writes the current Topic and every Topic's step, reveal flag and status. Check passes are written separately. */
async function saveProgress(db: Db, progress: Progress, now: Date) {
  await db
    .insert(learnerState)
    .values({ id: 1, currentTopicId: progress.currentTopicId, updatedAt: now })
    .onConflictDoUpdate({ target: learnerState.id, set: { currentTopicId: progress.currentTopicId, updatedAt: now } });
  for (const [topicId, t] of Object.entries(progress.topics)) {
    const values = { step: t.step, revealShown: t.revealShown, status: t.status, updatedAt: now };
    await db
      .insert(topicProgress)
      .values({ topicId, ...values, startedAt: now })
      .onConflictDoUpdate({ target: topicProgress.topicId, set: values });
  }
}

/** Saves the start of the current Topic the first time the Learner reaches it. */
export async function ensureTopicStarted(db: Db, map: CourseMap, now = new Date()): Promise<Place | null> {
  const progress = await loadProgress(db);
  const place = navigate(map, progress);
  if (place?.status === "not_started") {
    await saveProgress(
      db,
      {
        currentTopicId: place.topic.id,
        topics: { ...progress.topics, [place.topic.id]: { step: "story", passedChecks: [], revealShown: false, status: "in_progress" } },
      },
      now,
    );
    return navigate(map, await loadProgress(db));
  }
  return place;
}

/** Applies the Tutor's "finished this Teaching Step" report if the Course Navigator accepts it. */
export async function saveFinishedStep(db: Db, map: CourseMap, step: TeachingStep, now = new Date()): Promise<Move> {
  const move = finishStep(map, await loadProgress(db), step);
  if (move.ok) await saveProgress(db, move.progress, now);
  return move;
}

/**
 * Records a Check result. Until the Check tickets add the quiz and the
 * conversation verdict, only tests call this, to exercise the state machine.
 */
export async function recordCheckResultForTest(
  db: Db,
  map: CourseMap,
  checkId: string,
  passed: boolean,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const move = recordCheckResult(map, await loadProgress(db), checkId, passed);
  if (!move.ok) return move;
  const topicId = map.check(checkId)!.topicId;
  await db.insert(checkResults).values({ topicId, checkId, passed, createdAt: now });
  await saveProgress(db, move.progress, now);
  return { ok: true };
}

/** A short plain-text account of where the Learner stands. No model call. */
export function summaryText(place: Place | null): string {
  if (!place) return "Every Topic on the Course Map is passed.";
  const { topic, step, check } = place;
  const lines = [
    `${topic.title} (${topic.stage} Stage).`,
    place.status === "not_started"
      ? "Not started yet. Teaching Step: story."
      : `Teaching Step: ${step.replace("_", " ")}${check ? `, for Check ${topic.checks.indexOf(check) + 1} of ${topic.checks.length}` : ""}.`,
  ];
  if (place.unmetPrerequisites.length) lines.push(`Prerequisites not yet passed: ${place.unmetPrerequisites.join(", ")}.`);
  if (place.revealShown) lines.push("The reveal has been shown.");
  if (place.dueChecks.length) lines.push(`Checks due in passed Topics: ${place.dueChecks.map((c) => c.id).join(", ")}.`);
  return lines.join("\n");
}

/** The summary the workspace shows on opening. Reads SQL only; no model call. */
export async function workspaceSummary(db: Db, map: CourseMap): Promise<string> {
  return summaryText(navigate(map, await loadProgress(db)));
}
