import type { CourseMap } from "@/course/map";
import type { Marking } from "@/course/quiz";
import type { Db } from "@/db/types";
import { pendingQuizNote, submitQuiz, type QuizResult } from "@/learner/quiz";
import { currentTopicId, liveSession } from "./session-log";
import { saveItemAfterLatest, type SessionItem } from "./session-items";
import { storeTopicComplete } from "./topic-complete";
import { QUIZ_FOLLOW_UP_PREFIX } from "./turn-status";

/**
 * Check results in the conversation. A result card is a display-only Session item, stored after the latest
 * message of the Check's Topic Session, so the model never sees it: a quiz's when the Learner submits it, a
 * conversation Check's when the Tutor records a verdict. After a missed quiz, code runs a quiz follow-up turn
 * from the note written here, and the Tutor goes over the missed questions.
 */

/** The kind of a Check result card. */
export const CHECK_RESULT = "check_result";

/** The number (from 1) of the Check among its Topic's Checks, or null when it is not on the Course Map. */
function checkNumber(map: CourseMap, checkId: string): number | null {
  const check = map.check(checkId);
  const topic = check && map.topic(check.topicId);
  return topic ? topic.checks.findIndex((c) => c.id === checkId) + 1 : null;
}

/**
 * A quiz's card, worded from the marking against the Check's pass rule: "<n> of <m> — passed ✓", adding
 * "let's look at question <k>" (the first missed) when one was missed, or "<n> of <m> — not passed yet · let's look at question <k>".
 */
export function quizResultCard(check: number, marking: Pick<Marking, "correctCount" | "shown" | "passed" | "questions">): SessionItem {
  const missed = marking.questions.findIndex((q) => !q.correct);
  const look = missed >= 0 ? ` · let's look at question ${missed + 1}` : "";
  const label = `${marking.correctCount} of ${marking.shown} — ${marking.passed ? "passed ✓" : "not passed yet"}${look}`;
  return { kind: CHECK_RESULT, data: { check, passed: marking.passed, label } };
}

/** A conversation Check's card, once the Tutor records its verdict: "Check <k> — passed ✓" or "Check <k> — not passed yet". */
export function conversationResultCard(check: number, passed: boolean): SessionItem {
  return { kind: CHECK_RESULT, data: { check, passed, label: `Check ${check} — ${passed ? "passed ✓" : "not passed yet"}` } };
}

/** The card for a Tutor's verdict on a Check, or null when the Check is not on the Course Map. */
export function verdictCard(map: CourseMap, checkId: string, passed: boolean): SessionItem | null {
  const n = checkNumber(map, checkId);
  return n === null ? null : conversationResultCard(n, passed);
}

/**
 * Marks the Learner's quiz answers (submitQuiz) and, with a first submission, stores its result card in the Check's
 * Topic Session in the same transaction. `item` is that card, for the page to draw at once; a repeat has none.
 */
export async function submitQuizAnswers(
  db: Db,
  map: CourseMap,
  attemptId: number,
  answers: Record<string, string>,
  now: Date,
  learnerId: number,
): Promise<QuizResult & { item?: SessionItem; complete?: SessionItem }> {
  let item: SessionItem | undefined;
  let complete = null as SessionItem | null;
  const result = await submitQuiz(db, map, attemptId, answers, now, learnerId, async (tx, { checkId, marking }) => {
    const check = map.check(checkId);
    const n = checkNumber(map, checkId);
    const session = check && (await liveSession(tx, learnerId, check.topicId));
    if (!session || n === null) return;
    item = quizResultCard(n, marking);
    await saveItemAfterLatest(tx, learnerId, session.id, item, now);
    // A pass of the last Due Check passes the Topic again: its Topic complete card follows the result card.
    complete = await storeTopicComplete(tx, map, learnerId, session.id, now);
  });
  return result.ok && item ? { ...result, item, ...(complete ? { complete } : {}) } : result;
}

/** What the turn says when there is no missed quiz to go over (it was gone over already, or the quiz was passed). */
export const NO_MISSED_QUIZ = "There is no missed quiz to go over.";

/**
 * The note code writes for a quiz follow-up turn: the Learner missed the current Topic's quiz, and the Tutor goes
 * over the missed questions (the result itself reaches it as the "Quiz result by code" context). Null when no missed
 * result of this Topic is waiting to be told, or one waiting was a pass.
 */
export async function quizFollowUpNote(db: Db, map: CourseMap, learnerId: number): Promise<string | null> {
  const pending = await pendingQuizNote(db, map, learnerId, await currentTopicId(db, map, learnerId));
  if (!pending || pending.passed) return null;
  return `${QUIZ_FOLLOW_UP_PREFIX} the Learner submitted the quiz and did not pass; code started this turn, and the Learner has written nothing. Go over the questions they missed, one at a time: what the right answer is, and where their choice went wrong. Keep it short, then invite their questions. Do not write new quiz questions. A new attempt, with different questions where there are any, opens only when the Learner presses Try again in the Check tab.`;
}
