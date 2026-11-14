import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accessDenials, account, invites, learners, session, topicProgress, user } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { testDb } from "@/test/pglite";
import { accessFor, approveAccess, deniedPeople, denyAccess, isOwnerLearner, pendingInvites, peopleWithAccess, waitingCount, waitingRequests } from "./access";
import { addInvite, setSignupOpen } from "./invites";
import { startOver } from "./learners";

type Person = { id: string; email: string; name: string };

/** A Better Auth `user`, as a verified Google or email-link sign-in leaves it; with Google it also has an `account` row. */
async function signedUp(db: Db, p: Person, via: "google" | "email-link" = "google", createdAt = new Date()): Promise<Person> {
  await db.insert(user).values({ ...p, emailVerified: true, createdAt });
  if (via === "google") await db.insert(account).values({ id: `acc-${p.id}`, accountId: `g-${p.id}`, providerId: "google", userId: p.id, updatedAt: new Date() });
  return p;
}

/** One signed-in browser for this user (Better Auth's `session` row). */
async function sessionFor(db: Db, userId: string) {
  await db.insert(session).values({ id: `s-${userId}-${Math.random()}`, token: `t-${Math.random()}`, userId, expiresAt: new Date(Date.now() + 86_400_000), updatedAt: new Date() });
}

const sessionsOf = async (db: Db, userId: string) => (await db.select().from(session).where(eq(session.userId, userId))).length;

const asha = { id: "u-asha", email: "asha@x.com", name: "Asha" };
const noor = { id: "u-noor", email: "noor@icloud.com", name: "noor" };
const owner = { id: "u-owner", email: "owner@x.com", name: "Siddharth" };

/** The owner as step 5 of the setup links them: an invite naming Learner 1, then their first sign-in. */
async function linkedOwner(db: Db) {
  await addInvite(db, owner.email, { learnerName: "owner" });
  await signedUp(db, owner);
  const access = await accessFor(db, owner);
  if (access.state !== "approved") throw new Error("the owner was not let in");
  return access.learner;
}

describe("accessFor: denied first, then approved, else waiting", () => {
  it("a verified stranger waits: no Learner, listed once, counted", async () => {
    const db = await testDb();
    await setSignupOpen(db, false);
    const before = (await db.select().from(learners)).length;
    await signedUp(db, noor, "email-link");
    expect(await accessFor(db, noor)).toEqual({ state: "waiting" });
    expect(await accessFor(db, noor)).toEqual({ state: "waiting" });
    expect((await db.select().from(learners)).length).toBe(before);
    expect(await waitingRequests(db)).toEqual([{ userId: noor.id, name: "noor", email: noor.email, via: "email-link", requestedAt: expect.any(Date) }]);
    expect(await waitingCount(db)).toBe(1);
  });

  it("an invited email never waits", async () => {
    const db = await testDb();
    await addInvite(db, "Asha@X.com");
    await signedUp(db, asha);
    const access = await accessFor(db, asha);
    expect(access).toMatchObject({ state: "approved", learner: { name: "Asha", authUserId: asha.id } });
    expect(await waitingRequests(db)).toEqual([]);
    expect(await waitingCount(db)).toBe(0);
  });

  it("the open switch lets a waiting person in on their next request", async () => {
    const db = await testDb();
    await signedUp(db, noor, "email-link");
    expect((await accessFor(db, noor)).state).toBe("waiting");
    await setSignupOpen(db, true);
    expect((await accessFor(db, noor)).state).toBe("approved");
    expect(await waitingCount(db)).toBe(0);
  });

  it("lists the waiting oldest first, with how each signed in", async () => {
    const db = await testDb();
    await signedUp(db, noor, "email-link", new Date("2026-11-02T10:00:00Z"));
    await signedUp(db, asha, "google", new Date("2026-11-01T10:00:00Z"));
    expect((await waitingRequests(db)).map((w) => [w.email, w.via])).toEqual([
      [asha.email, "google"],
      [noor.email, "email-link"],
    ]);
    expect(await waitingRequests(db, 1)).toHaveLength(1);
    expect(await waitingCount(db)).toBe(2);
  });
});

