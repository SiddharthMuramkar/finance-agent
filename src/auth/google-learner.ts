import { and, eq, isNull } from "drizzle-orm";
import { learners } from "../db/schema.ts";
import type { Db } from "../db/types.ts";
import { makeLearner as makeLinkedLearner, reservedNames } from "./clerk-learner.ts";
import { inviteFor, signupOpen } from "./invites.ts";
import type { Learner } from "./learners.ts";

/** The fields of a Better Auth `user` (Google or email link) this module reads. */
export type AuthUser = { id: string; email: string; name: string };

/** The reserved names now live in clerk-learner.ts, beside the Clerk linking that outlives this file (issue #33). */
export { reservedNames };

async function linkedLearner(db: Db, userId: string): Promise<Learner | null> {
  const [found] = await db
    .select()
    .from(learners)
    .where(and(eq(learners.authUserId, userId), isNull(learners.archivedAt)))
    .limit(1);
  return found ?? null;
}

/** A new active Learner for this signed-in user, under their display name (clerk-learner.ts's makeLearner rules). */
async function makeLearner(db: Db, user: AuthUser, reserved: Set<string>): Promise<Learner | null> {
  const made = await makeLinkedLearner(db, user.name, { authUserId: user.id }, () => linkedLearner(db, user.id), reserved);
  if (made) return made;
  console.warn(`learner_name_exhausted: no free name for Google user ${user.id}`);
  return null;
}

/**
 * Links the active Learner an invite names to this signed-in user, only while it is linked to nobody.
 * Null when it is linked to another account ("invite_taken"); undefined when no active Learner has
 * that name (the caller makes one).
 */
async function linkNamed(db: Db, user: AuthUser, learnerName: string): Promise<Learner | null | undefined> {
  try {
    const [named] = await db
      .update(learners)
      .set({ authUserId: user.id })
      .where(and(eq(learners.name, learnerName), isNull(learners.archivedAt), isNull(learners.authUserId)))
      .returning();
    if (named) return named;
  } catch {
    // Two first requests at once: the partial unique index refused the second link. Read the winner below.
  }
  const raced = await linkedLearner(db, user.id);
  if (raced) return raced;
  const [taken] = await db
    .select({ id: learners.id })
    .from(learners)
    .where(and(eq(learners.name, learnerName), isNull(learners.archivedAt)))
    .limit(1);
  if (!taken) return undefined;
  // No email in the log: it is personal data. The Learner id is enough to find the invite.
  console.warn(`invite_taken: an invite names Learner ${taken.id}, already linked to another Google account`);
  return null;
}

/**
 * The Learner a signed-in user (Google or an email link) enters as (ADR 0011), made or linked on first
 * use, in this order:
 * 1. the active Learner already linked to the user;
 * 2. an invite naming a Learner: that active Learner, linked if nobody holds it (else null); made under that name if none exists;
 * 3. an invite without a name (Approve on /admin writes one), or the Sign-up switch on: a new Learner under the display name;
 * 4. otherwise null (they wait for the owner).
 * Idempotent: two first requests at once make one Learner (the partial unique index decides).
 * It never checks a denial: call it only through `accessFor` (src/auth/access.ts, ADR 0014), which does
 * first; src/auth/no-auth-bypass.test.ts holds every other file to that.
 */
export async function learnerForAuthUser(db: Db, user: AuthUser, reserved: Set<string> = reservedNames()): Promise<Learner | null> {
  const linked = await linkedLearner(db, user.id);
  if (linked) return linked;
  const invite = await inviteFor(db, user.email);
  if (!invite && !(await signupOpen(db))) return null;
  if (invite?.learnerName) {
    const named = await linkNamed(db, user, invite.learnerName);
    if (named !== undefined) return named;
    const [made] = await db.insert(learners).values({ name: invite.learnerName, authUserId: user.id }).onConflictDoNothing().returning();
    return made ?? (await linkedLearner(db, user.id));
  }
  return makeLearner(db, user, reserved);
}
