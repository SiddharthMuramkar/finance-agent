import { eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { learners } from "./schema";
import type { Db } from "./types";
import { migrateToLatest, testDb, testDbThrough } from "@/test/pglite";

/**
 * The Clerk expand step (issue #33): `learners.clerk_user_id`, with at most one active Learner per Clerk user. Clerk
 * replaces Better Auth later; until then the column is only added, and every Better Auth table and `auth_user_id` stay.
 */

/** The unique-violation Postgres raises, wherever the driver wraps it (Drizzle puts it under `cause`). */
async function refusedBy(write: Promise<unknown>): Promise<string> {
  const error = await write.then(
    () => undefined,
    (e: unknown) => e as { message?: string; cause?: { message?: string } },
  );
  expect(error, "the write was refused").toBeDefined();
  return `${error?.message ?? ""} ${error?.cause?.message ?? ""}`;
}

const learnerWith = (db: Db, name: string, clerkUserId: string | null) => db.insert(learners).values({ name, clerkUserId }).returning();

describe("database: learners.clerk_user_id (issue #33)", () => {
  it("refuses a second active Learner for the same Clerk user", async () => {
    const db = await testDb();
    await learnerWith(db, "ana", "user_clerk_1");
    expect(await refusedBy(learnerWith(db, "ana-again", "user_clerk_1"))).toMatch(/learners_one_active_per_clerk_user/);
  });

  it("allows an archived Learner and an active one for the same Clerk user (Start over)", async () => {
    const db = await testDb();
    const [old] = await learnerWith(db, "ben", "user_clerk_2");
    await db.update(learners).set({ archivedAt: new Date() }).where(eq(learners.id, old.id));
    const [fresh] = await learnerWith(db, "ben-fresh", "user_clerk_2");
    const rows = await db.select({ id: learners.id, archivedAt: learners.archivedAt }).from(learners).where(eq(learners.clerkUserId, "user_clerk_2"));
    expect(rows.map((r) => [r.id, r.archivedAt === null])).toEqual([
      [old.id, false],
      [fresh.id, true],
    ]);
  });

  it("allows any number of Learners with no Clerk user", async () => {
    const db = await testDb();
    const names = ["passcode-1", "passcode-2", "passcode-3"];
    for (const name of names) await learnerWith(db, name, null);
    const rows = await db.select({ name: learners.name, clerk: learners.clerkUserId }).from(learners).where(inArray(learners.name, names));
    expect(rows.map((r) => [r.name, r.clerk]).sort()).toEqual(names.map((name) => [name, null]));
  });

  it("is an expand step: every Learner from before is kept, with no Clerk user", async () => {
    const db = await testDbThrough("0038_turn_runs");
    await db.execute(sql`insert into learners (name) values ('before-clerk')`);
    const before = (await db.execute(sql`select id, name, auth_user_id from learners order by id`)) as unknown as { rows: { id: number; name: string; auth_user_id: string | null }[] };
    await migrateToLatest(db);
    const after = await db.select({ id: learners.id, name: learners.name, authUserId: learners.authUserId, clerkUserId: learners.clerkUserId }).from(learners).orderBy(learners.id);
    expect(after.map(({ id, name, authUserId }) => ({ id, name, auth_user_id: authUserId }))).toEqual(before.rows);
    expect(after.map((r) => r.name)).toContain("before-clerk");
    expect(after.every((r) => r.clerkUserId === null)).toBe(true);
  });
});
