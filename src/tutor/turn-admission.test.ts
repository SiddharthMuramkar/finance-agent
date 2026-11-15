import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { OWNER_LEARNER_ID, settings, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { NO_MISSED_QUIZ } from "./check-results";
import { CAP_MESSAGES, RESUME_LIMIT_MESSAGE } from "./quota";
import { readSettings, STALE_TAB_MESSAGE } from "./session-log";
import type { TurnInput } from "./turn";
import { admitTurn, NO_DRILL, type Refusal } from "./turn-admission";
import { BUSY_MESSAGE } from "./turn-status";

/**
 * The order of the turn admission rules (decision #30): each row sets up several reasons to refuse at once, and the
 * first rule in the order answers. A refusal saves nothing: the Learner's turns are the same after it as before.
 */

/**
 * A reason to refuse, or a state a rule reads: `cut_off` is a turn to resume with both its resumes left, `resumed_twice`
 * one that has had them (3 runs), `no_limits` the evals' turn.
 */
type Condition = "stale" | "learner_cap" | "global_cap" | "busy" | "admin" | "cut_off" | "resumed_twice" | "no_limits";

const ADMITTED = "admitted" as const;

const rows: { name: string; input: TurnInput; when: Condition[]; answer: Refusal | typeof ADMITTED; stepLimit?: number }[] = [
  { name: "a stale tab comes first", input: { drill: true }, when: ["stale", "learner_cap", "busy"], answer: { type: "stale", message: STALE_TAB_MESSAGE } },
  { name: "then the input's own refusal (no drill due)", input: { drill: true }, when: ["learner_cap", "busy"], answer: { type: "not_allowed", message: NO_DRILL } },
  { name: "then the Learner's daily cap, before the lock", input: "Hello", when: ["learner_cap", "global_cap", "busy"], answer: { type: "over_limit", message: CAP_MESSAGES.learner_turns } },
  { name: "then the global ceiling, before the lock", input: "Hello", when: ["global_cap", "busy"], answer: { type: "over_limit", message: CAP_MESSAGES.global_usd } },
  { name: "then the lock: another turn running", input: "Hello", when: ["busy"], answer: { type: "busy", message: BUSY_MESSAGE } },
  { name: "a follow-up with nothing to go over is refused after the lock, which it frees", input: { quizFollowUp: true }, when: [], answer: { type: "not_allowed", message: NO_MISSED_QUIZ } },
  { name: "a resume skips the daily caps: the turn already got in", input: { resume: true }, when: ["cut_off", "learner_cap", "global_cap"], answer: ADMITTED },
  { name: "a resume past the resume limit is refused, whatever the daily caps", input: { resume: true }, when: ["resumed_twice", "learner_cap"], answer: { type: "over_limit", message: RESUME_LIMIT_MESSAGE } },
  { name: "the evals' turn has no limits: no daily cap, no resume limit, no step limit", input: { resume: true }, when: ["resumed_twice", "global_cap", "no_limits"], answer: ADMITTED, stepLimit: Infinity },
  { name: "the evals' new turn passes the daily caps too", input: "Hello", when: ["learner_cap", "global_cap", "no_limits"], answer: ADMITTED, stepLimit: Infinity },
  { name: "the admin (identity.admin) has no cap of their own", input: "Hello", when: ["admin", "learner_cap"], answer: ADMITTED },
  { name: "but the global ceiling stops the admin too", input: "Hello", when: ["admin", "global_cap"], answer: { type: "over_limit", message: CAP_MESSAGES.global_usd } },
];

async function cap(db: Db, key: string, value: string) {
  await readSettings(db);
  await db.update(settings).set({ value }).where(eq(settings.key, key));
}

async function arrange(db: Db, when: Condition[], now: Date) {
  if (when.includes("learner_cap")) await cap(db, "turns_per_learner_day", "0");
  if (when.includes("global_cap")) await cap(db, "usd_global_day", "0");
  if (when.includes("busy")) await db.insert(turns).values({ learnerId: OWNER_LEARNER_ID, status: "running", startedAt: now, input: "Earlier" });
  if (when.includes("cut_off")) await db.insert(turns).values({ learnerId: OWNER_LEARNER_ID, status: "cut_off", startedAt: now, input: "Earlier" });
  if (when.includes("resumed_twice")) await db.insert(turns).values({ learnerId: OWNER_LEARNER_ID, status: "cut_off", startedAt: now, input: "Earlier", runs: 3 });
}

describe("turn admission", () => {
  it.each(rows)("$name", async ({ input, when, answer, stepLimit = 10 }) => {
    const db = await testDb();
    const now = new Date();
    await arrange(db, when, now);
    const before = await db.select().from(turns);
    const deps = { db, learnerId: OWNER_LEARNER_ID, admin: when.includes("admin"), now: () => now, noLimits: when.includes("no_limits"), ...(when.includes("stale") && { shown: { topicId: "not-a-topic" } }) };
    const admission = await admitTurn(deps, input);
    if (answer === ADMITTED) {
      // A resume is one more run of the same turn.
      const runs = when.includes("resumed_twice") ? 4 : when.includes("cut_off") ? 2 : 1;
      expect(admission).toMatchObject({ turn: { learnerId: OWNER_LEARNER_ID, status: "running", runs }, alreadyFinished: false, stepLimit });
      return;
    }
    expect(admission).toEqual({ refusal: answer });
    expect(await db.select().from(turns)).toEqual(before);
  });
});
