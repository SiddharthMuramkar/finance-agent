import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { learners, user as authUser } from "@/db/schema";
import type { Db } from "@/db/types";
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
});
