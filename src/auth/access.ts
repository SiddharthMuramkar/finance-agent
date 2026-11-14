import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { accessDenials, account, invites, learners, session, user } from "../db/schema.ts";
import type { Db } from "../db/types.ts";
import { type AuthUser, learnerForAuthUser, reservedNames } from "./google-learner.ts";
import { addInvite } from "./invites.ts";
import type { Learner } from "./learners.ts";
import { OWNER_NAME } from "./passcode.ts";

// Who may come in (ADR 0014). Anyone with a verified Google account or email address can sign in;
// that leaves a Better Auth `user`. Whether that user may enter is worked out here, never stored as a
// status: a denial row says no, before anything else; otherwise the existing invite rules
// (learnerForAuthUser: a linked Learner, an invite, or the open Sign-up switch) say yes; otherwise
// they wait. Imports are relative with extensions, as in invites.ts, so scripts/invites.mjs could load
// this file under Node's type stripping; google-learner.ts, which it needs, still imports through `@/`.

/** What a signed-in user may do: enter as their Learner, wait for the owner, or nothing (denied). */
export type Access = { state: "approved"; learner: Learner } | { state: "waiting" } | { state: "denied" };

/** How a person signed in, for /admin: Google when their user has a Google account, else the email link (which writes no account). */
export type SignInMethod = "google" | "email-link";

/** The note on an invite that Approve on /admin wrote, so the invite list says where it came from. */
export const APPROVED_NOTE = "approved on /admin";

/** True when the owner denied this user. One primary-key read. */
export async function isDenied(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ userId: accessDenials.userId }).from(accessDenials).where(eq(accessDenials.userId, userId)).limit(1);
  return row !== undefined;
}

/**
 * Whether this signed-in user may enter, in this order: a denial wins over everything, even an invite,
 * the open switch or a Learner they already have; then their Learner (made or linked on first use);
 * else they wait. The proxy, the session and the owner check all ask here, so they always agree and a
 * denied person with an active Learner can't loop between /study and /login.
 */
export async function accessFor(db: Db, authUser: AuthUser, reserved: Set<string> = reservedNames()): Promise<Access> {
  if (await isDenied(db, authUser.id)) return { state: "denied" };
  const learner = await learnerForAuthUser(db, authUser, reserved);
  return learner ? { state: "approved", learner } : { state: "waiting" };
}

/**
 * The owner's Learner: the active Learner named `owner` that a Google or email-link account holds
 * (linked by `invites add <email> --learner owner`). Never a passcode Learner, and never "owner (2)":
 * `owner` is reserved, so no sign-up can take the name. Checked on the Learner, not on Learner 1,
 * because Start over gives the owner a fresh Learner under the same name and link. Defined here,
 * beside denyAccess, which refuses the owner; owner.ts re-exports it.
 */
export function isOwnerLearner(learner: Pick<Learner, "name" | "authUserId" | "archivedAt">): boolean {
  return learner.name === OWNER_NAME && learner.authUserId !== null && learner.archivedAt === null;
}

/**
 * The users with a Google account, one row each, to left-join onto a list. A join rather than a
 * correlated `exists` in the selection: Drizzle leaves column names unqualified in the selection of a
 * one-table query, so such a subquery would compare the wrong columns.
 */
const googleUsers = (db: Db) => db.selectDistinct({ userId: account.userId }).from(account).where(eq(account.providerId, "google")).as("google_users");
const method = (google: boolean): SignInMethod => (google ? "google" : "email-link");

/** Someone who signed in and waits for the owner. `requestedAt` is their first sign-in. */
export type WaitingRequest = { userId: string; name: string; email: string; via: SignInMethod; requestedAt: Date };

/**
 * The people waiting, oldest first: every user with no active Learner and no denial. Exactly the
 * people who see "Waiting for approval", including one whose invite names a Learner another account
 * holds (approving them makes no Learner, so they stay here until the invite is fixed with the CLI).
 */
export async function waitingRequests(db: Db, limit = 100): Promise<WaitingRequest[]> {
  const google = googleUsers(db);
  const rows = await db
    .select({ userId: user.id, name: user.name, email: user.email, google: sql<boolean>`${google.userId} is not null`, requestedAt: user.createdAt })
    .from(user)
    .leftJoin(learners, and(eq(learners.authUserId, user.id), isNull(learners.archivedAt)))
    .leftJoin(accessDenials, eq(accessDenials.userId, user.id))
    .leftJoin(google, eq(google.userId, user.id))
    .where(and(isNull(learners.id), isNull(accessDenials.userId)))
    .orderBy(asc(user.createdAt), asc(user.id))
    .limit(limit);
  return rows.map(({ google, ...r }) => ({ ...r, via: method(google) }));
}

/** How many people are waiting (the number beside Admin in the owner's account menu). */
export async function waitingCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(user)
    .leftJoin(learners, and(eq(learners.authUserId, user.id), isNull(learners.archivedAt)))
    .leftJoin(accessDenials, eq(accessDenials.userId, user.id))
    .where(and(isNull(learners.id), isNull(accessDenials.userId)));
  return row.n;
}