describe("approveAccess", () => {
  it("approve makes the invite and the Learner now; twice changes nothing", async () => {
    const db = await testDb();
    await signedUp(db, noor, "email-link");
    const learner = await approveAccess(db, noor.id);
    expect(learner).toMatchObject({ name: "noor", authUserId: noor.id });
    const [invite] = await db.select().from(invites).where(eq(invites.email, noor.email));
    expect(invite.note).toBe("approved on /admin");
    expect(await waitingCount(db)).toBe(0);
    expect(await accessFor(db, noor)).toEqual({ state: "approved", learner });

    expect(await approveAccess(db, noor.id)).toEqual(learner);
    expect(await db.select().from(invites)).toHaveLength(1);
    expect(await db.select().from(learners).where(eq(learners.authUserId, noor.id))).toHaveLength(1);
  });

  it("invite_taken: approve reports no Learner and they stay listed as waiting", async () => {
    const db = await testDb();
    await linkedOwner(db);
    // A second address whose invite names the owner's Learner, already linked to the owner's account.
    await addInvite(db, asha.email, { learnerName: "owner" });
    await signedUp(db, asha);
    expect(await approveAccess(db, asha.id)).toBeNull();
    expect((await waitingRequests(db)).map((w) => w.userId)).toEqual([asha.id]);
  });

  it("an unknown user changes nothing", async () => {
    const db = await testDb();
    expect(await approveAccess(db, "nobody")).toBe("no_user");
    expect(await db.select().from(invites)).toEqual([]);
  });
});

describe("denyAccess", () => {
  it("deny deletes their sessions and beats a linked Learner and the open switch", async () => {
    const db = await testDb();
    const ownerLearner = await linkedOwner(db);
    await addInvite(db, asha.email);
    await signedUp(db, asha);
    const before = await accessFor(db, asha);
    expect(before.state).toBe("approved");
    await sessionFor(db, asha.id);
    await sessionFor(db, asha.id);
    await sessionFor(db, owner.id);
    await setSignupOpen(db, true);

    expect(await denyAccess(db, asha.id, { ownerUserId: ownerLearner.authUserId! })).toBe("denied");
    expect(await accessFor(db, asha)).toEqual({ state: "denied" });
    expect(await sessionsOf(db, asha.id)).toBe(0);
    expect(await sessionsOf(db, owner.id)).toBe(1);
    // The Learner is kept whole, never archived; the user row stays too.
    const [kept] = await db.select().from(learners).where(eq(learners.authUserId, asha.id));
    expect(kept.archivedAt).toBeNull();
    expect(await db.select().from(user).where(eq(user.id, asha.id))).toHaveLength(1);
    // Denied people are in no list but their own.
    expect(await waitingRequests(db)).toEqual([]);
    expect((await peopleWithAccess(db)).map((p) => p.userId)).toEqual([owner.id]);
    expect((await deniedPeople(db)).map((p) => p.userId)).toEqual([asha.id]);
    // Denying twice changes nothing.
    expect(await denyAccess(db, asha.id, { ownerUserId: owner.id })).toBe("denied");
    expect(await db.select().from(accessDenials)).toHaveLength(1);
  });

  it("a waiting person denied is no longer waiting, and signing in again keeps them denied", async () => {
    const db = await testDb();
    await signedUp(db, noor, "email-link");
    expect(await denyAccess(db, noor.id, { ownerUserId: owner.id })).toBe("denied");
    expect(await waitingCount(db)).toBe(0);
    await addInvite(db, noor.email);
    expect(await accessFor(db, noor)).toEqual({ state: "denied" });
  });

  it("approving again restores the same Learner and their progress", async () => {
    const db = await testDb();
    await addInvite(db, asha.email);
    await signedUp(db, asha);
    const first = await accessFor(db, asha);
    if (first.state !== "approved") throw new Error("not approved");
    await db.insert(topicProgress).values({ learnerId: first.learner.id, topicId: "num-percent", step: "story", status: "in_progress" });
    const progress = await loadProgress(db, first.learner.id);

    await denyAccess(db, asha.id, { ownerUserId: owner.id });
    expect(await approveAccess(db, asha.id)).toEqual(first.learner);
    expect(await accessFor(db, asha)).toEqual({ state: "approved", learner: first.learner });
    expect(await loadProgress(db, first.learner.id)).toEqual(progress);
    expect(await deniedPeople(db)).toEqual([]);
  });

  it("the owner cannot be denied, by themselves or by another account", async () => {
    const db = await testDb();
    const ownerLearner = await linkedOwner(db);
    await sessionFor(db, owner.id);
    expect(await denyAccess(db, owner.id, { ownerUserId: owner.id })).toBe("self");
    expect(await denyAccess(db, owner.id, { ownerUserId: "someone-else" })).toBe("owner");
    expect(await db.select().from(accessDenials)).toEqual([]);
    expect(await sessionsOf(db, owner.id)).toBe(1);
    expect(await accessFor(db, owner)).toEqual({ state: "approved", learner: ownerLearner });
  });

  it("an unknown user changes nothing", async () => {
    const db = await testDb();
    expect(await denyAccess(db, "nobody", { ownerUserId: owner.id })).toBe("no_user");
    expect(await db.select().from(accessDenials)).toEqual([]);
  });
});

