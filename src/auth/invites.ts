import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { invites, learners, settings, user } from "../db/schema.ts";
import type { Db } from "../db/types.ts";

// The invite list and the Sign-up switch (ADR 0014). Anyone may sign in and then waits
// for the owner; an invite lets an email in at once, skipping the wait, and Approve on /admin writes one.
// Imports only packages and relative files with their extensions, so scripts/invites.mjs can run it with
// Node's type stripping.

/** The setting behind the Sign-up switch: "off" (the default) or "on". */
export const SIGNUP_OPEN = "signup_open";

/** The Sign-up switch, read through one function: true only when `signup_open` is "on". Written "off" the first time, like the other defaults. */
export async function signupOpen(db: Db): Promise<boolean> {
  await db.insert(settings).values({ key: SIGNUP_OPEN, value: "off" }).onConflictDoNothing();
  const [row] = await db.select().from(settings).where(eq(settings.key, SIGNUP_OPEN)).limit(1);
  return row?.value === "on";
}

/** Opens (true) or closes (false) sign-up to everyone who signs in (Google or an email link); a denied person stays out either way. */
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

export const INVITES_USAGE = [
  "Usage: npm run invites -- <command>",
  '  add <email> [--learner <name>] [--note "..."]   invite an email, so it gets in without waiting; --learner links an existing Learner (the owner: --learner owner)',
  "  remove <email>                                   take an email off the list (anyone already in keeps access: use Remove access on /admin)",
  "  list                                             the invite list, oldest first, and the Sign-up switch",
  "  waiting                                          the people waiting for approval, oldest first (approve or deny them on /admin)",
  "  open | close                                     turn the Sign-up switch on (anyone who signs in gets in) or off (others wait for /admin)",
].join("\n");

