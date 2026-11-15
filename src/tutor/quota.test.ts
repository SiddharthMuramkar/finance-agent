import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { learners, OWNER_LEARNER_ID, sessions, settings, turns, usageRows, user } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { checkQuota, dailyUse, UNPRICED_STEP_USD } from "./quota";
import { readSettings } from "./session-log";
import { dayStartIst } from "./spend";

/** The daily Spend caps (decision #13): what counts toward each, and which cap stops a new turn first. */

/** 12 Nov, 11:30 in India. Its day began at 18:30 UTC on 11 Nov. */
const NOW = new Date("2026-11-12T06:00:00Z");
const TODAY = "2026-11-11T18:40:00Z";
const YESTERDAY = "2026-11-11T18:20:00Z";

async function sessionFor(db: Db, learnerId: number): Promise<number> {
  const [s] = await db.insert(sessions).values({ learnerId, instructions: "i", tools: [], model: "gpt-6.1-sol", effort: "medium", fingerprint: "f" }).returning({ id: sessions.id });
  return s.id;
}

let seq = 0;
/** One usage row; a step unless `kind` says turn. `costUsd` null is an unpriced model. */
async function spent(db: Db, sessionId: number, costUsd: number | null, at: string, kind: "step" | "turn" = "step") {
  seq += 1;
  await db.insert(usageRows).values({
    sessionId,
    turnSeq: seq,
    kind,
    step: kind === "step" ? 1 : null,
    model: costUsd === null ? "gpt-unknown-9" : "gpt-6.1-sol",
    inputTokens: 1,
    outputTokens: 1,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    tools: [],
    durationMs: 1,
    costUsd,
    createdAt: new Date(at),
  });
}

async function turn(db: Db, learnerId: number, at: string, status: "finished" | "failed" | "cut_off" = "finished") {
  await db.insert(turns).values({ learnerId, status, startedAt: new Date(at) });
}

async function cap(db: Db, key: string, value: string) {
  await readSettings(db);
  await db.update(settings).set({ value }).where(eq(settings.key, key));
}

async function otherLearner(db: Db): Promise<number> {
  const [row] = await db.insert(learners).values({ name: "Asha" }).returning({ id: learners.id });
  return row.id;
}

describe("dayStartIst", () => {
  it("starts the day at midnight in India, 18:30 UTC the day before", () => {
    expect(dayStartIst(NOW).toISOString()).toBe("2026-11-11T18:30:00.000Z");
    expect(dayStartIst(new Date("2026-11-30T18:40:00Z")).toISOString()).toBe("2026-11-30T18:30:00.000Z");
    expect(dayStartIst(new Date("2026-11-30T18:20:00Z")).toISOString()).toBe("2026-11-29T18:30:00.000Z");
    expect(dayStartIst(new Date("2027-01-01T00:00:00Z")).toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });
});

describe("dailyUse", () => {
  it("counts today's turns, India time, but not a failed one or yesterday's", async () => {
    const db = await testDb();
    const asha = await otherLearner(db);
    await turn(db, OWNER_LEARNER_ID, TODAY);
    await turn(db, OWNER_LEARNER_ID, TODAY, "cut_off");
    await turn(db, OWNER_LEARNER_ID, TODAY, "failed");
    await turn(db, OWNER_LEARNER_ID, YESTERDAY);
    await turn(db, asha, TODAY);
    expect((await dailyUse(db, OWNER_LEARNER_ID, NOW)).learnerTurns).toBe(2);
  });

  it("adds today's step costs for the Learner and for everyone; a step with no price counts as the worst step", async () => {
    const db = await testDb();
    const mine = await sessionFor(db, OWNER_LEARNER_ID);
    const theirs = await sessionFor(db, await otherLearner(db));
    await spent(db, mine, 0.5, TODAY);
    await spent(db, mine, null, TODAY);
    // A turn row repeats its steps' total, and yesterday is over.
    await spent(db, mine, 0.5, TODAY, "turn");
    await spent(db, mine, 9, YESTERDAY);
    await spent(db, theirs, 1.25, TODAY);
    const use = await dailyUse(db, OWNER_LEARNER_ID, NOW);
    expect(use.learnerUsd).toBeCloseTo(0.5 + UNPRICED_STEP_USD);
    expect(use.globalUsd).toBeCloseTo(0.5 + UNPRICED_STEP_USD + 1.25);
  });
});

describe("checkQuota", () => {
  it("lets a turn run under every cap, and names the first cap reached: turns, then the Learner's dollars, then everyone's", async () => {
    const db = await testDb();
    const mine = await sessionFor(db, OWNER_LEARNER_ID);
    await turn(db, OWNER_LEARNER_ID, TODAY);
    await spent(db, mine, 2, TODAY);
    expect(await checkQuota(db, OWNER_LEARNER_ID, NOW)).toBeNull();

    await cap(db, "usd_global_day", "2");
    expect(await checkQuota(db, OWNER_LEARNER_ID, NOW)).toBe("global_usd");
    await cap(db, "usd_per_learner_day", "2");
    expect(await checkQuota(db, OWNER_LEARNER_ID, NOW)).toBe("learner_usd");
    await cap(db, "turns_per_learner_day", "1");
    expect(await checkQuota(db, OWNER_LEARNER_ID, NOW)).toBe("learner_turns");
    // Tomorrow the day's use starts again.
    expect(await checkQuota(db, OWNER_LEARNER_ID, new Date("2026-11-12T18:31:00Z"))).toBeNull();
  });

  it("gives the owner no cap of their own, but the global ceiling stops them too", async () => {
    const db = await testDb();
    await db.insert(user).values({ id: "u-owner", email: "owner@x.com", name: "Siddharth", emailVerified: true });
    await db.update(learners).set({ authUserId: "u-owner" }).where(eq(learners.id, OWNER_LEARNER_ID));
    await turn(db, OWNER_LEARNER_ID, TODAY);
    await spent(db, await sessionFor(db, OWNER_LEARNER_ID), 3, TODAY);
    await cap(db, "turns_per_learner_day", "1");
    await cap(db, "usd_per_learner_day", "1");
    expect(await checkQuota(db, OWNER_LEARNER_ID, NOW)).toBeNull();
    await cap(db, "usd_global_day", "3");
    expect(await checkQuota(db, OWNER_LEARNER_ID, NOW)).toBe("global_usd");
  });
});
