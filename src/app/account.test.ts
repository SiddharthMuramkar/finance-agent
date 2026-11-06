import { describe, expect, it } from "vitest";
import { learners, user as authUser } from "@/db/schema";
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
});
