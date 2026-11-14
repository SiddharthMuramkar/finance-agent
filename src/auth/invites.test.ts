import { describe, expect, it } from "vitest";
import { invites } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { addInvite, isInvited, removeInvite } from "./invites";

describe("invites", () => {
  it("emails are compared lowercase", async () => {
    const db = await testDb();
    await addInvite(db, "  Rahul@Gmail.COM ");
    expect((await db.select().from(invites)).map((r) => r.email)).toEqual(["rahul@gmail.com"]);
    expect(await isInvited(db, "RAHUL@gmail.com")).toBe(true);
    await addInvite(db, "rahul@gmail.com");
    expect(await db.select().from(invites)).toHaveLength(1);
    await removeInvite(db, " RAHUL@gmail.com");
    expect(await isInvited(db, "rahul@gmail.com")).toBe(false);
  });
});
