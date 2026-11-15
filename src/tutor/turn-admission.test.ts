import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { learners, OWNER_LEARNER_ID, settings, turns, user } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { NO_MISSED_QUIZ } from "./check-results";
import { CAP_MESSAGES } from "./quota";
import { readSettings, STALE_TAB_MESSAGE } from "./session-log";
import type { TurnInput } from "./turn";
import { admitTurn, NO_DRILL, type Refusal } from "./turn-admission";
import { BUSY_MESSAGE } from "./turn-status";

/**
 * The order of the turn admission rules (decision #30): each row sets up several reasons to refuse at once, and the
 * first rule in the order answers. A refusal saves nothing: the Learner's turns are the same after it as before.
 */

/** A reason to refuse (or, for `owner` and `cut_off`, a state a rule reads). */
type Condition = "stale" | "learner_cap" | "global_cap" | "busy" | "owner" | "cut_off";

const ADMITTED = "admitted" as const;

const rows: { name: string; input: TurnInput; when: Condition[]; answer: Refusal | typeof ADMITTED }[] = [
  { name: "a stale tab comes first", input: { drill: true }, when: ["stale", "learner_cap", "busy"], answer: { type: "stale", message: STALE_TAB_MESSAGE } },
  { name: "then the input's own refusal (no drill due)", input: { drill: true }, when: ["learner_cap", "busy"], answer: { type: "not_allowed", message: NO_DRILL } },
  { name: "then the Learner's daily cap, before the lock", input: "Hello", when: ["learner_cap", "global_cap", "busy"], answer: { type: "over_limit", message: CAP_MESSAGES.learner_turns } },
  { name: "then the global ceiling, before the lock", input: "Hello", when: ["global_cap", "busy"], answer: { type: "over_limit", message: CAP_MESSAGES.global_usd } },
  { name: "then the lock: another turn running", input: "Hello", when: ["busy"], answer: { type: "busy", message: BUSY_MESSAGE } },
  { name: "a follow-up with nothing to go over is refused after the lock, which it frees", input: { quizFollowUp: true }, when: [], answer: { type: "not_allowed", message: NO_MISSED_QUIZ } },
  { name: "a resume skips the daily caps: the turn already got in", input: { resume: true }, when: ["cut_off", "learner_cap", "global_cap"], answer: ADMITTED },
  { name: "the owner has no cap of their own", input: "Hello", when: ["owner", "learner_cap"], answer: ADMITTED },
  { name: "but the global ceiling stops the owner too", input: "Hello", when: ["owner", "global_cap"], answer: { type: "over_limit", message: CAP_MESSAGES.global_usd } },
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
  if (when.includes("owner")) {
    await db.insert(user).values({ id: "u-owner", email: "owner@x.com", name: "Siddharth", emailVerified: true });
    await db.update(learners).set({ authUserId: "u-owner" }).where(eq(learners.id, OWNER_LEARNER_ID));
  }
}

describe("turn admission", () => {
  it.each(rows)("$name", async ({ input, when, answer }) => {
    const db = await testDb();
    const now = new Date();
    await arrange(db, when, now);
    const before = await db.select().from(turns);
    const admission = await admitTurn({ db, learnerId: OWNER_LEARNER_ID, now: () => now, ...(when.includes("stale") && { shown: { topicId: "not-a-topic" } }) }, input);
    if (answer === ADMITTED) {
      expect(admission).toMatchObject({ turn: { learnerId: OWNER_LEARNER_ID, status: "running" }, alreadyFinished: false });
      return;
    }
    expect(admission).toEqual({ refusal: answer });
    expect(await db.select().from(turns)).toEqual(before);
  });
});
