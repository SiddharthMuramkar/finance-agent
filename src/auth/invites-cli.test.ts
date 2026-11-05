import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { invites, learners, user as authUser } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { isInvited, runInvites, signupOpen } from "./invites";

function capture() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

describe("npm run invites", () => {
  it("the CLI commands", async () => {
    const db = await testDb(); // the migrations made Learner 1, named owner
    const out = capture();
    await runInvites(db, ["add", " O@x.com", "--learner", "owner", "--note", "the owner"], out.log);
    const [row] = await db.select().from(invites);
    expect(row).toMatchObject({ email: "o@x.com", learnerName: "owner", note: "the owner" });
    expect(out.lines.join("\n")).toContain("linked to Learner 1");

    await db.update(learners).set({ archivedAt: new Date() }).where(eq(learners.id, 1));
    await expect(runInvites(db, ["add", "p@x.com", "--learner", "owner"], capture().log)).rejects.toThrow(/owner/);
    expect(await isInvited(db, "p@x.com")).toBe(false);

    await runInvites(db, ["open"], capture().log);
    expect(await signupOpen(db)).toBe(true);
    await runInvites(db, ["close"], capture().log);
    expect(await signupOpen(db)).toBe(false);

    await runInvites(db, ["add", "b@x.com"], capture().log);
    await runInvites(db, ["add", "a@x.com"], capture().log);
    const listed = capture();
    await runInvites(db, ["list"], listed.log);
    const emails = listed.lines.map((l) => l.match(/\S+@\S+/)?.[0]).filter(Boolean);
    expect(emails).toEqual(["o@x.com", "b@x.com", "a@x.com"]);

    await runInvites(db, ["remove", "B@x.com"], capture().log);
    expect(await isInvited(db, "b@x.com")).toBe(false);
  });

  it("refuses to name a Learner already linked to a Google account", async () => {
    const db = await testDb();
    await db.insert(authUser).values({ id: "u1", name: "S", email: "o@x.com", emailVerified: true });
    await db.update(learners).set({ authUserId: "u1" }).where(eq(learners.id, 1));
    await expect(runInvites(db, ["add", "p@x.com", "--learner", "owner"], capture().log)).rejects.toThrow(/already linked/);
    expect(await isInvited(db, "p@x.com")).toBe(false);
  });
});
