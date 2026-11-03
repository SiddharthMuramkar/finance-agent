import { and, desc, eq, lt } from "drizzle-orm";
import { OWNER_LEARNER_ID, turns } from "@/db/schema";
import type { Db } from "@/db/types";

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

/** What started a turn: the Learner's own message, or an opener the page started (no Learner message). */
export type TurnKind = "message" | "opener";

/** The kind a turn recorded: code-written turns save their note, with its fixed prefix, as the turn's input. */
export function turnKind(turn: Pick<Turn, "input">): TurnKind {
  return turn.input?.startsWith(OPENER_PREFIX) ? "opener" : "message";
}

/** What the Learner's "Continue" button sends. */
export const CONTINUE_TEXT = "Continue.";

export const BUSY_MESSAGE = "A turn is in progress, perhaps on another device. Wait for it to finish, then send again.";
/** A run can't outlive Vercel's 300-second limit, so a turn still marked running after this was killed. */
export const STALE_RUN_MS = 330_000;

/** The Learner's most recent turn and its saved status. */
export async function latestTurn(db: Db, learnerId = OWNER_LEARNER_ID): Promise<Turn | undefined> {
  const [row] = await db.select().from(turns).where(eq(turns.learnerId, learnerId)).orderBy(desc(turns.id)).limit(1);
  return row;
}

/** Whether one of the Learner's turns is running now (one older than any function can live is not). Choosing a Topic waits for it. */
export async function turnRunning(db: Db, now: Date, learnerId = OWNER_LEARNER_ID): Promise<boolean> {
  const turn = await latestTurn(db, learnerId);
  return turn?.status === "running" && now.getTime() - turn.startedAt.getTime() < STALE_RUN_MS;
}

/** The same Learner's turn before this one, if any. */
export async function turnBefore(db: Db, id: number, learnerId = OWNER_LEARNER_ID): Promise<Turn | undefined> {
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
export async function startTurn(db: Db, now: Date, input: string, learnerId = OWNER_LEARNER_ID): Promise<Turn | undefined> {
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
export async function resumeTurn(db: Db, now: Date, learnerId = OWNER_LEARNER_ID): Promise<ResumeClaim> {
  await expireStaleRuns(db, now, learnerId);
  const latest = await latestTurn(db, learnerId);
  if (!latest || latest.status === "running") return { turn: undefined };
  if (latest.status === "finished") return { turn: latest, alreadyFinished: true };
  try {
    const [row] = await db
      .update(turns)
      .set({ status: "running", startedAt: now, error: null })
      .where(and(eq(turns.id, latest.id), eq(turns.status, latest.status)))
      .returning();
    return row ? { turn: row, alreadyFinished: false } : { turn: undefined };
  } catch {
    // Another of the Learner's turns took the lock first (the partial unique index on running turns).
    return { turn: undefined };
  }
}

export async function updateTurn(db: Db, id: number, set: Partial<Turn>) {
  await db.update(turns).set(set).where(eq(turns.id, id));
}
