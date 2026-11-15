import { and, eq, isNull } from "drizzle-orm";
import { questionLookup } from "@/bank/lookup";
import type { CourseMap } from "@/course/map";
import { navigate, whatComesNext, type Progress } from "@/course/navigator";
import { markAttempt, publicQuestions, type Marking, type PublicQuestion, type QuestionLookup } from "@/course/quiz";
import { SKIP_AHEAD_MIN, skipAheadOffered, skipAheadPassRule, skipAheadQuestions } from "@/course/skip-ahead";
import { skipAheadAttempts } from "@/db/schema";
import type { Db } from "@/db/types";
import { isMissingTable } from "@/tutor/reply-records";
import { liveSession, saveShownSession } from "@/tutor/session-log";
import { loadProgress, saveSkipAheadPass } from "./memory";
import { enrollAnswered } from "./review";

/**
 * Skip ahead in Learner Memory (spec 2026-11-12 A8, ADR 0004): the Topic Start card's "I know this: quiz me". Code picks
 * one question for each Skill of the Topic (src/course/skip-ahead.ts), shows them without their key, marks the answers and,
 * when no more than one is missed, passes the whole Topic: every Check gets a pass, the Topic is passed on the Course Map,
 * and the questions are scheduled as Reviews. A miss changes nothing: the Topic goes on from its story. One attempt per
 * Topic per day, which the `skip_ahead_attempts` table's unique key holds. No model is involved. Every read fails soft
 * when the table is missing (a database without migration 0037): skip ahead is then simply not offered.
 */

/** What the Topic Start card shows: the Choice, or the line saying today's attempt is used. */
export type SkipAheadState = "offer" | "tried_today";

/** A skip-ahead quiz as the browser receives it: its questions without their key, and how many must be right. */
export type SkipAheadQuiz = { attemptId: number; topicId: string; questions: PublicQuestion[]; needed: number };

export type SkipAheadResult =
  | ({ ok: true; topicId: string; /** What comes next once a pass moved the Learner on ("Next Topic: …"). */ next: string | null } & Marking)
  | SkipAheadRefusal;

/** Why a start or a submission was refused, with the HTTP status the route answers. */
export type SkipAheadRefusal = { ok: false; reason: string; status: 404 | 409 | 503 };

/** What the Learner reads when today's attempt at this Topic is used. */
export const TRIED_TODAY = "You have had today's quiz for this Topic. You can try it again tomorrow.";

/** What the Learner reads when skip ahead cannot run (its table is missing). */
export const SKIP_AHEAD_UNAVAILABLE = "The quiz cannot open just now. Carry on with the Topic, or try again later.";

/** The day an attempt counts against: the UTC calendar date of `now`. */
export const skipAheadDay = (now: Date) => now.toISOString().slice(0, 10);

/** The seed that picks a Learner's questions for a Topic on a day, so another day may bring other questions. */
const seedOf = (learnerId: number, topicId: string, day: string) => `${learnerId}.${topicId}.${day}`;

let warned = false;

/** Runs `work`; a missing `skip_ahead_attempts` table gives `fallback`, logged once. */
async function failSoft<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    if (!warned) {
      warned = true;
      console.warn("skip_ahead_attempts is missing (migration 0037 not applied yet): skip ahead is not offered.");
    }
    return fallback;
  }
}

async function todays(db: Db, learnerId: number, topicId: string, day: string) {
  const [row] = await db
    .select()
    .from(skipAheadAttempts)
    .where(and(eq(skipAheadAttempts.learnerId, learnerId), eq(skipAheadAttempts.topicId, topicId), eq(skipAheadAttempts.day, day)));
  return row;
}

/**
 * What the Topic Start card offers for this Topic now: the Choice ("offer", also while today's quiz is open and not yet
 * submitted, which it then reopens), the line that today's attempt is used ("tried_today"), or nothing (null) for a Topic
 * that offers no skip ahead (passed, ending on the Learner's own work, too few questions) or when the table is missing.
 */
export async function skipAheadState(db: Db, map: CourseMap, progress: Progress, topicId: string, now: Date, learnerId: number): Promise<SkipAheadState | null> {
  if (!skipAheadOffered(map, progress, topicId)) return null;
  return failSoft(async () => ((await todays(db, learnerId, topicId, skipAheadDay(now)))?.finishedAt ? "tried_today" : "offer"), null);
}

/** The questions of a stored attempt that can still be found, with their lookup. */
async function usable(db: Db, map: CourseMap, ids: string[]): Promise<{ ids: string[]; lookup: QuestionLookup }> {
  const lookup = await questionLookup(db, map, ids);
  return { ids: ids.filter((id) => lookup.question(id)), lookup };
}

/**
 * "I know this: quiz me" pressed: today's quiz for the Learner's current Topic, made now (its questions saved with it) or,
 * when it was opened earlier today and not submitted, the same one again. Refused for a Topic that is not the current one
 * or offers no skip ahead, and once today's attempt is submitted. Nothing about the Topic's place changes.
 */