describe("the lists on /admin", () => {
  it("people with access: the owner first, then Google and email-link Learners, never passcode Learners", async () => {
    const db = await testDb();
    await db.insert(learners).values({ name: "tools" });
    await signedUp(db, noor, "email-link", new Date("2026-11-01T10:00:00Z"));
    await approveAccess(db, noor.id);
    await addInvite(db, asha.email);
    await signedUp(db, asha, "google", new Date("2026-11-02T10:00:00Z"));
    await accessFor(db, asha);
    await linkedOwner(db);

    const people = await peopleWithAccess(db);
    expect(people.map((p) => [p.email, p.via, p.isOwner])).toEqual([
      [owner.email, "google", true],
      [noor.email, "email-link", false],
      [asha.email, "google", false],
    ]);
    expect(people[0]).toMatchObject({ userId: owner.id, learnerId: 1, name: "owner", signedUpAt: expect.any(Date) });
  });

  it("pending invites are the invited emails nobody has signed in with yet", async () => {
    const db = await testDb();
    await addInvite(db, "later@x.com", { note: "from the course" });
    await addInvite(db, asha.email);
    await signedUp(db, asha);
    expect(await pendingInvites(db)).toEqual([{ id: expect.any(Number), email: "later@x.com", note: "from the course", learnerName: null, invitedAt: expect.any(Date) }]);
  });

  it("Start over keeps the person with access, under their fresh Learner", async () => {
    const db = await testDb();
    await addInvite(db, asha.email);
    await signedUp(db, asha);
    const first = await accessFor(db, asha);
    if (first.state !== "approved") throw new Error("not approved");
    const fresh = await startOver(db, first.learner.id);
    expect((await peopleWithAccess(db)).map((p) => p.learnerId)).toEqual([fresh?.id]);
    expect(await waitingCount(db)).toBe(0);
  });
});

describe("isOwnerLearner", () => {
  it("is only the active Learner named owner that a Google or email-link account holds", () => {
    const base = { name: "owner", authUserId: "u1", archivedAt: null };
    expect(isOwnerLearner(base)).toBe(true);
    expect(isOwnerLearner({ ...base, authUserId: null })).toBe(false);
    expect(isOwnerLearner({ ...base, name: "Owner" })).toBe(false);
    expect(isOwnerLearner({ ...base, name: "owner (2)" })).toBe(false);
    expect(isOwnerLearner({ ...base, archivedAt: new Date() })).toBe(false);
  });
});
