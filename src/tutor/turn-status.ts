import { and, desc, eq, lt } from "drizzle-orm";
import { turns } from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * A turn's saved status, which is also the one-turn lock: the database lets
 * only one turn row be `running` at a time, so a second send from any device
 * is turned away instead of running alongside.
 */

export type Turn = typeof turns.$inferSelect;

export const BUSY_MESSAGE = "A turn is in progress, perhaps on another device. Wait for it to finish, then send again.";
/** A run can't outlive Vercel's 300-second limit, so a turn still marked running after this was killed. */
export const STALE_RUN_MS = 330_000;

/** The most recent turn and its saved status. */
export async function latestTurn(db: Db): Promise<Turn | undefined> {
  const [row] = await db.select().from(turns).orderBy(desc(turns.id)).limit(1);
  return row;
}

/** The turn before this one, if any. */
export async function turnBefore(db: Db, id: number): Promise<Turn | undefined> {
  const [row] = await db.select().from(turns).where(lt(turns.id, id)).orderBy(desc(turns.id)).limit(1);
  return row;
}

/** Marks a run that must have been killed (older than any function can live) as cut off. */
async function expireStaleRuns(db: Db, now: Date) {
  await db
    .update(turns)
    .set({ status: "cut_off" })
    .where(and(eq(turns.status, "running"), lt(turns.startedAt, new Date(now.getTime() - STALE_RUN_MS))));
}

/** Takes the lock for a new turn, saving what the Learner sent; undefined if another turn is running. */
export async function startTurn(db: Db, now: Date, input: string): Promise<Turn | undefined> {
  await expireStaleRuns(db, now);
  const [row] = await db.insert(turns).values({ status: "running", startedAt: now, input }).onConflictDoNothing().returning();
  return row;
}

export type ResumeClaim = { turn: Turn; alreadyFinished: boolean } | { turn: undefined };

/**
 * Takes the lock to resume the latest turn after a cut-off or a failure. A turn that has
 * already finished (for example, it kept running after the browser lost the stream) is
 * returned as finished, without taking the lock.
 */
export async function resumeTurn(db: Db, now: Date): Promise<ResumeClaim> {
  await expireStaleRuns(db, now);
  const latest = await latestTurn(db);
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
    // Another turn took the lock first (the partial unique index on running turns).
    return { turn: undefined };
  }
}

export async function updateTurn(db: Db, id: number, set: Partial<Turn>) {
  await db.update(turns).set(set).where(eq(turns.id, id));
}
