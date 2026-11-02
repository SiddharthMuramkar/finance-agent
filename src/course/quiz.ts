import type { QuizCheck } from "./map";

/**
 * Quiz Checks, in pure code: which questions an attempt shows, what the browser
 * may see, and how answers are marked. No model, no database.
 */

/**
 * A question with its key, from the Course Map or the Question Bank. `credit` and `verified` come
 * with bank questions; a question written in a Topic file has neither, so it counts as verified.
 */
export type KeyedQuestion = {
  id: string;
  prompt: string;
  choices: { id: string; text: string }[];
  answer: string;
  explanation: string;
  credit?: string;
  verified?: boolean;
};

/** Anything that can find a question by ID: the Course Map, or the Course Map plus loaded bank questions. */
export type QuestionLookup = { question(id: string): KeyedQuestion | undefined };

/** A question as the browser receives it: no answer, no explanation, no source. */
export type PublicQuestion = { id: string; prompt: string; choices: { id: string; text: string }[] };

export type MarkedQuestion = {
  id: string;
  prompt: string;
  /** The choice the Learner picked, or null if none (or one that does not exist). */
  chosen: string | null;
  answer: string;
  correct: boolean;
  explanation: string;
  choices: { id: string; text: string }[];
  /** The credit line, for a Question Bank question. */
  credit?: string;
  /** False while a bank question's key has not been checked by a person. */
  verified: boolean;
};

export type Marking = { correctCount: number; shown: number; needed: number; passed: boolean; questions: MarkedQuestion[] };

/**
 * The question IDs for attempt number `attemptNo` (0 for the first). Attempts
 * walk round the Check's pool, so a retry starts on questions the last attempt
 * did not show wherever the pool is bigger than one attempt.
 */
export function selectQuestions(check: QuizCheck, attemptNo: number): string[] {
  const pool = check.questions;
  const size = Math.min(check.perAttempt ?? check.passRule.correct, pool.length);
  const start = (attemptNo * size) % pool.length;
  return Array.from({ length: size }, (_, i) => pool[(start + i) % pool.length]);
}

/** The questions for the browser, with the key left out. */
export function publicQuestions(map: QuestionLookup, ids: string[]): PublicQuestion[] {
  return ids.map((id) => {
    const q = map.question(id);
    if (!q) throw new Error(`Question "${id}" is not on the Course Map or in the Question Bank.`);
    return { id: q.id, prompt: q.prompt, choices: q.choices.map(({ id, text }) => ({ id, text })) };
  });
}

/** Marks an attempt on the server. The pass rule comes from the Course Map. */
export function markAttempt(map: QuestionLookup, check: QuizCheck, ids: string[], answers: Record<string, string>): Marking {
  const questions = ids.map((id): MarkedQuestion => {
    const q = map.question(id);
    if (!q) throw new Error(`Question "${id}" is not on the Course Map or in the Question Bank.`);
    const picked = answers[id];
    const chosen = q.choices.some((c) => c.id === picked) ? picked : null;
    return {
      id,
      prompt: q.prompt,
      chosen,
      answer: q.answer,
      correct: chosen === q.answer,
      explanation: q.explanation,
      choices: q.choices.map(({ id, text }) => ({ id, text })),
      ...(q.credit ? { credit: q.credit } : {}),
      verified: q.verified ?? true,
    };
  });
  const correctCount = questions.filter((q) => q.correct).length;
  return { correctCount, shown: ids.length, needed: check.passRule.correct, passed: correctCount >= check.passRule.correct, questions };
}
