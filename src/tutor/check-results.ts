import { and, eq } from "drizzle-orm";
import { questionLookup } from "@/bank/lookup";
import type { CourseMap } from "@/course/map";
import { markAttempt, type MarkedQuestion, type Marking } from "@/course/quiz";
import { quizAttempts } from "@/db/schema";
import type { Db } from "@/db/types";
import { missedLine, pendingQuizNote, submitQuiz, type QuizResult } from "@/learner/quiz";
import { recordAnswer, type PracticeAnswer } from "@/learner/skill-state";
import { currentTopicId, liveSession, saveShownSession } from "./session-log";
import { saveItemAfterLatest, type SessionItem } from "./session-items";
import { CHECK_RESULT } from "./session-item-kinds";
import { storeTopicComplete } from "./topic-complete";
import { QUIZ_FOLLOW_UP_PREFIX } from "./turn-status";

/**
 * Check results in the conversation. A result card is a display-only Session item, stored after the latest
 * message of the Check's Topic Session, so the model never sees it: a quiz's when the Learner submits it, a
 * conversation Check's when the Tutor records a verdict. After a missed quiz, code runs a quiz follow-up turn
 * from the note written here, and the Tutor takes the first missed question: one slip, one fix, one new question.
 */

export { CHECK_RESULT };

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
  const result = await submitQuiz(db, map, attemptId, answers, now, learnerId, async (tx, { checkId, attemptId: attempt, marking }) => {
    const check = map.check(checkId);
    const n = checkNumber(map, checkId);
    const session = check && (await liveSession(tx, learnerId, check.topicId));
    // Every answer to a question that tests a Skill goes into the Learner's Skill state, with the result or not at all.
    // Only the first miss on a Skill in one attempt counts on the ladder; later misses on it are logged, not counted.
    const missed = new Set<string>();
    if (check)
      for (const q of marking.questions) {
        if (!q.skill) continue;
        const answer = practiceAnswerOf(learnerId, check.topicId, session?.id, attempt, q);
        const again = answer.verdict !== "right" && missed.has(q.skill);
        if (answer.verdict !== "right") missed.add(q.skill);
        await recordAnswer(tx, again ? { ...answer, countInState: false } : answer, now);
      }
    if (!session || n === null) return;
    item = quizResultCard(n, marking);
    await saveItemAfterLatest(tx, learnerId, session.id, item, now);
    // A pass of the last Due Check passes the Topic again: its Topic complete card follows the result card.
    complete = await storeTopicComplete(tx, map, learnerId, session.id, now);
    // The passed Topic's Session, with its card, stays on screen until the Learner chooses where to go.
    if (complete) await saveShownSession(tx, learnerId, session.id);
  });
  return result.ok && item ? { ...result, item, ...(complete ? { complete } : {}) } : result;
}

/** A marked question as a logged answer. A Known mistake with no tag counts as wrong. */
function practiceAnswerOf(learnerId: number, topicId: string, sessionId: number | undefined, attemptId: number, q: MarkedQuestion): PracticeAnswer {
  const verdict = q.correct ? "right" : q.mistake?.tag ? "known_mistake" : "wrong";
  return {
    learnerId,
    topicId,
    skillId: q.skill!,
    sessionId: sessionId ?? null,
    itemKey: `quiz:${attemptId}:${q.id}`,
    itemId: q.id,
    ...(q.templateId ? { templateId: q.templateId, params: q.params } : {}),
    input: q.given ?? "",
    verdict,
    ...(verdict === "known_mistake" ? { mistakeTag: q.mistake!.tag } : {}),
    source: "quiz",
  };
}

/** What the turn says when there is no missed quiz to go over (it was gone over already, or the quiz was passed). */
export const NO_MISSED_QUIZ = "There is no missed quiz to go over.";

/**
 * The first question the Learner missed in their latest waiting attempt, as one line: its prompt, their choice and
 * the right answer. Null when it cannot be found (its Check left the Course Map, or its questions did).
 */
async function firstMissed(db: Db, map: CourseMap, learnerId: number, attemptIds: number[]): Promise<string | null> {
  if (!attemptIds.length) return null;
  const [row] = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.learnerId, learnerId), eq(quizAttempts.id, Math.max(...attemptIds))));
  const check = row && map.check(row.checkId);
  if (!check || check.kind !== "quiz") return null;
  const lookup = await questionLookup(db, map, row.questionIds);
  const marking = markAttempt(lookup, check, row.questionIds.filter((id) => lookup.question(id)), row.answers ?? {});
  const q = marking.questions.find((question) => !question.correct);
  if (!q) return null;
  // The prompt in quotes, then the rest of the line: what they gave, the right answer, the Skill's rule and the fix.
  return `"${q.prompt}"${missedLine(map, check.topicId, q).slice(q.prompt.length)}`;
}

/**
 * The note code writes for a quiz follow-up turn: the Learner missed the current Topic's quiz, and the Tutor takes
 * the first missed question only, as one slip, one fix and one new question (R7); code names that question. The
 * whole result reaches it as the "Quiz result by code" context, and the Check tab shows the other misses. Null when
 * no missed result of this Topic is waiting to be told, or one waiting was a pass.
 */
export async function quizFollowUpNote(db: Db, map: CourseMap, learnerId: number): Promise<string | null> {
  const pending = await pendingQuizNote(db, map, learnerId, await currentTopicId(db, map, learnerId));
  if (!pending || pending.passed) return null;
  const first = await firstMissed(db, map, learnerId, pending.attemptIds);
  const which = first ? `the first question they missed: ${first}` : "the first question under Missed in the latest quiz result by code.";
  return [
    `${QUIZ_FOLLOW_UP_PREFIX} the Learner submitted the quiz and did not pass; code started this turn, and the Learner has written nothing.`,
    `Take only ${which}`,
    "In 60 words or fewer: name their slip in one sentence (when the quiz result names a Known mistake for this question, that mistake is the slip); give the one-line fix; then ask one similar question with new numbers that appear nowhere in the quiz.",
    "Do not re-teach the idea, set no other task, and leave the other missed questions alone: the Check tab shows them.",
    "A new attempt, with different questions where there are any, opens only when the Learner presses Try again in the Check tab.",
  ].join(" ");
}
