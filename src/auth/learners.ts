import { and, eq, isNull } from "drizzle-orm";
import { learners } from "@/db/schema";
import type { Db } from "@/db/types";
import { passcodeDoorOpen } from "./gates";
import { type PasscodeList, signedLearnerId } from "./passcode";

export type Learner = typeof learners.$inferSelect;

/**
 * The active Learner under this name, made on the name's first sign-in. Two first sign-ins at once
 * can't make two: the database keeps one active Learner per name, and the loser reads the winner's.
 */
export async function signInAs(db: Db, name: string): Promise<Learner> {
  const active = () => db.select().from(learners).where(and(eq(learners.name, name), isNull(learners.archivedAt))).limit(1);
  const [found] = await active();
  if (found) return found;
  const [made] = await db.insert(learners).values({ name }).onConflictDoNothing().returning();
  if (made) return made;
  const [winner] = await active();
  if (!winner) throw new Error(`No active Learner for ${name}`);
  return winner;
}

/** What Settings' confirmed Start over form sends as `confirm`; a post without it changes nothing. */
export const START_OVER_CONFIRM = "start-over";

/** Settings > Show developer details: kept on the Learner, so it follows them to every device. */
export async function setShowDeveloperDetails(db: Db, learnerId: number, on: boolean): Promise<void> {
  await db.update(learners).set({ showDeveloperDetails: on }).where(eq(learners.id, learnerId));
}

/**
 * Start over: archives the Learner and makes a fresh, empty, active Learner under the same name, in
 * one transaction. Nothing is deleted or changed in the old Learner's rows; an archived Learner can
 * no longer sign in, so every device holding its cookie is signed out. Null when the Learner is
 * already archived (a second Start over from another tab), which changes nothing.
 */
export async function startOver(db: Db, learnerId: number, now = new Date()): Promise<Learner | null> {
  return db.transaction(async (tx) => {
    const [archived] = await tx
      .update(learners)
      .set({ archivedAt: now })
      .where(and(eq(learners.id, learnerId), isNull(learners.archivedAt)))
      .returning();
    if (!archived) return null;
    // An account's fresh Learner keeps the Clerk link; the archived one keeps it too, but no longer counts.
    const [fresh] = await tx.insert(learners).values({ name: archived.name, clerkUserId: archived.clerkUserId }).returning();
    return fresh;
  });
}

/**
 * The Learner a passcode cookie (`fa_access`) opens, or null when the request counts as signed out: the passcode door
 * is shut (production or Vercel), or the cookie is missing, old (no Learner) or wrongly signed, or its Learner is
 * unknown, archived (Start over), under a name no longer in the passcode list, or linked to a Clerk account: a passcode
 * never opens a person's Learner, only their own sign-in does. The proxy and the session both call this, so they agree.
 */
export async function learnerFromCookie(
  db: Db,
  cookie: string | undefined,
  secret: string,
  list: PasscodeList,
  env: Record<string, string | undefined> = process.env,
): Promise<Learner | null> {
  if (!passcodeDoorOpen(env)) return null;
  const id = await signedLearnerId(cookie, secret);
  if (id === null) return null;
  const [learner] = await db.select().from(learners).where(eq(learners.id, id)).limit(1);
  if (!learner || learner.archivedAt !== null || !list.has(learner.name)) return null;
  if (learner.clerkUserId !== null) return null;
  return learner;
}
