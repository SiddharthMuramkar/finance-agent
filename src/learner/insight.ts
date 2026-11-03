import { and, asc, eq, gte, lt, count } from "drizzle-orm";
import type { CourseMap, Insight } from "@/course/map";
import { navigate, type Place } from "@/course/navigator";
import { insightAttempts, OWNER_LEARNER_ID, topicProgress, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "./memory";

/**
 * Insight recording (ADR 0001): the Tutor reports each attempt at a Topic's Insight, and code
 * decides what comes next. The first not-yet releases hint 1, the second hint 2, the next the
 * written Insight itself; "asked to be told" releases it at once. The written Insight leaves this
 * module only in a result for an Insight that is found or told, never in the context before.
 */

export type Reported = "found" | "not_yet" | "asked_to_be_told";
export type Released = "found" | "hint_1" | "hint_2" | "told";

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * The Learner's exact words as they stand in their message, found whatever the case or spacing the
 * Tutor quoted them in; null when the message does not contain them.
 */
export function exactWords(message: string, words: string): string | null {
  const whole = collapse(message);
  const wanted = collapse(words).replace(/^["“”'‘’]+|["“”'‘’]+$/g, "");
  if (!wanted) return null;
  const at = whole.toLowerCase().indexOf(wanted.toLowerCase());
  return at < 0 ? null : whole.slice(at, at + wanted.length);
}

export type InsightAttemptInput = {
  reported: Reported;
  /** The Learner's words as the Tutor quoted them; they must come from `learnerMessage`. */
  words: string;
  /** What the Learner sent in this turn. */
  learnerMessage: string;
  toolCallId: string;
  model: string;
  turnId: number;
};

export type InsightAttemptResult =
  | { ok: true; released: Released; topicId: string; insight: Insight; hint?: string; words: string }
  | { ok: false; reason: string };

/** Saves one attempt if the Course Navigator is at the explore step and the Learner's words are really theirs. */
export async function saveInsightAttempt(
  db: Db,
  map: CourseMap,
  input: InsightAttemptInput,
  now = new Date(),
  learnerId = OWNER_LEARNER_ID,
): Promise<InsightAttemptResult> {
  const progress = await loadProgress(db, learnerId);
  const place = navigate(map, progress);
  if (!place || place.step !== "explore") {
    return { ok: false, reason: `No Insight is being explored; the current Teaching Step is "${place?.step ?? "none"}".` };
  }
  const { topic } = place;
  const insight = topic.insight;
  if (!insight) return { ok: false, reason: `Topic "${topic.id}" has no Insight.` };
  if (progress.topics[topic.id]?.insight) {
    return { ok: false, reason: "The Insight is already settled for this Topic. Finish the explore step." };
  }
  const words = exactWords(input.learnerMessage, input.words);
  if (!words) {
    return {
      ok: false,
      reason: "Not recorded: those words are not in the Learner's message this turn. Record only what the Learner wrote in this turn; if they wrote nothing about the Insight, ask them and wait.",
    };
  }

  let released: Released;
  if (input.reported === "found") released = "found";
  else if (input.reported === "asked_to_be_told") released = "told";
  else {
    const [{ n }] = await db
      .select({ n: count() })
      .from(insightAttempts)
      .where(and(eq(insightAttempts.learnerId, learnerId), eq(insightAttempts.topicId, topic.id), eq(insightAttempts.reported, "not_yet")));
    const attempt = n + 1;
    released = attempt === 1 && insight.hints.length >= 1 ? "hint_1" : attempt === 2 && insight.hints.length >= 2 ? "hint_2" : "told";
  }
  const inserted = await db
    .insert(insightAttempts)
    .values({
    learnerId,
    topicId: topic.id,
    reported: input.reported,
    released,
    words,
    model: input.model,
    turnId: input.turnId,
    toolCallId: input.toolCallId,
    createdAt: now,
    })
    // The database settles a race: a second settling attempt (or a repeated tool call) writes nothing.
    .onConflictDoNothing()
    .returning({ id: insightAttempts.id });
  if (!inserted.length) return { ok: false, reason: "That attempt was already recorded, or the Insight is already settled for this Topic. Finish the explore step." };
  // Saved as the step, so a passed Topic taken back through explore stays at it until the Tutor finishes it.
  await db
    .update(topicProgress)
    .set({ step: "explore" })
    .where(and(eq(topicProgress.learnerId, learnerId), eq(topicProgress.topicId, topic.id)));
  return { ok: true, released, topicId: topic.id, insight, words, hint: released === "hint_1" ? insight.hints[0] : released === "hint_2" ? insight.hints[1] : undefined };
}

/** What the context says about a Topic's Insight attempts. Never includes the written Insight before it is settled. */
export type ExploreInfo = {
  /** Hints released so far, in order. */
  hints: string[];
  /** How the Insight was settled, or null while the Learner is still working on it. */
  settled: "found" | "told" | null;
  /** The Learner's words from the attempt that settled it. */
  words: string | null;
  /** Earlier turns since explore began in which the Learner made no attempt. */
  idleTurns: number;
};

/** The Learner's attempts at their place's Insight, as the context tells them. */
export async function loadExploreInfo(db: Db, place: Place | null, turnId?: number, learnerId = OWNER_LEARNER_ID): Promise<ExploreInfo | undefined> {
  const insight = place?.topic.insight;
  if (!place || !insight || (place.step !== "explore" && place.step !== "principle")) return undefined;
  const rows = await db
    .select()
    .from(insightAttempts)
    .where(and(eq(insightAttempts.learnerId, learnerId), eq(insightAttempts.topicId, place.topic.id)))
    .orderBy(asc(insightAttempts.id));
  const settledRow = rows.find((r) => r.released === "found" || r.released === "told");
  const hints = rows.flatMap((r) => (r.released === "hint_1" ? [insight.hints[0]] : r.released === "hint_2" ? [insight.hints[1]] : []));
  let idleTurns = 0;
  if (place.step === "explore" && rows.length === 0 && turnId !== undefined) {
    const [progress] = await db
      .select()
      .from(topicProgress)
      .where(and(eq(topicProgress.learnerId, learnerId), eq(topicProgress.topicId, place.topic.id)));
    if (progress) {
      const [{ n }] = await db
        .select({ n: count() })
        .from(turns)
        .where(and(eq(turns.learnerId, learnerId), lt(turns.id, turnId), gte(turns.startedAt, progress.updatedAt)));
      idleTurns = n;
    }
  }
  return { hints, settled: settledRow ? (settledRow.released as "found" | "told") : null, words: settledRow?.words ?? null, idleTurns };
}
