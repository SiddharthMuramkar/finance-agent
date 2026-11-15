import { describe, expect, it } from "vitest";
import { learners, OWNER_LEARNER_ID, sessions, turns, usageRows } from "@/db/schema";
import type { Db } from "@/db/types";
import { eq } from "drizzle-orm";
import { testDb } from "@/test/pglite";
import { monthStartIst, spendByPerson } from "./spend";

const NOW = new Date("2026-11-12T06:00:00Z");

async function sessionFor(db: Db, learnerId: number): Promise<number> {
  const [s] = await db
    .insert(sessions)
    .values({ learnerId, instructions: "i", tools: [], model: "claude-opus-5-5", effort: "medium", fingerprint: "f" })
    .returning({ id: sessions.id });
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
    model: costUsd === null ? "claude-unknown-9" : "claude-opus-5-5",
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

async function turn(db: Db, learnerId: number, at: string) {
  await db.insert(turns).values({ learnerId, status: "finished", startedAt: new Date(at) });
}

describe("monthStartIst", () => {
  it("starts the month at midnight on the 1st in India, 18:30 UTC the day before", () => {
    expect(monthStartIst(NOW).toISOString()).toBe("2026-10-31T18:30:00.000Z");
    // Already 1 Dec 00:10 in India, though still 30 Nov in UTC.
    expect(monthStartIst(new Date("2026-11-30T18:40:00Z")).toISOString()).toBe("2026-11-30T18:30:00.000Z");
    expect(monthStartIst(new Date("2026-11-30T18:20:00Z")).toISOString()).toBe("2026-10-31T18:30:00.000Z");
    // January rolls back into December of the year before.
    expect(monthStartIst(new Date("2027-01-05T00:00:00Z")).toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });
});

describe("spendByPerson", () => {
  it("sums only step rows, so a finished turn's own total row is not counted twice", async () => {
    const db = await testDb();
    const [asha] = await db.insert(learners).values({ name: "Asha", clerkUserId: "user_asha" }).returning();
    const s = await sessionFor(db, asha.id);
    await spent(db, s, 0.25, "2026-11-10T10:00:00Z");
    await spent(db, s, 0.5, "2026-11-10T10:00:01Z");
    await spent(db, s, 0.75, "2026-11-10T10:00:02Z", "turn");

    const { people } = await spendByPerson(db, NOW);
    expect(people.find((p) => p.userId === "user_asha")).toMatchObject({ allTimeUsd: 0.75, monthUsd: 0.75, unpricedSteps: 0 });
  });

  it("adds up every Learner a Clerk user has had, archived ones included, under their active Learner's name", async () => {
    const db = await testDb();
    const [old] = await db.insert(learners).values({ name: "Ravi", clerkUserId: "user_ravi", archivedAt: new Date("2026-11-05T00:00:00Z") }).returning();
    const [fresh] = await db.insert(learners).values({ name: "Ravi (2)", clerkUserId: "user_ravi" }).returning();
    await spent(db, await sessionFor(db, old.id), 1, "2026-11-01T10:00:00Z");
    await spent(db, await sessionFor(db, fresh.id), 2, "2026-11-08T10:00:00Z");
    await turn(db, old.id, "2026-11-01T10:00:00Z");
    await turn(db, fresh.id, "2026-11-08T10:00:00Z");
    await turn(db, fresh.id, "2026-11-09T10:00:00Z");

    const { people } = await spendByPerson(db, NOW);
    const ravi = people.filter((p) => p.userId === "user_ravi");
    expect(ravi).toHaveLength(1);
    expect(ravi[0]).toMatchObject({ name: "Ravi (2)", allTimeUsd: 3, monthUsd: 3, turns: 3 });
    expect(ravi[0].lastActiveAt?.toISOString()).toBe("2026-11-09T10:00:00.000Z");
  });

  it("uses their newest Learner's name when every Learner of theirs is archived", async () => {
    const db = await testDb();
    await db.insert(learners).values({ name: "Mia", clerkUserId: "user_mia", archivedAt: new Date("2026-11-01T00:00:00Z") });
    await db.insert(learners).values({ name: "Mia (2)", clerkUserId: "user_mia", archivedAt: new Date("2026-11-05T00:00:00Z") });
    const { people } = await spendByPerson(db, NOW);
    expect(people.find((p) => p.userId === "user_mia")?.name).toBe("Mia (2)");
  });

  it("splits this month from all time at midnight on the 1st, India time", async () => {
    const db = await testDb();
    const [asha] = await db.insert(learners).values({ name: "Asha", clerkUserId: "user_asha" }).returning();
    const s = await sessionFor(db, asha.id);
    await spent(db, s, 1, "2026-10-31T18:29:59Z"); // 23:59:59 on 31 Oct in India: October
    await spent(db, s, 2, "2026-10-31T18:30:00Z"); // 00:00 on 1 Nov in India: November

    const { people } = await spendByPerson(db, NOW);
    expect(people.find((p) => p.userId === "user_asha")).toMatchObject({ monthUsd: 2, allTimeUsd: 3 });
  });

  it("lists a Clerk user who spent nothing at $0", async () => {
    const db = await testDb();
    await db.insert(learners).values({ name: "New", clerkUserId: "user_new" });
    const { people } = await spendByPerson(db, NOW);
    expect(people.find((p) => p.userId === "user_new")).toMatchObject({ allTimeUsd: 0, monthUsd: 0, turns: 0, unpricedSteps: 0, lastActiveAt: null });
  });

  it("puts Learners with no Clerk user (from before Clerk, the test tools, passcodes) in their own bucket, and counts them in the total", async () => {
    const db = await testDb();
    const [tools] = await db.insert(learners).values({ name: "tools" }).returning();
    await spent(db, await sessionFor(db, tools.id), 0.3, "2026-11-11T10:00:00Z");
    await turn(db, tools.id, "2026-11-11T10:00:00Z");
    const [asha] = await db.insert(learners).values({ name: "Asha", clerkUserId: "user_asha" }).returning();
    await spent(db, await sessionFor(db, asha.id), 0.2, "2026-10-20T10:00:00Z");

    const report = await spendByPerson(db, NOW);
    expect(report.people.map((p) => p.userId)).toEqual(["user_asha"]);
    expect(report.unlinked).toMatchObject({ allTimeUsd: 0.3, monthUsd: 0.3, turns: 1 });
    expect(report.total).toMatchObject({ allTimeUsd: 0.5, monthUsd: 0.3, turns: 1 });
    expect(report.total.lastActiveAt?.toISOString()).toBe("2026-11-11T10:00:00.000Z");
  });

  it("has no unlinked bucket when no Learner without a Clerk user has done anything", async () => {
    const db = await testDb();
    expect((await spendByPerson(db, NOW)).unlinked).toBeNull();
  });

  it("counts steps of an unpriced model instead of guessing their cost", async () => {
    const db = await testDb();
    const [asha] = await db.insert(learners).values({ name: "Asha", clerkUserId: "user_asha" }).returning();
    const s = await sessionFor(db, asha.id);
    await spent(db, s, null, "2026-11-10T10:00:00Z");
    await spent(db, s, 0.1, "2026-11-10T10:00:01Z");
    const { people, total } = await spendByPerson(db, NOW);
    expect(people.find((p) => p.userId === "user_asha")).toMatchObject({ unpricedSteps: 1, allTimeUsd: 0.1 });
    expect(total.unpricedSteps).toBe(1);
  });

  it("lists the most spent this month first, then all time, then by Clerk user id", async () => {
    const db = await testDb();
    await db.update(learners).set({ clerkUserId: "user_owner" }).where(eq(learners.id, OWNER_LEARNER_ID));
    const [a] = await db.insert(learners).values({ name: "A", clerkUserId: "user_a" }).returning();
    const [b] = await db.insert(learners).values({ name: "B", clerkUserId: "user_b" }).returning();
    await db.insert(learners).values([
      { name: "D", clerkUserId: "user_d" },
      { name: "C", clerkUserId: "user_c" },
    ]);
    await spent(db, await sessionFor(db, OWNER_LEARNER_ID), 0.1, "2026-11-10T10:00:00Z");
    await spent(db, await sessionFor(db, a.id), 5, "2026-10-10T10:00:00Z"); // all of it last month
    await spent(db, await sessionFor(db, b.id), 1, "2026-11-10T10:00:00Z");

    const { people } = await spendByPerson(db, NOW);
    expect(people.map((p) => p.userId)).toEqual(["user_b", "user_owner", "user_a", "user_c", "user_d"]);
    expect(people.find((p) => p.userId === "user_owner")).toMatchObject({ name: "owner" });
  });
});
