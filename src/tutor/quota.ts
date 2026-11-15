import { and, eq, gte, ne, sql } from "drizzle-orm";
import { isOwnerLearner } from "@/auth/access";
import { learners, sessions, settings, turns, usageRows } from "@/db/schema";
import type { Db } from "@/db/types";
import { readSettings } from "./session-log";
import { dayStartIst } from "./spend";

// The Spend caps (decision #13): limits at each layer of a turn, so each layer has a known worst case. Turn admission
// (turn-admission.ts) checks a new turn against the daily caps here before it takes the Learner's lock: turns and
// dollars per Learner per day, and dollars for everyone per day (the global ceiling). It refuses a resume past the
// resume limit (turn-status.ts), and the turn's Step ledger (step-ledger.ts) holds it to the step limit. The numbers
// are `settings` rows, edited on /admin. A day starts at midnight India time, the same rule as Spend's month (spend.ts). The dollars are
// the `usage` step rows' estimates, so the evals, the library refresh and Voyage are not counted: only the OpenAI
// project's hard limit catches those.

/**
 * What a step with no price counts as (cost_usd null, for example after a TUTOR_MODEL change): the worst step, 200,000
 * prompt tokens with a cold cache and 16,000 out (decision #13's w), so a model change cannot hide spend.
 */
export const UNPRICED_STEP_USD = 0.66;

/** Which daily cap a new turn reached. */
export type CapHit = "learner_turns" | "learner_usd" | "global_usd";

/** What the Learner reads when a cap stops a new turn: nothing was saved or sent. */
export const CAP_MESSAGES: Record<CapHit, string> = {
  learner_turns: "You have reached today's limit for the Tutor. It comes back at midnight, India time. Your Widgets still work.",
  learner_usd: "You have reached today's limit for the Tutor. It comes back at midnight, India time. Your Widgets still work.",
  global_usd: "The Tutor is paused for today: it has reached its daily limit. It comes back at midnight, India time. Your Widgets still work.",
};

/** What the Learner reads when a turn has had all its resumes (after cut-offs, or Retries after failures). */
export const RESUME_LIMIT_MESSAGE = "This reply has used all its tries, so the Tutor stops it here. Send a new message to carry on.";

/** The caps as numbers (readSettings). */
export type Caps = Awaited<ReturnType<typeof readSettings>>["caps"];

/** How much of each daily cap is used today. */
export type DailyUse = { learnerTurns: number; learnerUsd: number; globalUsd: number };

/**
 * Today's use, as of `now`. A failed turn does not count as a turn (its Retry is the same turn), and a turn counts on
 * the day its latest run started. The dollars are step rows only: a turn row repeats its steps' total.
 */
export async function dailyUse(db: Db, learnerId: number, now: Date): Promise<DailyUse> {
  const since = dayStartIst(now);
  const cost = sql`coalesce(${usageRows.costUsd}, ${UNPRICED_STEP_USD})`;
  const [[turnCount], [spent]] = await Promise.all([
    db
      .select({ n: sql`count(*)`.mapWith(Number) })
      .from(turns)
      .where(and(eq(turns.learnerId, learnerId), gte(turns.startedAt, since), ne(turns.status, "failed"))),
    db
      .select({
        learner: sql`coalesce(sum(${cost}) filter (where ${sessions.learnerId} = ${learnerId}), 0)`.mapWith(Number),
        everyone: sql`coalesce(sum(${cost}), 0)`.mapWith(Number),
      })
      .from(usageRows)
      .innerJoin(sessions, eq(usageRows.sessionId, sessions.id))
      .where(and(eq(usageRows.kind, "step"), gte(usageRows.createdAt, since))),
  ]);
  return { learnerTurns: turnCount.n, learnerUsd: spent.learner, globalUsd: spent.everyone };
}

/**
 * The daily cap a new turn would go past, or null when it may run. The owner has no per-Learner cap, but their spend
 * counts toward the global ceiling, which stops everyone. The check runs before the turn, so a Learner can go past a
 * dollar cap by one turn at most.
 */
export async function checkQuota(db: Db, learnerId: number, now: Date, given?: Caps): Promise<CapHit | null> {
  const [caps, [learner], use] = await Promise.all([given ?? readSettings(db).then((s) => s.caps), db.select().from(learners).where(eq(learners.id, learnerId)), dailyUse(db, learnerId, now)]);
  const owner = learner !== undefined && isOwnerLearner(learner);
  if (!owner && use.learnerTurns >= caps.learnerTurnsPerDay) return "learner_turns";
  if (!owner && use.learnerUsd >= caps.learnerUsdPerDay) return "learner_usd";
  if (use.globalUsd >= caps.globalUsdPerDay) return "global_usd";
  return null;
}

/** The caps the owner edits on /admin: each one's `settings` key, its words, and the values the form takes. */
export const CAP_FIELDS = [
  { key: "turns_per_learner_day", label: "Turns per Learner per day", hint: "You have no cap of your own.", dollars: false, min: 0, max: 10_000 },
  { key: "usd_per_learner_day", label: "Dollars per Learner per day", hint: "Estimated, from each step's tokens.", dollars: true, min: 0, max: 1_000 },
  { key: "usd_global_day", label: "Dollars for everyone per day", hint: "Your own turns count too. 0 pauses the Tutor.", dollars: true, min: 0, max: 10_000 },
  { key: "steps_per_turn", label: "Model steps per turn", hint: "All its runs together. The last step writes the reply.", dollars: false, min: 1, max: 100 },
  { key: "resumes_per_turn", label: "Resumes per turn", hint: "After a cut-off, or a Retry after a failure.", dollars: false, min: 0, max: 20 },
] as const;

export type CapKey = (typeof CAP_FIELDS)[number]["key"];

/** A count the form takes: whole, from 0. Dollars: from 0, to the cent at most. */
const WHOLE = /^\d+$/;
const DOLLARS = /^\d+(\.\d{1,2})?$/;

/** The caps as /admin shows them, by key, as stored. */
export async function capValues(db: Db): Promise<Record<CapKey, string>> {
  await readSettings(db);
  const rows = await db.select().from(settings);
  return Object.fromEntries(CAP_FIELDS.map((f) => [f.key, rows.find((r) => r.key === f.key)?.value ?? ""])) as Record<CapKey, string>;
}

/**
 * Saves the caps /admin sent, all or none: each a number within its field's range, whole for a count and to the cent
 * for dollars. False, with nothing saved, when any is missing or out of range.
 */
export async function saveCaps(db: Db, sent: (key: CapKey) => string | null): Promise<boolean> {
  const rows: { key: CapKey; value: string }[] = [];
  for (const field of CAP_FIELDS) {
    const text = sent(field.key)?.trim() ?? "";
    if (!(field.dollars ? DOLLARS : WHOLE).test(text) || Number(text) < field.min || Number(text) > field.max) return false;
    rows.push({ key: field.key, value: String(Number(text)) });
  }
  await db
    .insert(settings)
    .values(rows)
    .onConflictDoUpdate({ target: settings.key, set: { value: sql.raw(`excluded.${settings.value.name}`) } });
  return true;
}
