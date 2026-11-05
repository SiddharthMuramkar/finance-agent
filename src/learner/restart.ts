import { and, eq, inArray } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import {
  checkResults,
  insightAttempts,
  learners,
  learnerState,
  misconceptions,
  practiceAnswers,
  quizAttempts,
  sessions,
  skillState,
  topicProgress,
  topicRestarts,
  widgetState,
} from "@/db/schema";
import type { Db } from "@/db/types";

/** What the Start a Topic over form sends as `confirm`; a post without it changes nothing. */
export const RESTART_CONFIRM = "restart-topic";

/**
 * A Topic's progress rows as they stood when the Learner started it over, each row as the table stores it.
 * Dates become ISO strings, because the snapshot is jsonb.
 */
export type TopicSnapshot = {
  topic_progress: Record<string, unknown> | null;
  check_results: Record<string, unknown>[];
  misconceptions: Record<string, unknown>[];
  insight_attempts: Record<string, unknown>[];
  quiz_attempts: Record<string, unknown>[];
  skill_state: Record<string, unknown>[];
  practice_answers: Record<string, unknown>[];
  widget_state: Record<string, unknown>[];
};

export type RestartResult =
  | { restarted: true; restartId: number; oldSessionId: number | null }
  | { restarted: false; reason: "nothing_to_restart" };

/**
 * Starts one Topic over for one Learner, in one transaction: the Topic's progress rows move into a
 * `topic_restarts` snapshot and the live copies are cleared, the live Session becomes an Earlier attempt
 * (`older`, `restarted_at`), and the next turn opens a fresh Session. Nothing is lost, and no row of another
 * Topic or Learner changes. With nothing to restart (also a double submit) it changes nothing.
 * `map` is needed because `quiz_attempts` has no Topic: its rows are found by the Topic's Check ids.
 */
export async function restartTopic(db: Db, map: CourseMap, learnerId: number, topicId: string, now = new Date()): Promise<RestartResult> {
  const checkIds = (map.topic(topicId)?.checks ?? []).map((c) => c.id);
  return db.transaction(async (tx) => {
    // One restart at a time per Learner, so two submits at once cannot both snapshot the same attempt.
    await tx.select({ id: learners.id }).from(learners).where(eq(learners.id, learnerId)).for("no key update");
    const [live] = await tx
      .select()
      .from(sessions)
      .where(and(eq(sessions.learnerId, learnerId), eq(sessions.topicId, topicId), eq(sessions.older, false)))
      .limit(1)
      .for("update");
    const [progress] = await tx
      .select()
      .from(topicProgress)
      .where(and(eq(topicProgress.learnerId, learnerId), eq(topicProgress.topicId, topicId)));
    if (!live && !progress) return { restarted: false, reason: "nothing_to_restart" } as const;

    const snapshot: TopicSnapshot = {
      topic_progress: progress ?? null,
      check_results: await tx.select().from(checkResults).where(and(eq(checkResults.learnerId, learnerId), eq(checkResults.topicId, topicId))),
      misconceptions: await tx.select().from(misconceptions).where(and(eq(misconceptions.learnerId, learnerId), eq(misconceptions.topicId, topicId))),
      insight_attempts: await tx.select().from(insightAttempts).where(and(eq(insightAttempts.learnerId, learnerId), eq(insightAttempts.topicId, topicId))),
      quiz_attempts: checkIds.length
        ? await tx.select().from(quizAttempts).where(and(eq(quizAttempts.learnerId, learnerId), inArray(quizAttempts.checkId, checkIds)))
        : [],
      skill_state: await tx.select().from(skillState).where(and(eq(skillState.learnerId, learnerId), eq(skillState.topicId, topicId))),
      practice_answers: await tx.select().from(practiceAnswers).where(and(eq(practiceAnswers.learnerId, learnerId), eq(practiceAnswers.topicId, topicId))),
      widget_state: live ? await tx.select().from(widgetState).where(and(eq(widgetState.sessionId, live.id), eq(widgetState.learnerId, learnerId))) : [],
    };

    const earlier = await tx
      .select({ id: topicRestarts.id })
      .from(topicRestarts)
      .where(and(eq(topicRestarts.learnerId, learnerId), eq(topicRestarts.topicId, topicId)));
    const [restart] = await tx
      .insert(topicRestarts)
      .values({
        learnerId,
        topicId,
        sessionId: live?.id ?? null,
        attemptNo: earlier.length + 1,
        restartedAt: now,
        snapshot: JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>,
      })
      .returning({ id: topicRestarts.id });

    await tx.delete(topicProgress).where(and(eq(topicProgress.learnerId, learnerId), eq(topicProgress.topicId, topicId)));
    await tx.delete(checkResults).where(and(eq(checkResults.learnerId, learnerId), eq(checkResults.topicId, topicId)));
    await tx.delete(misconceptions).where(and(eq(misconceptions.learnerId, learnerId), eq(misconceptions.topicId, topicId)));
    await tx.delete(insightAttempts).where(and(eq(insightAttempts.learnerId, learnerId), eq(insightAttempts.topicId, topicId)));
    await tx.delete(skillState).where(and(eq(skillState.learnerId, learnerId), eq(skillState.topicId, topicId)));
    await tx.delete(practiceAnswers).where(and(eq(practiceAnswers.learnerId, learnerId), eq(practiceAnswers.topicId, topicId)));
    if (checkIds.length) await tx.delete(quizAttempts).where(and(eq(quizAttempts.learnerId, learnerId), inArray(quizAttempts.checkId, checkIds)));

    if (live) {
      await tx.update(sessions).set({ older: true, restartedAt: now }).where(eq(sessions.id, live.id));
      await tx
        .update(learnerState)
        .set({ shownSessionId: null })
        .where(and(eq(learnerState.learnerId, learnerId), eq(learnerState.shownSessionId, live.id)));
    }
    return { restarted: true, restartId: restart.id, oldSessionId: live?.id ?? null } as const;
  });
}
