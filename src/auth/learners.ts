import { and, eq, isNull } from "drizzle-orm";
import { learners } from "@/db/schema";
import type { Db } from "@/db/types";
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

/**
 * The Learner a sign-in cookie opens, or null when the request counts as signed out: the cookie is
 * missing, old (no Learner) or wrongly signed, or its Learner is unknown, archived (Start over) or
 * under a name no longer in the passcode list.
 */
export async function learnerFromCookie(db: Db, cookie: string | undefined, secret: string, list: PasscodeList): Promise<Learner | null> {
  const id = await signedLearnerId(cookie, secret);
  if (id === null) return null;
  const [learner] = await db.select().from(learners).where(eq(learners.id, id)).limit(1);
  if (!learner || learner.archivedAt !== null || !list.has(learner.name)) return null;
  return learner;
}
