import { eq, sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { replyChecks } from "@/db/schema";
import type { Db } from "@/db/types";

/** reply_checks' columns as migration 0030 made them (fresh builders for each table). */
const columns0030 = () => ({
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  turnSeq: integer("turn_seq").notNull(),
  words: integer("words").notNull(),
  cap: integer("cap").notNull(),
  draftProblems: jsonb("draft_problems").notNull().$type<{ rule: string; message: string }[]>().default(sql`'[]'::jsonb`),
  retryProblems: jsonb("retry_problems").notNull().$type<{ rule: string; message: string }[]>().default(sql`'[]'::jsonb`),
  correction: text("correction"),
  retried: boolean("retried").notNull().default(false),
  fallback: boolean("fallback").notNull().default(false),
  stopped: boolean("stopped").notNull().default(false),
  rejectedSeqs: integer("rejected_seqs").array().notNull().default(sql`'{}'::integer[]`),
  shownText: text("shown_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * reply_checks as migration 0030 made it, with no reply_kind column. Drizzle names every column of a table in an insert,
 * so a database without migration 0031 is written through this. Not in schema.ts, so drizzle-kit never sees it.
 * Delete it once 0031 is applied in production.
 */
const replyChecksBefore0031 = pgTable("reply_checks", columns0030());

/**
 * reply_checks before migration 0034 (E4a), with reply_kind and no widget_source: a database without 0034 still
 * records the Reply kind. Delete it once 0034 is applied in production.
 */
const replyChecksBefore0034 = pgTable("reply_checks", { ...columns0030(), replyKind: text("reply_kind") });

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
  /** The Reply kind code chose for the turn, or null. Saved only once migration 0031 adds its column. */
  replyKind?: string | null;
  /**
   * Where the turn's Widget came from (E4a): tutor | step | scene | lingo | running_example | case | none; null in an
   * engine-off Session. Saved only once migration 0034 adds its column.
   */
  widgetSource?: string | null;
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

/** Whether an error (or what it wraps) is Postgres's "column does not exist". */
function isMissingColumn(error: unknown): boolean {
  for (let e = error, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    if ((e as { code?: unknown }).code === "42703") return true;
  }
  return false;
}

let warnedColumn = false;

let warnedWidgetColumn = false;

/**
 * Saves a turn's record; a second save for the same turn (a resumed turn) replaces it. Until migration 0034 adds the
 * widget_source column, the record is saved without it (its Reply kind kept); until migration 0031 adds reply_kind, it
 * is saved without either.
 */
export async function saveReplyCheck(db: Db, r: ReplyCheckRecord): Promise<void> {
  // Each try is its own transaction (a savepoint inside a caller's), so a failed insert leaves nothing aborted for the next.
  const attempt = (work: (on: Db) => Promise<unknown>) => db.transaction(async (tx) => void (await work(tx as unknown as Db)));
  const { widgetSource, ...before0034 } = r;
  void widgetSource;
  const { replyKind, ...before0031 } = before0034;
  void replyKind;
  await failSoft(async () => {
    try {
      await attempt((on) =>
        on
          .insert(replyChecks)
          .values({ ...r, createdAt: new Date() })
          .onConflictDoUpdate({ target: [replyChecks.sessionId, replyChecks.turnSeq], set: { ...r } }),
      );
      return;
    } catch (error) {
      if (!isMissingColumn(error)) throw error;
    }
    try {
      await attempt((on) =>
        on
          .insert(replyChecksBefore0034)
          .values({ ...before0034, createdAt: new Date() })
          .onConflictDoUpdate({ target: [replyChecksBefore0034.sessionId, replyChecksBefore0034.turnSeq], set: { ...before0034 } }),
      );
      if (!warnedWidgetColumn) {
        warnedWidgetColumn = true;
        console.warn("reply_checks.widget_source is missing (migration 0034 not applied yet): Widget sources are not recorded.");
      }
      return;
    } catch (error) {
      if (!isMissingColumn(error)) throw error;
    }
    if (!warnedColumn) {
      warnedColumn = true;
      console.warn("reply_checks.reply_kind is missing (migration 0031 not applied yet): Reply kinds are not recorded.");
    }
    await db
      .insert(replyChecksBefore0031)
      .values({ ...before0031, createdAt: new Date() })
      .onConflictDoUpdate({ target: [replyChecksBefore0031.sessionId, replyChecksBefore0031.turnSeq], set: { ...before0031 } });
  }, undefined);
}

/** The columns every read takes: never reply_kind, so reads work before migration 0031 is applied. */
const RECORD_COLUMNS = { turnSeq: replyChecks.turnSeq, words: replyChecks.words, draftProblems: replyChecks.draftProblems, retryProblems: replyChecks.retryProblems, retried: replyChecks.retried, fallback: replyChecks.fallback, rejectedSeqs: replyChecks.rejectedSeqs };

/** A Session's records, by turn seq. */
async function loadRecords(db: Db, sessionId: number) {
  return failSoft(() => db.select(RECORD_COLUMNS).from(replyChecks).where(eq(replyChecks.sessionId, sessionId)), [] as { turnSeq: number; words: number; draftProblems: { rule: string; message: string }[]; retryProblems: { rule: string; message: string }[]; retried: boolean; fallback: boolean; rejectedSeqs: number[] }[]);
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
