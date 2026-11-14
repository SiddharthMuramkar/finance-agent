import { spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accessDenials, account, invites, learners, user as authUser } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { accessFor } from "./access";
import { learnerForAuthUser } from "./google-learner";
import { INVITES_USAGE, isInvited, runInvites, signupOpen } from "./invites";

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

  it("re-adding an invited email with --learner links it, and the message says what happened", async () => {
    const db = await testDb();
    await runInvites(db, ["add", "o@x.com"], capture().log);
    const linked = capture();
    await runInvites(db, ["add", "o@x.com", "--learner", "owner"], linked.log);
    expect(await db.select().from(invites)).toEqual([expect.objectContaining({ email: "o@x.com", learnerName: "owner" })]);
    expect(linked.lines).toEqual(['o@x.com was already invited; it is now linked to Learner 1 ("owner").']);

    const again = capture();
    await runInvites(db, ["add", "o@x.com", "--learner", "owner"], again.log);
    expect(again.lines).toEqual(['o@x.com was already invited, linked to Learner 1 ("owner"): nothing changed.']);

    const plain = capture();
    await runInvites(db, ["add", "O@x.com"], plain.log);
    expect(plain.lines).toEqual(["o@x.com was already invited: nothing changed."]);
    expect((await db.select().from(invites))[0].learnerName).toBe("owner");
  });

  // F2p2: once the email has signed up through its open invite, learnerForAuthUser returns that user's own Learner
  // first and never reads invite.learnerName, so a --learner re-add could never link it. Refuse and say why.
  it("refuses --learner on an invite whose email already signed up, and changes nothing", async () => {
    const db = await testDb();
    await db.insert(learners).values({ name: "Bob" });
    await runInvites(db, ["add", "a@x.com"], capture().log);
    await db.insert(authUser).values({ id: "ua", name: "Asha", email: "a@x.com", emailVerified: true });
    const made = await learnerForAuthUser(db, { id: "ua", email: "a@x.com", name: "Asha" });
    await expect(runInvites(db, ["add", "A@x.com", "--learner", "Bob"], capture().log)).rejects.toThrow(
      `a@x.com already signed up as Learner ${made!.id} ("${made!.name}"): the invite cannot link it to "Bob". Nothing was changed.`,
    );
    expect((await db.select().from(invites))[0].learnerName).toBeNull();
    expect((await learnerForAuthUser(db, { id: "ua", email: "a@x.com", name: "Asha" }))!.id).toBe(made!.id);
  });

  it("refuses to relink an invite already linked to another Learner, and changes nothing", async () => {
    const db = await testDb();
    await db.insert(learners).values({ name: "second" });
    await runInvites(db, ["add", "o@x.com", "--learner", "second"], capture().log);
    await expect(runInvites(db, ["add", "o@x.com", "--learner", "owner"], capture().log)).rejects.toThrow(/already invited and linked to "second"/);
    expect((await db.select().from(invites))[0].learnerName).toBe("second");
  });

  // ADR 0014: anyone may sign in and then waits; `waiting` lists them, as /admin's Waiting section does.
  it("waiting lists the people waiting for approval, oldest first, with how each signed in", async () => {
    const db = await testDb();
    const at = (minute: number) => new Date(Date.UTC(2026, 10, 10, 9, minute));
    await db.insert(authUser).values([
      { id: "ug", name: "Asha G", email: "asha@gmail.com", emailVerified: true, createdAt: at(1) },
      { id: "ue", name: "Noor", email: "noor@icloud.com", emailVerified: true, createdAt: at(0) },
      { id: "ui", name: "Ivy", email: "ivy@x.com", emailVerified: true, createdAt: at(2) },
      { id: "ud", name: "Dan", email: "dan@x.com", emailVerified: true, createdAt: at(3) },
    ]);
    await db.insert(account).values({ id: "a1", accountId: "google-sub-1", providerId: "google", userId: "ug", updatedAt: at(1) });
    // Ivy was invited and has been in since; Dan was denied. Neither waits.
    await runInvites(db, ["add", "ivy@x.com"], capture().log);
    expect((await accessFor(db, { id: "ui", email: "ivy@x.com", name: "Ivy" })).state).toBe("approved");
    await db.insert(accessDenials).values({ userId: "ud" });

    const out = capture();
    await runInvites(db, ["waiting"], out.log);
    expect(out.lines).toEqual([
      "noor@icloud.com  Noor  email link  asked 2026-11-10",
      "asha@gmail.com  Asha G  Google  asked 2026-11-10",
      "2 waiting. Approve or deny them on /admin, or let one in here: npm run invites -- add <email>",
    ]);
  });

  it("waiting says so when nobody is waiting", async () => {
    const out = capture();
    await runInvites(await testDb(), ["waiting"], out.log);
    expect(out.lines).toEqual(["Nobody is waiting."]);
  });

  // ADR 0014 replaces ADR 0011's lock-out order (remove the invite, close sign-up, archive): one denial on /admin does it.
  it("remove says the invite alone takes no access away, and points to Remove access on /admin", async () => {
    const db = await testDb();
    await runInvites(db, ["add", "a@x.com"], capture().log);
    const removed = capture();
    await runInvites(db, ["remove", "A@x.com"], removed.log);
    expect(removed.lines).toEqual(["Removed a@x.com. Anyone who already got in with it keeps their access: to take it away, use Remove access on /admin."]);
    const again = capture();
    await runInvites(db, ["remove", "a@x.com"], again.log);
    expect(again.lines).toEqual(["a@x.com was not on the list."]);
  });

  it("open and close say who gets in, and that people denied on /admin stay out", async () => {
    const db = await testDb();
    const opened = capture();
    await runInvites(db, ["open"], opened.log);
    expect(opened.lines).toEqual(["Sign-up is open: anyone who signs in with Google or an email link gets in at once. People you denied on /admin stay out."]);
    const listedOpen = capture();
    await runInvites(db, ["list"], listedOpen.log);
    expect(listedOpen.lines.at(-1)).toBe("0 invite(s). Sign-up is open (anyone who signs in gets in).");

    const closed = capture();
    await runInvites(db, ["close"], closed.log);
    expect(closed.lines).toEqual(["Sign-up is closed: invited emails get in at once; everyone else waits for you to approve them on /admin."]);
    const listedClosed = capture();
    await runInvites(db, ["list"], listedClosed.log);
    expect(listedClosed.lines.at(-1)).toBe("0 invite(s). Sign-up is closed (invited emails get in; everyone else waits for /admin).");
  });

  it("the usage lists waiting and no longer describes the old lock-out order", () => {
    expect(INVITES_USAGE).toMatch(/^ {2}waiting {2,}\S/m);
    expect(INVITES_USAGE).toContain("Remove access on /admin");
    expect(INVITES_USAGE).not.toMatch(/archive/i);
    expect(INVITES_USAGE).not.toMatch(/anyone with Google/);
  });
});

// scripts/invites.mjs runs src/auth/invites.ts with plain Node's type stripping, which reads no tsconfig: no `@/`
// paths, and every relative import needs its extension. Vitest resolves both, so only a real Node run catches a slip.
describe("scripts/invites.mjs under plain Node", () => {
  const node = (args: string[]) => spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: "utf8" });

  it("loads and prints its usage", () => {
    const run = node(["scripts/invites.mjs"]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Usage: npm run invites -- <command>");
    expect(run.stderr).toMatch(/^ {2}waiting /m);
  });

  it("can load the access module its waiting command reads", () => {
    const run = node(["--input-type=module", "-e", "await import('./src/auth/access.ts');"]);
    expect(run.stderr).not.toMatch(/ERR_MODULE_NOT_FOUND|Cannot find/);
    expect(run.status).toBe(0);
  });
});
