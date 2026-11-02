import { and, asc, desc, eq, gte, inArray, max } from "drizzle-orm";
import { DEFAULT_REVIEW_CAP, reviewsDue } from "@/course/navigator";
import type { CourseMap, QuizCheck } from "@/course/map";
import { publicQuestions, type PublicQuestion } from "@/course/quiz";
import type { State } from "ts-fsrs";
import { newCard, rate, type ReviewCardState } from "@/course/review";
import { checkResults, messages, quizAttempts, reviewCards, reviewLog, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { readSettings, type Session } from "@/tutor/session-log";

/**
 * Spaced review in Learner Memory. Quiz questions only; the Course Navigator says which are due,
 * `ts-fsrs` (course/review.ts) schedules them, and this file keeps each question's card in SQL.
 * No model is involved, and nothing here touches a Topic's progress.
 */

type CardRow = typeof reviewCards.$inferSelect;

const toState = (row: CardRow): ReviewCardState => ({
  due: row.due,
  stability: row.stability,
  difficulty: row.difficulty,
  scheduled_days: row.scheduledDays,
  reps: row.reps,
  lapses: row.lapses,
  learning_steps: row.learningSteps,
  state: row.state as State,
  last_review: row.lastReview ?? undefined,
});

const toRow = (questionId: string, c: ReviewCardState): CardRow => ({
  questionId,
  due: c.due,
  stability: c.stability,
  difficulty: c.difficulty,
  elapsedDays: 0, // ts-fsrs 6 no longer keeps elapsed days on the card
  scheduledDays: c.scheduled_days,
  reps: c.reps,
  lapses: c.lapses,
  learningSteps: c.learning_steps,
  state: c.state,
  lastReview: c.last_review ?? null,
});

/**
 * Gives a card to every question shown in a passed quiz Check that has none yet. The card is built
 * by replaying the Learner's answers to that question in the Check's attempts: correct is Good,
 * incorrect is Again. Safe to call any number of times.
 */
export async function enrollPassedQuestions(db: Db, map: CourseMap): Promise<void> {
  const passed = await db.select({ checkId: checkResults.checkId }).from(checkResults).where(eq(checkResults.passed, true));
  const checkIds = [...new Set(passed.map((p) => p.checkId))].filter((id) => map.check(id)?.kind === "quiz");
  if (!checkIds.length) return;
  const attempts = await db
    .select()
    .from(quizAttempts)
    .where(inArray(quizAttempts.checkId, checkIds))
    .orderBy(asc(quizAttempts.id));
  const have = new Set((await db.select({ id: reviewCards.questionId }).from(reviewCards)).map((r) => r.id));
  const events = new Map<string, { at: Date; correct: boolean }[]>();
  for (const attempt of attempts) {
    if (!attempt.submittedAt || !attempt.answers) continue;
    const check = map.check(attempt.checkId) as QuizCheck;
    for (const id of attempt.questionIds) {
      const question = map.question(id);
      if (!question || have.has(id) || !check.questions.includes(id)) continue;
      events.set(id, [...(events.get(id) ?? []), { at: attempt.submittedAt, correct: attempt.answers[id] === question.answer }]);
    }
  }
  for (const [questionId, list] of events) {
    let card = newCard(list[0].at);
    for (const e of list) card = rate(card, e.correct, e.at);
    const inserted = await db.insert(reviewCards).values(toRow(questionId, card)).onConflictDoNothing().returning({ id: reviewCards.questionId });
    if (inserted.length) await db.insert(reviewLog).values(list.map((e) => ({ questionId, rating: e.correct ? 3 : 1, source: "quiz" as const, reviewedAt: e.at })));
  }
}

async function lastActive(db: Db, session: Session): Promise<Date> {
  const [{ last }] = await db.select({ last: max(messages.createdAt) }).from(messages).where(eq(messages.sessionId, session.id));
  return last ?? session.createdAt;
}

/**
 * When the current Session began, for counting reviews against the cap. If the latest Session has
 * gone idle, the next one begins at the moment it went idle; a Session that began after an idle gap
 * counts from that gap, so reviews done before its first message still belong to it.
 */
export async function sessionStart(db: Db, now: Date): Promise<Date> {
  const [latest, previous] = await db.select().from(sessions).orderBy(desc(sessions.id)).limit(2);
  if (!latest) return new Date(0);
  const { idleHours } = await readSettings(db);
  const idleAfter = async (s: Session) => new Date((await lastActive(db, s)).getTime() + idleHours * 3600_000);
  const boundary = await idleAfter(latest);
  if (now.getTime() > boundary.getTime()) return boundary;
  return previous ? new Date(Math.min(latest.createdAt.getTime(), (await idleAfter(previous)).getTime())) : latest.createdAt;
}

export type ReviewState = {
  /** The review to show now (most overdue first), or null when none is due or the cap is reached. */
  question: PublicQuestion | null;
  /** All reviews due, including those past the cap. */
  dueCount: number;
  /** Reviews done since the Session started. */
  done: number;
  cap: number;
};

async function doneThisSession(db: Db, now: Date): Promise<number> {
  const since = await sessionStart(db, now);
  const rows = await db.select({ id: reviewLog.id }).from(reviewLog).where(and(eq(reviewLog.source, "review"), gte(reviewLog.reviewedAt, since)));
  return rows.length;
}

/** What the fixed review page shows: the next review, if any. Opening it makes no model call. */
export async function reviewState(db: Db, map: CourseMap, now = new Date()): Promise<ReviewState> {
  await enrollPassedQuestions(db, map);
  const [cards, done, settings] = await Promise.all([db.select().from(reviewCards), doneThisSession(db, now), readSettings(db)]);
  const cap = Number.isFinite(settings.reviewCap) ? settings.reviewCap : DEFAULT_REVIEW_CAP;
  const { offered, dueCount } = reviewsDue(map, cards, now, done, cap);
  return { question: offered[0] ? publicQuestions(map, [offered[0].questionId])[0] : null, dueCount, done, cap };
}

export type ReviewAnswer =
  | { ok: true; correct: boolean; answer: string; explanation: string; choices: { id: string; text: string }[]; chosen: string | null; nextDue: Date }
  | { ok: false; reason: string };

/** Marks a review on the server and reschedules the question. Only the question currently offered is accepted. */
export async function answerReview(db: Db, map: CourseMap, questionId: string, choiceId: string, now = new Date()): Promise<ReviewAnswer> {
  const state = await reviewState(db, map, now);
  const question = map.question(questionId);
  if (!question || state.question?.id !== questionId) return { ok: false, reason: "That question is not up for review right now." };
  const [row] = await db.select().from(reviewCards).where(eq(reviewCards.questionId, questionId));
  const chosen = question.choices.some((c) => c.id === choiceId) ? choiceId : null;
  const correct = chosen === question.answer;
  const card = rate(toState(row), correct, now);
  await db.transaction(async (transaction) => {
    const tx = transaction as unknown as Db;
    await tx.update(reviewCards).set(toRow(questionId, card)).where(eq(reviewCards.questionId, questionId));
    await tx.insert(reviewLog).values({ questionId, rating: correct ? 3 : 1, source: "review", reviewedAt: now });
  });
  return { ok: true, correct, answer: question.answer, explanation: question.explanation, choices: question.choices.map(({ id, text }) => ({ id, text })), chosen, nextDue: card.due };
}
