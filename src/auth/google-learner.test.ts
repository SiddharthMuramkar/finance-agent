import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { learners, topicProgress, user as authUser } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { learnerForAuthUser } from "./google-learner";
import { addInvite, setSignupOpen } from "./invites";
import { signInAs, startOver } from "./learners";

type GoogleUser = { id: string; email: string; name: string };

/** A Google user as Better Auth has stored it (the gate let it through). */
async function googleUser(db: Db, u: GoogleUser): Promise<GoogleUser> {
  await db.insert(authUser).values({ ...u, emailVerified: true });
  return u;
}

describe("learnerForAuthUser", () => {
  it("invited email makes a Learner", async () => {
    const db = await testDb();
    await addInvite(db, "a@x.com");
    const u = await googleUser(db, { id: "u1", email: "a@x.com", name: "Asha" });
    const first = await learnerForAuthUser(db, u);
    expect(first).toMatchObject({ name: "Asha", authUserId: "u1" });
    const again = await learnerForAuthUser(db, u);
    expect(again?.id).toBe(first?.id);
    expect(await db.select().from(learners).where(eq(learners.authUserId, "u1"))).toHaveLength(1);
  });

  it("the owner's invite links Learner 1", async () => {
    const db = await testDb();
    // The migrations made Learner 1, named owner; give it 3 Topics of progress.
    await db.insert(topicProgress).values(
      ["num-percent", "num-compounding", "num-probability"].map((topicId) => ({ learnerId: 1, topicId, step: "story", status: "in_progress" as const })),
    );
    const before = await loadProgress(db, 1);
    await addInvite(db, "o@x.com", { learnerName: "owner" });
    const u = await googleUser(db, { id: "u1", email: "o@x.com", name: "Siddharth" });
    const learner = await learnerForAuthUser(db, u);
    expect(learner?.id).toBe(1);
    expect(learner?.authUserId).toBe("u1");
    const after = await loadProgress(db, 1);
    expect(Object.keys(after.topics)).toHaveLength(3);
    expect(after).toEqual(before);
    expect(await db.select().from(learners)).toHaveLength(1);
  });

  it("a second Google account cannot take the owner's Learner", async () => {
    const db = await testDb();
    await addInvite(db, "o@x.com", { learnerName: "owner" });
    await addInvite(db, "p@x.com", { learnerName: "owner" });
    const owner = await googleUser(db, { id: "u1", email: "o@x.com", name: "Siddharth" });
    expect((await learnerForAuthUser(db, owner))?.id).toBe(1);
    const other = await googleUser(db, { id: "u2", email: "p@x.com", name: "Priya" });
    expect(await learnerForAuthUser(db, other)).toBeNull();
    const [one] = await db.select().from(learners).where(eq(learners.id, 1));
    expect(one.authUserId).toBe("u1");
    expect(await db.select().from(learners)).toHaveLength(1);
  });

  it("not invited and closed gives nothing", async () => {
    const db = await testDb();
    await setSignupOpen(db, false);
    const before = await learnerCount(db);
    const u = await googleUser(db, { id: "u9", email: "stranger@x.com", name: "Stranger" });
    expect(await learnerForAuthUser(db, u)).toBeNull();
    expect(await learnerCount(db)).toBe(before);
  });

  it("open lets anyone in", async () => {
    const db = await testDb();
    await setSignupOpen(db, true);
    const u = await googleUser(db, { id: "u9", email: "stranger@x.com", name: "Stranger" });
    expect(await learnerForAuthUser(db, u)).toMatchObject({ name: "Stranger", authUserId: "u9" });
  });

  it("same display name, two people", async () => {
    const db = await testDb();
    const tools = await signInAs(db, "tools");
    for (const email of ["a1@x.com", "a2@x.com", "o@x.com", "t@x.com"]) await addInvite(db, email);
    const a1 = await learnerForAuthUser(db, await googleUser(db, { id: "u1", email: "a1@x.com", name: "Asha" }));
    const a2 = await learnerForAuthUser(db, await googleUser(db, { id: "u2", email: "a2@x.com", name: "Asha" }));
    expect(a1?.name).toBe("Asha");
    expect(a2?.name).toBe("Asha (2)");
    expect(a1?.id).not.toBe(a2?.id);
    for (const l of [a1, a2]) expect([1, tools.id]).not.toContain(l?.id);
    const owner = await learnerForAuthUser(db, await googleUser(db, { id: "u3", email: "o@x.com", name: "Owner" }));
    expect(owner?.name).toBe("Owner (2)");
    expect(owner?.id).not.toBe(1);
    const t = await learnerForAuthUser(db, await googleUser(db, { id: "u4", email: "t@x.com", name: "tools" }));
    expect(t?.name).toBe("tools (2)");
    expect(t?.id).not.toBe(tools.id);
  });

  it("an archived Learner is not returned; Start over keeps the link", async () => {
    const db = await testDb();
    await addInvite(db, "a@x.com");
    const u = await googleUser(db, { id: "u1", email: "a@x.com", name: "Asha" });
    const first = (await learnerForAuthUser(db, u))!;
    await db.update(learners).set({ archivedAt: new Date() }).where(eq(learners.id, first.id));
    const second = (await learnerForAuthUser(db, u))!;
    expect(second.id).not.toBe(first.id);
    expect(second.authUserId).toBe("u1");

    const fresh = (await startOver(db, second.id))!;
    expect(fresh.id).not.toBe(second.id);
    expect(fresh.authUserId).toBe("u1");
    const [old] = await db.select().from(learners).where(eq(learners.id, second.id));
    expect(old.archivedAt).not.toBeNull();
    expect(old.authUserId).toBe("u1");
    expect((await learnerForAuthUser(db, u))?.id).toBe(fresh.id);

    await expect(db.insert(learners).values({ name: "Someone else", authUserId: "u1" })).rejects.toThrow();
  });

  it("two first requests at once make one Learner", async () => {
    const db = await testDb();
    await addInvite(db, "a@x.com");
    const u = await googleUser(db, { id: "u1", email: "a@x.com", name: "Asha" });
    const got = await Promise.all(Array.from({ length: 5 }, () => learnerForAuthUser(db, u)));
    const { rows } = (await db.execute(sql`select count(*)::int as n from learners where auth_user_id = 'u1'`)) as unknown as { rows: { n: number }[] };
    expect(rows[0].n).toBe(1);
    expect(new Set(got.map((l) => l?.id)).size).toBe(1);
  });

  it("two first requests at once for the owner's invite link Learner 1 once", async () => {
    const db = await testDb();
    await addInvite(db, "o@x.com", { learnerName: "owner" });
    const u = await googleUser(db, { id: "u1", email: "o@x.com", name: "Siddharth" });
    const got = await Promise.all(Array.from({ length: 5 }, () => learnerForAuthUser(db, u)));
    expect(got.map((l) => l?.id)).toEqual([1, 1, 1, 1, 1]);
    expect(await db.select().from(learners)).toHaveLength(1);
  });
});

async function learnerCount(db: Db): Promise<number> {
  const { rows } = (await db.execute(sql`select count(*)::int as n from learners`)) as unknown as { rows: { n: number }[] };
  return rows[0].n;
}
