import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accessDenials, learners, user as authUser } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { accountFor } from "./account";

describe("accountFor (the header's account menu and the Settings Account card)", () => {
  it("a Google-linked Learner shows their Google email", async () => {
    const db = await testDb();
    await db.insert(authUser).values({ id: "u1", email: "asha@example.com", name: "Asha G", emailVerified: true });
    const [learner] = await db.insert(learners).values({ name: "Asha", authUserId: "u1" }).returning();
    expect(await accountFor(db, learner)).toEqual({ name: "Asha", email: "asha@example.com" });
  });

  it("a passcode Learner (no linked user) has no email, so Settings says Signed in with a passcode", async () => {
    const db = await testDb();
    const [learner] = await db.insert(learners).values({ name: "Ravi" }).returning();
    expect(await accountFor(db, learner)).toEqual({ name: "Ravi" });
  });

  it("only the owner's account carries the waiting count, even when nobody waits", async () => {
    const db = await testDb();
    await db.insert(authUser).values({ id: "u-owner", email: "owner@example.com", name: "Siddharth", emailVerified: true });
    // Learner 1 (the migrations make it, named owner), linked to the owner's account as `invites add <email> --learner owner` does.
    const [owner] = await db.update(learners).set({ authUserId: "u-owner" }).where(eq(learners.name, "owner")).returning();
    expect(await accountFor(db, owner)).toEqual({ name: "owner", email: "owner@example.com", admin: { waiting: 0 } });

    // Two strangers signed in and wait; a third was denied, so they no longer count.
    await db.insert(authUser).values([
      { id: "w1", email: "noor@icloud.com", name: "Noor", emailVerified: true },
      { id: "w2", email: "ravi@gmail.com", name: "Ravi", emailVerified: true },
      { id: "d1", email: "spam@x.com", name: "Spam", emailVerified: true },
    ]);
    await db.insert(accessDenials).values({ userId: "d1" });
    expect((await accountFor(db, owner)).admin).toEqual({ waiting: 2 });
  });

  it("nobody else gets the Admin row: another account, a Learner named owner (2), or the tools passcode Learner", async () => {
    const db = await testDb();
    await db.insert(authUser).values([
      { id: "u1", email: "asha@example.com", name: "Asha", emailVerified: true },
      { id: "u2", email: "o2@example.com", name: "owner", emailVerified: true },
    ]);
    const [asha] = await db.insert(learners).values({ name: "Asha", authUserId: "u1" }).returning();
    const [owner2] = await db.insert(learners).values({ name: "owner (2)", authUserId: "u2" }).returning();
    const [tools] = await db.insert(learners).values({ name: "tools" }).returning();
    for (const learner of [asha, owner2, tools]) expect(await accountFor(db, learner), learner.name).not.toHaveProperty("admin");
  });
});
