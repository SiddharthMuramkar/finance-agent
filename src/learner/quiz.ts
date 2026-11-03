import { and, asc, count, eq, isNotNull, isNull } from "drizzle-orm";
import type { CourseMap, QuizCheck } from "@/course/map";
import { markAttempt, publicQuestions, selectQuestions, type Marking, type PublicQuestion } from "@/course/quiz";
import { navigate } from "@/course/navigator";
import { questionLookup } from "@/bank/lookup";
import { quizAttempts } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress, saveCheckResult } from "./memory";

/**
 * Quiz Checks in Learner Memory. Code picks the questions, shows them, marks the
 * answers and saves the result; no model is involved at any point. The Tutor
 * hears the result later, in its next message (see `pendingQuizNote`).
 */

/** `checkNumber` of `checkCount`: where this Check stands among its Topic's Checks, for the "Check 1 of 2" tab. */
export type OpenQuiz = { attemptId: number; checkId: string; checkNumber: number; checkCount: number; attemptNo: number; questions: PublicQuestion[] };

/** The quiz to show now: the current Check, if it is a quiz at its Check step. Creates the attempt the first time. */
export async function openQuiz(db: Db, map: CourseMap, now = new Date()): Promise<OpenQuiz | null> {
  const place = navigate(map, await loadProgress(db));
  const check = place?.step === "check" ? place.check : null;
  if (!check || check.kind !== "quiz") return null;
  const open = async () =>
    (await db.select().from(quizAttempts).where(and(eq(quizAttempts.checkId, check.id), isNull(quizAttempts.submittedAt))).orderBy(asc(quizAttempts.id)))[0];
  let attempt = await open();
  if (!attempt) {
    const [{ n }] = await db.select({ n: count() }).from(quizAttempts).where(eq(quizAttempts.checkId, check.id));
    await db
      .insert(quizAttempts)
      .values({ checkId: check.id, attemptNo: n, questionIds: selectQuestions(check, n), createdAt: now })
      .onConflictDoNothing();
    attempt = (await open())!;
  }
  let questionIds = attempt.questionIds;
  let lookup = await questionLookup(db, map, questionIds);
  if (questionIds.some((id) => !lookup.question(id))) {
    // A question was removed from the Course Map (or the bank) while this attempt was open. The attempt has
    // no answers yet, so it is given a fresh selection from the questions that can still be shown.
    lookup = await questionLookup(db, map, check.questions);
    const usable = check.questions.filter((id) => lookup.question(id));
    if (usable.length < check.passRule.correct) {
      // The Tutor is told and takes it as a conversation Check instead (see `quizUnavailable`).
      console.error(`Quiz Check "${check.id}": only ${usable.length} of its questions can be found, fewer than the ${check.passRule.correct} needed to pass, so no quiz is shown.`);
      return null;
    }
    questionIds = selectQuestions({ ...check, questions: usable }, attempt.attemptNo);
    await db.update(quizAttempts).set({ questionIds }).where(eq(quizAttempts.id, attempt.id));
  }
  return {
    attemptId: attempt.id,
    checkId: check.id,
    checkNumber: place!.topic.checks.indexOf(check) + 1,
    checkCount: place!.topic.checks.length,
    attemptNo: attempt.attemptNo,
    questions: publicQuestions(lookup, questionIds),
  };
}

/**
 * Whether this quiz Check cannot be shown: fewer of its questions can be found (on the Course Map or in the
 * Question Bank) than its pass rule needs. Then no Check tab opens, and the Tutor checks the Learner in
 * conversation and records a verdict, so the Learner is never stuck at a Check nobody can mark.
 */
export async function quizUnavailable(db: Db, map: CourseMap, check: QuizCheck): Promise<boolean> {
  const lookup = await questionLookup(db, map, check.questions);
  return check.questions.filter((id) => lookup.question(id)).length < check.passRule.correct;
}

export type QuizResult =
  | ({ ok: true } & Marking & { attemptNo: number; checkId: string })
  /** `saveFailed`: a database error; nothing was saved and the Learner can submit again. */
  | { ok: false; reason: string; saveFailed?: true };

/** What the Learner sees when the quiz result could not be saved. */
export const QUIZ_SAVE_FAILED = "Your answers could not be saved just now, so nothing was recorded. Please submit again.";

/**
 * Marks an attempt on the server and saves the Check result through Learner Memory, which
 * accepts it only for the current Check. Only questions the attempt showed count. A repeat
 * submission returns the first marking and changes nothing.
 */
