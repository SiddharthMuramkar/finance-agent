import { and, eq, isNull } from "drizzle-orm";
import { learners } from "@/db/schema";
import type { Db } from "@/db/types";
import { inviteFor, signupOpen } from "./invites";
import type { Learner } from "./learners";
import { OWNER_NAME, TOOLS_NAME, passcodeList } from "./passcode";

/** The fields of a Better Auth `user` this module reads. */
export type AuthUser = { id: string; email: string; name: string };

/** The most " (n)" suffixes tried before giving up on a display name (a clash this deep means something is wrong). */
const MAX_SUFFIX = 50;

async function linkedLearner(db: Db, userId: string): Promise<Learner | null> {
  const [found] = await db
    .select()
    .from(learners)
    .where(and(eq(learners.authUserId, userId), isNull(learners.archivedAt)))
    .limit(1);
  return found ?? null;
}

/**
 * Names a Google Learner never takes as they are, compared in any case: `owner` and `tools`, and every
 * name on the passcode list, so a passcode sign-in (which finds its Learner by name) can never open a
 * Google person's Learner, nor a Google sign-in a passcode person's.
 */
export function reservedNames(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set([OWNER_NAME, TOOLS_NAME, ...passcodeList(env).keys()].map((n) => n.toLowerCase()));
}

/** A display name made safe to store: spaces collapsed, at most 60 characters, never empty. */
function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 60).trim() || "Learner";
}

/**
 * A new active Learner for this Google user, under the display name or, when that is reserved or
 * taken by another active Learner, "<name> (2)", "<name> (3)" and so on. Never `signInAs`, which would
 * hand back the other person's Learner. When this user's other first request won, theirs is returned.
 */
async function makeLearner(db: Db, user: AuthUser, reserved: Set<string>): Promise<Learner | null> {
  const base = cleanName(user.name);
  for (let n = 1; n <= MAX_SUFFIX; n++) {
    const name = n === 1 ? base : `${base} (${n})`;
    if (reserved.has(name.toLowerCase())) continue;
    // Either unique index may refuse: the name (someone else has it) or the Google user (a racing request won).
    const [made] = await db.insert(learners).values({ name, authUserId: user.id }).onConflictDoNothing().returning();
    if (made) return made;
    const raced = await linkedLearner(db, user.id);
    if (raced) return raced;
  }
  console.warn(`learner_name_exhausted: no free name for Google user ${user.id}`);
  return null;
}

/**
 * Links the active Learner an invite names to this Google user, only while it is linked to nobody.
 * Null when it is linked to another Google account ("invite_taken"); undefined when no active Learner
 * has that name (the caller makes one).
 */
async function linkNamed(db: Db, user: AuthUser, learnerName: string, email: string): Promise<Learner | null | undefined> {
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
  console.warn(`invite_taken: the invite for ${email} names Learner ${taken.id}, already linked to another Google account`);
  return null;
}

/**
 * The Learner a Google user signs in as (ADR 0011), made or linked on first use, in this order:
 * 1. the active Learner already linked to the user;
 * 2. an invite naming a Learner: that active Learner, linked if nobody holds it (else null); made under that name if none exists;
 * 3. an invite without a name, or the Sign-up switch on: a new Learner under the display name;
 * 4. otherwise null (not invited, sign-up closed).
 * Idempotent: two first requests at once make one Learner (the partial unique index decides).
 */
export async function learnerForAuthUser(db: Db, user: AuthUser, reserved: Set<string> = reservedNames()): Promise<Learner | null> {
  const linked = await linkedLearner(db, user.id);
  if (linked) return linked;
  const invite = await inviteFor(db, user.email);
  if (!invite && !(await signupOpen(db))) return null;
  if (invite?.learnerName) {
    const named = await linkNamed(db, user, invite.learnerName, invite.email);
    if (named !== undefined) return named;
    const [made] = await db.insert(learners).values({ name: invite.learnerName, authUserId: user.id }).onConflictDoNothing().returning();
    return made ?? (await linkedLearner(db, user.id));
  }
  return makeLearner(db, user, reserved);
}
