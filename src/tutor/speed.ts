import { and, count, gte, isNotNull, or, sql } from "drizzle-orm";
import { replyChecks, turns, tutorIncidents } from "@/db/schema";
import type { Db } from "@/db/types";
import { GUARD_RULE } from "./stream-guard";
import { OWN_QUESTION_KIND } from "./turn-timing";
import { WIDGET_SAVE_BUDGET, WIDGET_SAVE_SLOW } from "@/learner/widget-save-timing";
export { WIDGET_SAVE_BUDGET };

/**
 * Tutor speed (spec 2026-11-12, A9): the Tutor speed section of /admin. Over the last 30 days of turns, per Reply kind,
 * how long the Learner waited for the first visible word and for the whole reply (the times turn-timing.ts saves on each
 * turn), as a median and a 95th percentile; with the Tutor incidents and the streamed replies' check slips of the same
 * days beside them. Every read fails soft: until migration 0037 adds the time columns and tutor_incidents, the report
 * says the numbers are not available yet instead of failing the page.
 */

export const SPEED_WINDOW_DAYS = 30;
export { OWN_QUESTION_KIND };

/**
 * The A9 budgets, in milliseconds. A streamed own-question turn saves its times under `own_question` (turn-timing.ts),
 * held to the first-word budget; every other kind is step-led, held to the complete-reply budget (`overBudget`).
 */
export const SPEED_BUDGETS = {
  ownQuestionFirstWord: { medianMs: 2500, p95Ms: 5000 },
  stepLedComplete: { medianMs: 6000, p95Ms: 12000 },
} as const;

/**
 * The p-th percentile of `values` by the nearest-rank method: sort them, and take the value at rank ceil(p / 100 * n)
 * (1-based), the smallest value with at least p% of the values at or below it. Always one of the values, never an
 * average of two. Null with no values. `p` is in (0, 100].
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (!(p > 0 && p <= 100)) throw new RangeError(`percentile: p must be in (0, 100], got ${p}`);
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(1, rank) - 1];
}

/** One measure's spread: how many turns had it, its median and its 95th percentile, in milliseconds. */
export type Spread = { n: number; medianMs: number | null; p95Ms: number | null };

function spread(values: readonly (number | null)[]): Spread {
  const present = values.filter((v): v is number => v !== null);
  return { n: present.length, medianMs: percentile(present, 50), p95Ms: percentile(present, 95) };
}

/** One Reply kind's times. `kind` null is a turn for which code chose no kind. */
export type KindSpeed = { kind: string | null; turns: number; firstEvent: Spread; firstWord: Spread; complete: Spread };

/**
 * Whether a kind's times break its A9 budget: an own question's first word, any other kind's complete reply, at the
 * median or at the 95th percentile. Null with no times to judge.
 */
export function overBudget(k: KindSpeed): boolean | null {
  const own = k.kind === OWN_QUESTION_KIND;
  const s = own ? k.firstWord : k.complete;
  const b = own ? SPEED_BUDGETS.ownQuestionFirstWord : SPEED_BUDGETS.stepLedComplete;
  if (s.medianMs === null || s.p95Ms === null) return null;
  return s.medianMs > b.medianMs || s.p95Ms > b.p95Ms;
}

export type TimedTurn = { replyKind: string | null; firstEventMs?: number | null; firstWordMs: number | null; totalMs: number | null };

/**
 * Per Reply kind: the turns, and the spread of time to first word and of total time, each ignoring the turns without
 * that time (a turn that showed no words has no first word). Most turns first, then by kind, the kind-less last.
 */
export function summariseSpeed(rows: readonly TimedTurn[]): KindSpeed[] {
  const byKind = new Map<string | null, TimedTurn[]>();
  for (const r of rows) byKind.set(r.replyKind, [...(byKind.get(r.replyKind) ?? []), r]);
  return [...byKind.entries()]
    .map(([kind, rs]) => ({ kind, turns: rs.length, firstEvent: spread(rs.map((r) => r.firstEventMs ?? null)), firstWord: spread(rs.map((r) => r.firstWordMs)), complete: spread(rs.map((r) => r.totalMs)) }))
    .sort((a, b) => b.turns - a.turns || (a.kind === null ? 1 : b.kind === null ? -1 : a.kind.localeCompare(b.kind)));
}