export async function submitQuiz(db: Db, map: CourseMap, attemptId: number, answers: Record<string, string>, now = new Date()): Promise<QuizResult> {
  const [attempt] = await db.select().from(quizAttempts).where(eq(quizAttempts.id, attemptId));
  const check = attempt && map.check(attempt.checkId);
  if (!attempt || !check || check.kind !== "quiz") return { ok: false, reason: "No such quiz attempt." };
  const given = attempt.submittedAt && attempt.answers ? attempt.answers : answers;
  const marking = markAttempt(await questionLookup(db, map, attempt.questionIds), check as QuizCheck, attempt.questionIds, given);
  if (!attempt.submittedAt) {
    // The Check result, the Learner's place and the marked attempt are saved together or not at all.
    try {
      const saved = await db.transaction(async (transaction) => {
        const tx = transaction as unknown as Db;
        const result = await saveCheckResult(tx, map, { checkId: check.id, passed: marking.passed, toolCallId: `quiz-attempt-${attempt.id}` }, now);
        if (!result.ok) return result;
        await tx
          .update(quizAttempts)
          .set({ answers: given, correctCount: marking.correctCount, passed: marking.passed, submittedAt: now })
          .where(eq(quizAttempts.id, attempt.id));
        return result;
      });
      if (!saved.ok) return saved;
    } catch (error) {
      console.error("Quiz result could not save", error);
      return { ok: false, reason: QUIZ_SAVE_FAILED, saveFailed: true };
    }
  }
  return { ok: true, checkId: check.id, attemptNo: attempt.attemptNo, ...marking };
}

/**
 * The note that tells the Tutor about quiz results it has not heard yet, or null. Code adds it
 * to the Tutor's history on the next call, then calls `markQuizReported`.
 */
export async function pendingQuizNote(db: Db, map: CourseMap): Promise<{ text: string; attemptIds: number[]; /** Any of them passed, so the Learner moved on. */ passed: boolean } | null> {
  const rows = await db
    .select()
    .from(quizAttempts)
    .where(and(isNotNull(quizAttempts.submittedAt), isNull(quizAttempts.reportedAt)))
    .orderBy(asc(quizAttempts.id));
  if (!rows.length) return null;
  const lookup = await questionLookup(db, map, rows.flatMap((r) => r.questionIds));
  const notes = rows.map((row) => {
    const check = map.check(row.checkId) as (QuizCheck & { topicId: string }) | undefined;
    if (!check) return `Quiz result by code, Check ${row.checkId}, attempt ${row.attemptNo + 1}: the Check is no longer on the Course Map.`;
    // The score and verdict are the ones saved at submission. Only questions that can still be found are re-marked
    // for the missed list, so a question removed since (from the Course Map or the bank) cannot block every later turn.
    const marking = markAttempt(lookup, check, row.questionIds.filter((id) => lookup.question(id)), row.answers ?? {});
    const passed = row.passed ?? marking.passed;
    const head = `Quiz result by code, Check ${row.checkId}, attempt ${row.attemptNo + 1}: ${row.correctCount ?? marking.correctCount} of ${row.questionIds.length} correct (needs ${check.passRule.correct}).`;
    const verdict = passed
      ? "Passed: code recorded the pass."
      : "Not passed: the Learner stays at this Check and gets different questions on a retry where there are any.";
    const missed = marking.questions
      .filter((q) => !q.correct)
      .map((q) => {
        const text = (id: string | null) => q.choices.find((c) => c.id === id)?.text;
        return `${q.prompt} The Learner chose ${q.chosen ? `"${text(q.chosen)}"` : "no answer"}; the right answer is "${text(q.answer)}".`;
      });
    const unchecked = marking.questions.some((q) => !q.verified)
      ? ["Some of these questions come from the Question Bank, whose answer key has not been checked by a person yet: if the Learner disputes a bank answer, work it out with them rather than defending the key."]
      : [];
    return [head, verdict, ...(missed.length ? ["Missed:", ...missed.map((m) => `- ${m}`)] : []), ...unchecked].join("\n");
  });
  return { text: notes.join("\n\n"), attemptIds: rows.map((r) => r.id), passed: rows.some((r) => r.passed === true) };
}

/** Marks results as told to the Tutor, so each one reaches it once. */
export async function markQuizReported(db: Db, attemptIds: number[], now = new Date()) {
  for (const id of attemptIds) await db.update(quizAttempts).set({ reportedAt: now }).where(eq(quizAttempts.id, id));
}