/** The value after `--flag`, or null; throws when the flag is there without a value. */
function flag(args: string[], name: string): string | null {
  const at = args.indexOf(name);
  if (at < 0) return null;
  const value = args[at + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} needs a value.\n${INVITES_USAGE}`);
  return value;
}

/**
 * The invites CLI (scripts/invites.mjs is a thin wrapper): one command, its output through `log`.
 * Throws with a plain reason on a refusal, having changed nothing.
 */
export async function runInvites(db: Db, argv: string[], log: (line: string) => void): Promise<void> {
  const [command, ...args] = argv;
  if (command === "add") {
    const email = args[0] && !args[0].startsWith("--") ? inviteEmail(args[0]) : "";
    if (!email.includes("@")) throw new Error(`add needs an email.\n${INVITES_USAGE}`);
    const learnerName = flag(args, "--learner");
    const note = flag(args, "--note");
    // addInvite changes nothing on an email already listed, so a re-add is handled here and says what it did.
    const existing = await inviteFor(db, email);
    if (existing && !learnerName) {
      log(`${email} was already invited: nothing changed.`);
      return;
    }
    if (learnerName) {
      const [learner] = await db
        .select()
        .from(learners)
        .where(and(eq(learners.name, learnerName), isNull(learners.archivedAt)))
        .limit(1);
      if (!learner) throw new Error(`No active Learner is named "${learnerName}": nothing was added.`);
      if (learner.authUserId) throw new Error(`Learner ${learner.id} ("${learnerName}") is already linked to an account (Google or an email link): nothing was added.`);
      if (existing?.learnerName === learnerName) {
        log(`${email} was already invited, linked to Learner ${learner.id} ("${learnerName}"): nothing changed.`);
        return;
      }
      if (existing && existing.learnerName !== null)
        throw new Error(`${email} is already invited and linked to "${existing.learnerName}": remove it first to link it to another Learner. Nothing was changed.`);
      // Sign-in returns the Learner already linked to a signed-in user before it reads the invite, so a link written now
      // would never happen: refuse rather than say it did.
      const signedUp = await signedUpLearner(db, email);
      if (signedUp)
        throw new Error(`${email} already signed up as Learner ${signedUp.id} ("${signedUp.name}"): the invite cannot link it to "${learnerName}". Nothing was changed.`);
      if (existing) {
        await db
          .update(invites)
          .set({ learnerName, ...(note !== null && { note }) })
          .where(eq(invites.id, existing.id));
        log(`${email} was already invited; it is now linked to Learner ${learner.id} ("${learnerName}").`);
        return;
      }
      await addInvite(db, email, { learnerName, note });
      log(`Invited ${email}, linked to Learner ${learner.id} ("${learnerName}").`);
      return;
    }
    await addInvite(db, email, { note });
    log(`Invited ${email}.`);
    return;
  }
  if (command === "remove") {
    if (!args[0]) throw new Error(`remove needs an email.\n${INVITES_USAGE}`);
    const gone = await removeInvite(db, args[0]);
    log(
      gone
        ? `Removed ${inviteEmail(args[0])}. Anyone who already got in with it keeps their access: to take it away, use Remove access on /admin.`
        : `${inviteEmail(args[0])} was not on the list.`,
    );
    return;
  }
  if (command === "list") {
    const rows = await db.select().from(invites).orderBy(asc(invites.invitedAt), asc(invites.id));
    for (const r of rows) log([r.email, r.learnerName ? `-> ${r.learnerName}` : "", r.note ? `(${r.note})` : ""].filter(Boolean).join("  "));
    log(`${rows.length} invite(s). Sign-up is ${(await signupOpen(db)) ? "open (anyone who signs in gets in)" : "closed (invited emails get in; everyone else waits for /admin)"}.`);
    return;
  }
  if (command === "waiting") {
    await logWaiting(db, log);
    return;
  }
  if (command === "open" || command === "close") {
    await setSignupOpen(db, command === "open");
    log(
      command === "open"
        ? "Sign-up is open: anyone who signs in with Google or an email link gets in at once. People you denied on /admin stay out."
        : "Sign-up is closed: invited emails get in at once; everyone else waits for you to approve them on /admin.",
    );
    return;
  }
  throw new Error(INVITES_USAGE);
}

/**
 * `waiting`: the people who signed in and wait for the owner, oldest first, one line each (their email,
 * the name their account gave, how they signed in and the day they first did), as /admin's Waiting
 * section lists them. access.ts is loaded only here, so the other commands never depend on the sign-in
 * modules it brings in.
 */
async function logWaiting(db: Db, log: (line: string) => void): Promise<void> {
  const { waitingCount, waitingRequests } = await import("./access.ts");
  const [rows, total] = await Promise.all([waitingRequests(db), waitingCount(db)]);
  if (total === 0) {
    log("Nobody is waiting.");
    return;
  }
  for (const r of rows) log([r.email, r.name, r.via === "google" ? "Google" : "email link", `asked ${r.requestedAt.toISOString().slice(0, 10)}`].join("  "));
  const shown = rows.length < total ? ` (the oldest ${rows.length} are listed)` : "";
  log(`${total} waiting${shown}. Approve or deny them on /admin, or let one in here: npm run invites -- add <email>`);
}

/** The active Learner already linked to the signed-in user (Google or an email link) with this email, or null (they have not signed up yet). */
async function signedUpLearner(db: Db, email: string) {
  const [row] = await db
    .select({ id: learners.id, name: learners.name })
    .from(learners)
    .innerJoin(user, eq(learners.authUserId, user.id))
    .where(and(sql`lower(${user.email}) = ${inviteEmail(email)}`, isNull(learners.archivedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Takes an email off the list. A Learner who already signed up keeps access: sign-in finds the Learner
 * linked to their account before it reads the invite. To take access away, Remove access on /admin
 * denies their account (ADR 0014), which holds whatever the invite list and the Sign-up switch say; it
 * replaces the older order of removing the invite, closing sign-up and archiving the Learner.
 */
export async function removeInvite(db: Db, email: string): Promise<boolean> {
  const gone = await db.delete(invites).where(eq(invites.email, inviteEmail(email))).returning();
  return gone.length > 0;
}
