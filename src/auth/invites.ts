import { eq } from "drizzle-orm";
import { invites, settings } from "../db/schema.ts";
import type { Db } from "../db/types.ts";

// The invite list and the Sign-up switch (ADR 0011). Imports only packages and relative files with
// their extensions, so scripts/invites.mjs can run it with Node's type stripping.

/** The setting behind the Sign-up switch: "off" (the default) or "on". */
export const SIGNUP_OPEN = "signup_open";

/** The Sign-up switch, read through one function: true only when `signup_open` is "on". Written "off" the first time, like the other defaults. */
export async function signupOpen(db: Db): Promise<boolean> {
  await db.insert(settings).values({ key: SIGNUP_OPEN, value: "off" }).onConflictDoNothing();
  const [row] = await db.select().from(settings).where(eq(settings.key, SIGNUP_OPEN)).limit(1);
  return row?.value === "on";
}

/** Opens (true) or closes (false) sign-up to everyone with a Google account. */
export async function setSignupOpen(db: Db, open: boolean): Promise<void> {
  const value = open ? "on" : "off";
  await db.insert(settings).values({ key: SIGNUP_OPEN, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** How an email is stored and compared: trimmed and lowercase. Nothing else (no "+" or dot folding). */
export function inviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Adds an email to the invite list; adding it again changes nothing. */
export async function addInvite(db: Db, email: string, opts: { learnerName?: string | null; note?: string | null } = {}): Promise<void> {
  await db
    .insert(invites)
    .values({ email: inviteEmail(email), learnerName: opts.learnerName ?? null, note: opts.note ?? null })
    .onConflictDoNothing();
}

/** The invite for this email, or null. */
export async function inviteFor(db: Db, email: string) {
  const [row] = await db.select().from(invites).where(eq(invites.email, inviteEmail(email))).limit(1);
  return row ?? null;
}

export async function isInvited(db: Db, email: string): Promise<boolean> {
  return (await inviteFor(db, email)) !== null;
}

/** Takes an email off the list. A Learner who already signed up keeps access (archive them to lock them out). */
export async function removeInvite(db: Db, email: string): Promise<boolean> {
  const gone = await db.delete(invites).where(eq(invites.email, inviteEmail(email))).returning();
  return gone.length > 0;
}