/** Someone with access: their active Learner and the account behind it. `signedUpAt` is their first sign-in. */
export type PersonWithAccess = { userId: string; learnerId: number; name: string; email: string; via: SignInMethod; isOwner: boolean; signedUpAt: Date };

/**
 * Everyone who may enter through Google or an email link: each active Learner linked to a user who is
 * not denied. The owner comes first, then the others in the order they first signed in. Passcode
 * Learners (the test tools) have no user, so they are never listed.
 */
export async function peopleWithAccess(db: Db): Promise<PersonWithAccess[]> {
  const google = googleUsers(db);
  const rows = await db
    .select({ userId: user.id, learner: learners, email: user.email, google: sql<boolean>`${google.userId} is not null`, signedUpAt: user.createdAt })
    .from(learners)
    .innerJoin(user, eq(learners.authUserId, user.id))
    .leftJoin(accessDenials, eq(accessDenials.userId, user.id))
    .leftJoin(google, eq(google.userId, user.id))
    .where(and(isNull(learners.archivedAt), isNull(accessDenials.userId)))
    .orderBy(desc(sql`${learners.name} = ${OWNER_NAME}`), asc(user.createdAt), asc(learners.id));
  return rows.map(({ learner, google, ...r }) => ({
    ...r,
    learnerId: learner.id,
    name: learner.name,
    via: method(google),
    isOwner: isOwnerLearner(learner),
  }));
}

/** An invited email nobody has signed in with yet. */
export type PendingInvite = { id: number; email: string; note: string | null; learnerName: string | null; invitedAt: Date };

/** "Invited, not signed in yet": invites with no user for their email, oldest first. */
export async function pendingInvites(db: Db): Promise<PendingInvite[]> {
  return db
    .select({ id: invites.id, email: invites.email, note: invites.note, learnerName: invites.learnerName, invitedAt: invites.invitedAt })
    .from(invites)
    .leftJoin(user, eq(sql`lower(${user.email})`, invites.email))
    .where(isNull(user.id))
    .orderBy(asc(invites.invitedAt), asc(invites.id));
}

/** Someone the owner denied, and when. */
export type DeniedPerson = { userId: string; name: string; email: string; via: SignInMethod; deniedAt: Date };

/** Everyone denied, most recent first: the only list they still appear in, so the owner can approve them again. */
export async function deniedPeople(db: Db): Promise<DeniedPerson[]> {
  const google = googleUsers(db);
  const rows = await db
    .select({ userId: user.id, name: user.name, email: user.email, google: sql<boolean>`${google.userId} is not null`, deniedAt: accessDenials.deniedAt })
    .from(accessDenials)
    .innerJoin(user, eq(accessDenials.userId, user.id))
    .leftJoin(google, eq(google.userId, user.id))
    .orderBy(desc(accessDenials.deniedAt), asc(user.id));
  return rows.map(({ google, ...r }) => ({ ...r, via: method(google) }));
}

/**
 * Approve: the user's email goes on the invite list (noted "approved on /admin"; an existing invite is
 * kept as it is), any denial goes, and their Learner is made or linked at once, so they show under
 * People with access straight away. Returns that Learner; null when the invite names a Learner another
 * account holds (invite_taken: fix it with the invites CLI); "no_user" for an unknown user. Approving
 * a denied person gives back the very Learner they had, with all their progress.
 *
 * No transaction (the invites CLI's database driver has none), so the order keeps a half-done approve
 * safe: the invite is written first and the denial deleted second, so stopping in between leaves them
 * still denied. Repeating it changes nothing.
 */
export async function approveAccess(db: Db, userId: string, reserved: Set<string> = reservedNames()): Promise<Learner | null | "no_user"> {
  const [found] = await db.select({ id: user.id, email: user.email, name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  if (!found) return "no_user";
  await addInvite(db, found.email, { note: APPROVED_NOTE });
  await db.delete(accessDenials).where(eq(accessDenials.userId, userId));
  return learnerForAuthUser(db, found, reserved);
}

/** What Deny (and Remove access) did: "self" and "owner" are refusals that change nothing. */
export type DenyResult = "denied" | "self" | "owner" | "no_user";

/**
 * Deny, for a waiting person, and Remove access, for someone with access: one action. The denial row
 * is written first, then every session of theirs is deleted, so they are signed out at once (the
 * Better Auth cookie cache is off) and every later request finds the denial. Nothing else changes:
 * their user, invite and Learner stay, so approving again restores them. Refuses the caller's own
 * account and the owner's Learner, so the owner can never lock themselves out.
 */
export async function denyAccess(db: Db, userId: string, by: { ownerUserId: string }): Promise<DenyResult> {
  if (userId === by.ownerUserId) return "self";
  const [found] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  if (!found) return "no_user";
  const [linked] = await db
    .select()
    .from(learners)
    .where(and(eq(learners.authUserId, userId), isNull(learners.archivedAt)))
    .limit(1);
  if (linked && isOwnerLearner(linked)) return "owner";
  await db.insert(accessDenials).values({ userId }).onConflictDoNothing();
  await db.delete(session).where(eq(session.userId, userId));
  return "denied";
}
