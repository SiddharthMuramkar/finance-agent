import { and, asc, count, eq, isNotNull, isNull } from "drizzle-orm";
import type { CourseMap, QuizCheck } from "@/course/map";
import { markAttempt, publicQuestions, selectQuestions, type Marking, type PublicQuestion } from "@/course/quiz";
import { navigate } from "@/course/navigator";
import { quizAttempts } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress, saveCheckResult } from "./memory";

/**
 * Quiz Checks in Learner Memory. Code picks the questions, shows them, marks the
 * answers and saves the result; no model is involved at any point. The Tutor
 * hears the result later, in its next message (see `pendingQuizNote`).
 */

export type OpenQuiz = { attemptId: number; checkId: string; attemptNo: number; questions: PublicQuestion[] };

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
  return { attemptId: attempt.id, checkId: check.id, attemptNo: attempt.attemptNo, questions: publicQuestions(map, attempt.questionIds) };
}

export type QuizResult = ({ ok: true } & Marking & { attemptNo: number; checkId: string }) | { ok: false; reason: string };

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
  const marking = markAttempt(map, check as QuizCheck, attempt.questionIds, given);
  if (!attempt.submittedAt) {
    const saved = await saveCheckResult(db, map, { checkId: check.id, passed: marking.passed, toolCallId: `quiz-attempt-${attempt.id}` }, now);
    if (!saved.ok) return saved;
    await db
      .update(quizAttempts)
      .set({ answers: given, correctCount: marking.correctCount, passed: marking.passed, submittedAt: now })
      .where(eq(quizAttempts.id, attempt.id));
  }
  return { ok: true, checkId: check.id, attemptNo: attempt.attemptNo, ...marking };
}

/**
 * The note that tells the Tutor about quiz results it has not heard yet, or null. Code adds it
 * to the Tutor's history on the next call, then calls `markQuizReported`.
 */
export async function pendingQuizNote(db: Db, map: CourseMap): Promise<{ text: string; attemptIds: number[] } | null> {
  const rows = await db
    .select()
    .from(quizAttempts)
    .where(and(isNotNull(quizAttempts.submittedAt), isNull(quizAttempts.reportedAt)))
    .orderBy(asc(quizAttempts.id));
  if (!rows.length) return null;
  const notes = rows.map((row) => {
    const check = map.check(row.checkId) as (QuizCheck & { topicId: string }) | undefined;
    const marking = check && markAttempt(map, check, row.questionIds, row.answers ?? {});
    if (!marking) return `Quiz result by code, Check ${row.checkId}, attempt ${row.attemptNo + 1}: the Check is no longer on the Course Map.`;
    const head = `Quiz result by code, Check ${row.checkId}, attempt ${row.attemptNo + 1}: ${marking.correctCount} of ${marking.shown} correct (needs ${marking.needed}).`;
    const verdict = marking.passed
      ? "Passed: code recorded the pass."
      : "Not passed: the Learner stays at this Check and gets different questions on a retry where there are any.";
    const missed = marking.questions
      .filter((q) => !q.correct)
      .map((q) => {
        const text = (id: string | null) => q.choices.find((c) => c.id === id)?.text;
        return `${q.prompt} The Learner chose ${q.chosen ? `"${text(q.chosen)}"` : "no answer"}; the right answer is "${text(q.answer)}".`;
      });
    return [head, verdict, ...(missed.length ? ["Missed:", ...missed.map((m) => `- ${m}`)] : [])].join("\n");
  });
  return { text: notes.join("\n\n"), attemptIds: rows.map((r) => r.id) };
}

/** Marks results as told to the Tutor, so each one reaches it once. */
export async function markQuizReported(db: Db, attemptIds: number[], now = new Date()) {
  for (const id of attemptIds) await db.update(quizAttempts).set({ reportedAt: now }).where(eq(quizAttempts.id, id));
}
