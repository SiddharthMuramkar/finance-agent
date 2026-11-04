import { and, desc, eq, lt } from "drizzle-orm";
import { turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { isChipMessage } from "./chips";

/**
 * A turn's saved status, which is also the one-turn lock: the database lets
 * only one turn row per Learner be `running` at a time, so the same Learner's
 * second send from any device is turned away instead of running alongside.
 * Every read here is of the given Learner's turns only.
 */

export type Turn = typeof turns.$inferSelect;

/**
 * The fixed prefix of the note code writes for an opener: the turn the page starts by itself when the
 * Session it shows has no messages. The note is the turn's saved input, so a Retry sends it again.
 */
export const OPENER_PREFIX = "Opener by code:";

/**
 * The fixed prefix of the note code writes when the Learner presses Next (or Complete this Topic): the
 * turn teaches the step code moved them on to. Like the opener's, it is never drawn as a Learner bubble.
 */
export const NEXT_PREFIX = "Next by code:";

/**
 * The fixed prefix of the note code writes when the Learner presses Finish this reply under a reply cut off at
 * its length limit: the Tutor finishes it. Like the others, it is never drawn as a Learner bubble.
 */
export const FINISH_PREFIX = "Finish by code:";

/** The note a Finish this reply turn sends, and sends again on Retry. */
export const FINISH_NOTE = `${FINISH_PREFIX} the Learner pressed Finish this reply, and has written nothing. Your last reply was cut short at its length limit. Finish it from where it stopped, without repeating what you already wrote, then stop and wait for the Learner.`;

/**
 * The fixed prefix of the note code writes for a quiz follow-up: the turn the page starts by itself after the Learner
 * misses a quiz, in which the Tutor takes the first missed question only. Never drawn as a Learner bubble.
 */
export const QUIZ_FOLLOW_UP_PREFIX = "Quiz follow-up by code:";

/**
 * The fixed prefix of the note code writes when the Learner presses "Tell the Tutor what I found" under a Widget
 * whose Guided Tasks are all ticked: what the Widget shows, written by code. Never a Learner bubble, never an Insight attempt.
 */
export const WIDGET_REPORT_PREFIX = "Widget report by code:";

/** The fixed prefixes of every note code writes as a turn's user message; the thread never draws these as bubbles. */
export const CODE_WRITTEN_PREFIXES = [OPENER_PREFIX, NEXT_PREFIX, FINISH_PREFIX, QUIZ_FOLLOW_UP_PREFIX, WIDGET_REPORT_PREFIX] as const;

/**
 * What started a turn: the Learner's own message, a chip's words posted as their message (Just tell me, Go
 * deeper, Show me in a widget), an opener the page started, the Learner's Next, Finish this reply, the
 * quiz follow-up after a missed quiz, or a widget report (Tell the Tutor what I found); the last five carry no
 * Learner message.
 */
export type TurnKind = "message" | "chip" | "opener" | "next" | "finish" | "quiz_follow_up" | "widget_report";

/** The kind a turn recorded: code-written turns save their note, with its fixed prefix, as the turn's input. Retry re-runs that kind. */
export function turnKind(turn: Pick<Turn, "input">): TurnKind {
  if (turn.input?.startsWith(OPENER_PREFIX)) return "opener";
  if (turn.input?.startsWith(NEXT_PREFIX)) return "next";
  if (turn.input?.startsWith(FINISH_PREFIX)) return "finish";
  if (turn.input?.startsWith(QUIZ_FOLLOW_UP_PREFIX)) return "quiz_follow_up";
  if (turn.input?.startsWith(WIDGET_REPORT_PREFIX)) return "widget_report";
  if (turn.input && isChipMessage(turn.input)) return "chip";
  return "message";
}

/** Whether a stored user message is a note code wrote (an opener's, a Next's, a Finish this reply's, a quiz follow-up's or a widget report), not the Learner's words. */
export const isCodeWritten = (text: string) => CODE_WRITTEN_PREFIXES.some((p) => text.startsWith(p));

/**
 * What the old Continue button stored as if the Learner typed it. Nothing sends or stores it now: old Sessions
 * still hold it, and the thread draws each one as a "→ next step" divider.
 */
export const OLD_CONTINUE_TEXT = "Continue.";

export const BUSY_MESSAGE = "A turn is in progress, perhaps on another device. Wait for it to finish, then send again.";
/** A run can't outlive Vercel's 300-second limit, so a turn still marked running after this was killed. */
export const STALE_RUN_MS = 330_000;

/** The Learner's most recent turn and its saved status. */
export async function latestTurn(db: Db, learnerId: number): Promise<Turn | undefined> {
  const [row] = await db.select().from(turns).where(eq(turns.learnerId, learnerId)).orderBy(desc(turns.id)).limit(1);
  return row;
}

/** Whether one of the Learner's turns is running now (one older than any function can live is not). Choosing a Topic waits for it. */
export async function turnRunning(db: Db, now: Date, learnerId: number): Promise<boolean> {
  const turn = await latestTurn(db, learnerId);
  return turn?.status === "running" && now.getTime() - turn.startedAt.getTime() < STALE_RUN_MS;
}

/** The same Learner's turn before this one, if any. */
export async function turnBefore(db: Db, id: number, learnerId: number): Promise<Turn | undefined> {
  const [row] = await db
    .select()
    .from(turns)
    .where(and(eq(turns.learnerId, learnerId), lt(turns.id, id)))
    .orderBy(desc(turns.id))
    .limit(1);
  return row;
}

/** Marks the Learner's run that must have been killed (older than any function can live) as cut off. */
async function expireStaleRuns(db: Db, now: Date, learnerId: number) {
  await db
    .update(turns)
    .set({ status: "cut_off" })
    .where(and(eq(turns.learnerId, learnerId), eq(turns.status, "running"), lt(turns.startedAt, new Date(now.getTime() - STALE_RUN_MS))));
}

/** Takes the Learner's lock for a new turn, saving what they sent; undefined if another of their turns is running. */
export async function startTurn(db: Db, now: Date, input: string, learnerId: number): Promise<Turn | undefined> {
  await expireStaleRuns(db, now, learnerId);
  const [row] = await db.insert(turns).values({ learnerId, status: "running", startedAt: now, input }).onConflictDoNothing().returning();
  return row;
}

export type ResumeClaim = { turn: Turn; alreadyFinished: boolean } | { turn: undefined };

/**
 * Takes the Learner's lock to resume their latest turn after a cut-off or a failure. A turn that has
 * already finished (for example, it kept running after the browser lost the stream) is
 * returned as finished, without taking the lock.
 */
export async function resumeTurn(db: Db, now: Date, learnerId: number): Promise<ResumeClaim> {
  await expireStaleRuns(db, now, learnerId);
  const latest = await latestTurn(db, learnerId);
  if (!latest || latest.status === "running") return { turn: undefined };
  if (latest.status === "finished") return { turn: latest, alreadyFinished: true };
  try {
    const [row] = await db
      .update(turns)
      .set({ status: "running", startedAt: now, error: null, stopReason: null })
      .where(and(eq(turns.id, latest.id), eq(turns.status, latest.status)))
      .returning();
    return row ? { turn: row, alreadyFinished: false } : { turn: undefined };
  } catch {
    // Another of the Learner's turns took the lock first (the partial unique index on running turns).
    return { turn: undefined };
  }
}

/** What a running turn's stop_reason holds once the Learner has pressed Stop; the turn polls for it. */
export const STOP_REQUESTED = "stop_requested";

/**
 * Asks the Learner's running turn to stop: it sees the flag at its next poll, ends its reply there and keeps what it
 * wrote. True when a turn was running to be stopped; false when none was (it had already finished, or never began).
 */
export async function requestStop(db: Db, learnerId: number): Promise<boolean> {
  const rows = await db
    .update(turns)
    .set({ stopReason: STOP_REQUESTED })
    .where(and(eq(turns.learnerId, learnerId), eq(turns.status, "running")))
    .returning({ id: turns.id });
  return rows.length > 0;
}

/** Whether the Learner has asked this running turn to stop. */
export async function stopRequested(db: Db, id: number): Promise<boolean> {
  const [row] = await db.select({ stopReason: turns.stopReason, status: turns.status }).from(turns).where(eq(turns.id, id));
  return row?.status === "running" && row.stopReason === STOP_REQUESTED;
}

export async function updateTurn(db: Db, id: number, set: Partial<Turn>) {
  await db.update(turns).set(set).where(eq(turns.id, id));
}

/** Removes a turn that did nothing (a refused Next), which releases the Learner's lock as if it never ran. */
export async function dropTurn(db: Db, id: number) {
  await db.delete(turns).where(eq(turns.id, id));
}