export type SpeedReport =
  | {
      available: true;
      since: Date;
      kinds: KindSpeed[];
      /** Tutor incidents (incidents.ts) in the window, by kind, most first. */
      incidents: { total: number; byKind: { kind: string; n: number }[] };
      /** Streamed own-question replies whose soft checks failed: shown as they were, recorded, never retried (A5). */
      softCheckSlips: number;
      /** Streamed replies the stream guard stopped mid-sentence, ending in the fixed line. */
      guardStops: number;
      /** Widget state saves over their budget lines (A9): over 0.5 s (the median's) and over 1 s (the 95th percentile's). */
      widgetSaves: { overMedian: number; overP95: number };
    }
  | { available: false; since: Date };

/** Whether an error (or what it wraps) is Postgres's "relation does not exist" or "column does not exist". */
function isMissingSchema(error: unknown): boolean {
  for (let e = error, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    const code = (e as { code?: unknown }).code;
    if (code === "42P01" || code === "42703") return true;
  }
  return false;
}

/**
 * The report over the 30 days before `now` (passed in so the window can be tested). A turn counts by when its last run
 * started (`started_at`: its times are that run's), and only once it has a time. An incident and a check record count by
 * when they were written.
 *
 * A soft-check slip is a check record with problems in its draft and neither a retry nor the fallback, not stopped, and
 * not a refusal: only a streamed reply ends that way (a held reply that fails is retried or replaced). A guard stop is a
 * record whose draft problems carry the stream guard's rule.
 */
export async function tutorSpeed(db: Db, now: Date): Promise<SpeedReport> {
  const since = new Date(now.getTime() - SPEED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const guard = JSON.stringify([{ rule: GUARD_RULE }]);
  const hasGuard = sql`${replyChecks.draftProblems} @> ${guard}::jsonb`;
  const refused = sql`exists (select 1 from ${turns} where ${turns.sessionId} = ${replyChecks.sessionId} and ${turns.turnSeq} = ${replyChecks.turnSeq} and ${turns.stopReason} = 'refusal')`;
  try {
    const [timed, incidents, [checks]] = await Promise.all([
      db
        .select({ replyKind: turns.replyKind, firstEventMs: turns.firstEventMs, firstWordMs: turns.firstWordMs, totalMs: turns.totalMs })
        .from(turns)
        .where(and(gte(turns.startedAt, since), or(isNotNull(turns.firstEventMs), isNotNull(turns.firstWordMs), isNotNull(turns.totalMs)))),
      db
        .select({ kind: tutorIncidents.kind, over: sql<string | null>`${tutorIncidents.detail}->>'over'`, n: count() })
        .from(tutorIncidents)
        .where(gte(tutorIncidents.createdAt, since))
        .groupBy(tutorIncidents.kind, sql`${tutorIncidents.detail}->>'over'`),
      db
        .select({
          slips: sql`count(*) filter (where jsonb_array_length(${replyChecks.draftProblems}) > 0 and not ${replyChecks.retried} and not ${replyChecks.fallback} and not ${replyChecks.stopped} and not ${hasGuard} and not ${refused})`.mapWith(Number),
          guards: sql`count(*) filter (where ${hasGuard})`.mapWith(Number),
        })
        .from(replyChecks)
        .where(gte(replyChecks.createdAt, since)),
    ]);
    // A slow Widget save is timed, not repaired: it is counted on its own, against the save budget.
    const saves = incidents.filter((i) => i.kind === WIDGET_SAVE_SLOW);
    const overP95 = saves.filter((i) => i.over === "p95").reduce((n, i) => n + Number(i.n), 0);
    const widgetSaves = { overMedian: saves.reduce((n, i) => n + Number(i.n), 0), overP95 };
    const merged = new Map<string, number>();
    for (const i of incidents) if (i.kind !== WIDGET_SAVE_SLOW) merged.set(i.kind, (merged.get(i.kind) ?? 0) + Number(i.n));
    const byKind = [...merged].map(([kind, n]) => ({ kind, n })).sort((a, b) => b.n - a.n || a.kind.localeCompare(b.kind));
    return {
      available: true,
      since,
      kinds: summariseSpeed(timed),
      incidents: { total: byKind.reduce((s, i) => s + i.n, 0), byKind },
      softCheckSlips: checks?.slips ?? 0,
      guardStops: checks?.guards ?? 0,
      widgetSaves,
    };
  } catch (error) {
    if (!isMissingSchema(error)) throw error;
    return { available: false, since };
  }
}

/** Milliseconds as seconds with one decimal, rounded half up on the tenth: 2450 reads "2.5 s", 2449 "2.4 s". */
export function seconds(ms: number): string {
  return `${(Math.round(ms / 100) / 10).toFixed(1)} s`;
}
