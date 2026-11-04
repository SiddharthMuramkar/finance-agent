import { eq } from "drizzle-orm";
import { replyChecks } from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * The reply checks' records (spec #229, ticket #239): one `reply_checks` row per checked Tutor turn. Every read and
 * write here fails soft: production deploys before the table's migration is applied by hand, so a missing table
 * (Postgres 42P01) is logged once and read as no rows, and the turn runs as if nothing had been rejected.
 */

export type ReplyCheckRecord = {
  sessionId: number;
  turnSeq: number;
  words: number;
  cap: number;
  draftProblems: { rule: string; message: string }[];
  retryProblems: { rule: string; message: string }[];
  correction: string | null;
  retried: boolean;
  fallback: boolean;
  stopped: boolean;
  rejectedSeqs: number[];
  shownText: string;
};

/** What the Under the hood line shows of a turn's checks. */
export type ReplyCheckSummary = { words: number; failed: string[]; retried: boolean; fallback: boolean };

let warned = false;

/** Whether an error (or what it wraps) is Postgres's "relation does not exist". */
export function isMissingTable(error: unknown): boolean {
  for (let e = error, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    if ((e as { code?: unknown }).code === "42P01") return true;
  }
  return false;
}

async function failSoft<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    if (!warned) {
      warned = true;
      console.warn("reply_checks is missing (migration 0030 not applied yet): turns run as if no reply was rejected.");
    }
    return fallback;
  }
}

/** Saves a turn's record; a second save for the same turn (a resumed turn) replaces it. */
export async function saveReplyCheck(db: Db, r: ReplyCheckRecord): Promise<void> {
  await failSoft(async () => {
    await db
      .insert(replyChecks)
      .values({ ...r, createdAt: new Date() })
      .onConflictDoUpdate({ target: [replyChecks.sessionId, replyChecks.turnSeq], set: { ...r } });
  }, undefined);
}

/** A Session's records, by turn seq. */
async function loadRecords(db: Db, sessionId: number) {
  return failSoft(() => db.select().from(replyChecks).where(eq(replyChecks.sessionId, sessionId)), [] as (typeof replyChecks.$inferSelect)[]);
}

/** The seqs of every row in the Session the Learner never saw: they stay stored, and are left out of every later request. */
export async function rejectedSeqsOf(db: Db, sessionId: number): Promise<Set<number>> {
  return new Set((await loadRecords(db, sessionId)).flatMap((r) => r.rejectedSeqs));
}

/** Each checked turn's summary for the Under the hood line, by turn seq. */
export async function replyCheckSummaries(db: Db, sessionId: number): Promise<Map<number, ReplyCheckSummary>> {
  return new Map((await loadRecords(db, sessionId)).map((r) => [r.turnSeq, summaryOf(r)]));
}

export function summaryOf(r: Pick<ReplyCheckRecord, "words" | "draftProblems" | "retryProblems" | "retried" | "fallback">): ReplyCheckSummary {
  const failed = [...new Set([...r.draftProblems, ...r.retryProblems].map((p) => p.rule))].sort();
  return { words: r.words, failed, retried: r.retried, fallback: r.fallback };
}
