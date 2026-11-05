import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { learners, topicProgress, user as authUser } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { learnerForAuthUser } from "./google-learner";
import { addInvite } from "./invites";

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
});