export async function startSkipAhead(db: Db, map: CourseMap, topicId: string, now: Date, learnerId: number): Promise<{ ok: true; quiz: SkipAheadQuiz } | SkipAheadRefusal> {
  const progress = await loadProgress(db, learnerId);
  if (navigate(map, progress)?.topic.id !== topicId) return { ok: false, reason: "The quiz is offered for the Topic you are studying now.", status: 409 };
  if (!skipAheadOffered(map, progress, topicId)) return { ok: false, reason: "This Topic has no quick quiz.", status: 409 };
  const topic = map.topic(topicId)!;
  const day = skipAheadDay(now);
  const unavailable: SkipAheadRefusal = { ok: false, reason: SKIP_AHEAD_UNAVAILABLE, status: 503 };
  return failSoft(async (): Promise<{ ok: true; quiz: SkipAheadQuiz } | SkipAheadRefusal> => {
    const fresh = () => skipAheadQuestions(map, topic, seedOf(learnerId, topicId, day));
    await db.insert(skipAheadAttempts).values({ learnerId, topicId, day, questions: fresh(), createdAt: now }).onConflictDoNothing();
    const row = (await todays(db, learnerId, topicId, day))!;
    if (row.finishedAt) return { ok: false, reason: TRIED_TODAY, status: 409 };
    let { ids, lookup } = await usable(db, map, row.questions);
    if (ids.length < SKIP_AHEAD_MIN) {
      // A question was removed from the Course Map while this quiz was open, unanswered: it gets today's pick again.
      ({ ids, lookup } = await usable(db, map, fresh()));
      await db.update(skipAheadAttempts).set({ questions: ids }).where(eq(skipAheadAttempts.id, row.id));
    }
    if (ids.length < SKIP_AHEAD_MIN) return { ok: false, reason: "This Topic has no quick quiz.", status: 409 };
    return { ok: true, quiz: { attemptId: row.id, topicId, questions: publicQuestions(lookup, ids), needed: skipAheadPassRule(ids.length).passRule.correct } };
  }, unavailable);
}

/**
 * Marks one of the Learner's skip-ahead quizzes on the server. With at most one miss, the whole Topic passes in one
 * transaction with the marked attempt: a pass for each of its Checks, the Topic passed, its questions scheduled as
 * Reviews, and the passed Topic kept on screen (its Session shown, as after a turn that passes a Topic) until the Learner
 * chooses what comes next. With more misses only the attempt is saved: no Check result, no Skill state, no penalty. A
 * repeat submission returns the first marking and changes nothing. Another Learner's attempt is no such attempt.
 */
export async function submitSkipAhead(db: Db, map: CourseMap, attemptId: number, answers: Record<string, string>, now: Date, learnerId: number): Promise<SkipAheadResult> {
  const unavailable: SkipAheadRefusal = { ok: false, reason: SKIP_AHEAD_UNAVAILABLE, status: 503 };
  const mine = and(eq(skipAheadAttempts.id, attemptId), eq(skipAheadAttempts.learnerId, learnerId));
  const found = await failSoft(async () => (await db.select().from(skipAheadAttempts).where(mine))[0] ?? null, undefined);
  if (found === undefined) return unavailable;
  if (!found || !map.topic(found.topicId)) return { ok: false, reason: "No such quiz.", status: 404 };
  const { ids, lookup } = await usable(db, map, found.questions);
  if (!found.finishedAt) {
    // An attempt counts against its own day: one opened on an earlier day and never submitted cannot be saved up for later.
    if (found.day !== skipAheadDay(now)) return { ok: false, reason: "This quiz was for another day. Open today's quiz from the Topic Start card.", status: 409 };
    // A quiz whose questions were removed from the Course Map below four while it was open is too short to pass a Topic.
    if (ids.length < SKIP_AHEAD_MIN) return { ok: false, reason: "This quiz's questions are no longer on the Course Map.", status: 409 };
  }
  if (!ids.length) return { ok: false, reason: "This quiz's questions are no longer on the Course Map.", status: 409 };
  const marking = markAttempt(lookup, skipAheadPassRule(ids.length), ids, found.finishedAt && found.answers ? found.answers : answers);
  if (!found.finishedAt) {
    // Claimed in one statement: of two submissions sent at once only one finds the attempt unfinished, so answers sent in
    // parallel cannot each be marked on their own and pass the Topic on whichever is right.
    const claimed = await db.transaction(async (transaction) => {
      const tx = transaction as unknown as Db;
      const [row] = await tx
        .update(skipAheadAttempts)
        .set({ answers, correctCount: marking.correctCount, passed: marking.passed, finishedAt: now })
        .where(and(mine, isNull(skipAheadAttempts.finishedAt)))
        .returning();
      if (!row) return false;
      if (marking.passed) {
        const evidence = `Passed through skip ahead: ${marking.correctCount} of ${marking.shown} right.`;
        const saved = await saveSkipAheadPass(tx, map, { topicId: row.topicId, evidence, ref: `skip-ahead-${row.id}` }, now, learnerId);
        if (saved.ok) {
          await enrollAnswered(tx, learnerId, marking.questions.map((q) => ({ id: q.id, correct: q.correct })), now);
          const session = await liveSession(tx, learnerId, row.topicId);
          if (session) await saveShownSession(tx, learnerId, session.id);
        }
      }
      return true;
    });
    // Another submission finished it first: answer with the marking that one saved.
    if (!claimed) return submitSkipAhead(db, map, attemptId, answers, now, learnerId);
  }
  const next = marking.passed ? (whatComesNext(map, await loadProgress(db, learnerId))?.label ?? null) : null;
  return { ok: true, topicId: found.topicId, next, ...marking };
}
