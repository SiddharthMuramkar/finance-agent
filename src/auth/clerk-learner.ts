import { and, eq, isNull } from "drizzle-orm";
import { learners } from "../db/schema.ts";
import type { Db } from "../db/types.ts";
import type { Identity } from "./identity.ts";
import type { Learner } from "./learners.ts";
import { OWNER_NAME, TOOLS_NAME, passcodeList } from "./passcode.ts";

// The Learner a signed-in account enters as (issue #33). Imports are relative with extensions, as in google-learner.ts,
// which still loads this file under Node's type stripping (scripts/invites.mjs).

/** The most " (n)" suffixes tried before giving up on a display name (a clash this deep means something is wrong). */
const MAX_SUFFIX = 50;

/**
 * Names a Learner made through an account never takes as they are, compared in any case: `owner` and `tools`, and
 * every name on the passcode list, so a passcode sign-in (which finds its Learner by name) can never open an account's
 * Learner, nor an account a passcode person's.
 */
export function reservedNames(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set([OWNER_NAME, TOOLS_NAME, ...passcodeList(env).keys()].map((n) => n.toLowerCase()));
}

/** A display name made safe to store: spaces collapsed, at most 60 characters, never empty. */
export function cleanName(name: string | null | undefined): string {
  return (name ?? "").replace(/\s+/g, " ").trim().slice(0, 60).trim() || "Learner";
}

/** The column that links a Learner to its account: Better Auth's user until the cutover, Clerk's from then on. */
export type AccountLink = { authUserId: string } | { clerkUserId: string };

const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * A new active Learner linked to this account, under the display name or, when that is reserved or taken by another
 * active Learner, "<name> (2)", "<name> (3)" and so on. Never `signInAs`, which would hand back the other person's
 * Learner. When this account's other first request won the race, `linked` finds theirs and it is returned. Null when
 * every suffix is taken (or the name is reserved in every form); the caller decides what then.
 */
export async function makeLearner(db: Db, displayName: string, link: AccountLink, linked: () => Promise<Learner | null>, reserved: Set<string>): Promise<Learner | null> {
  const base = cleanName(displayName);
  for (let n = 1; n <= MAX_SUFFIX; n++) {
    const name = n === 1 ? base : `${base} (${n})`;
    if (reserved.has(name.toLowerCase())) continue;
    // Either unique index may refuse: the name (someone else has it) or the account (a racing request won).
    const [made] = await db.insert(learners).values({ name, ...link }).onConflictDoNothing().returning();
    if (made) return made;
    const raced = await linked();
    if (raced) return raced;
  }
  return null;
}

async function linkedLearner(db: Db, clerkUserId: string): Promise<Learner | null> {
  const [found] = await db
    .select()
    .from(learners)
    .where(and(eq(learners.clerkUserId, clerkUserId), isNull(learners.archivedAt)))
    .limit(1);
  return found ?? null;
}

/**
 * The Learner a Clerk user enters as, made on their first request: the active Learner already linked to them, else a
 * new one under their first name (makeLearner's rules), else "Learner <hex>". Never null, so a signed-in person always
 * has a Learner and /sign-in and /study can never send them back and forth. Who may sign in at all is Clerk's call
 * (Waitlist mode); this only links. Idempotent: two first requests at once make one Learner, since the partial unique
 * index `learners_one_active_per_clerk_user` refuses the second and it reads the winner. Start over keeps the link.
 */
export async function learnerForClerkUser(db: Db, person: Pick<Identity, "userId" | "firstName">, reserved: Set<string> = reservedNames()): Promise<Learner> {
  const found = await linkedLearner(db, person.userId);
  if (found) return found;
  const link = { clerkUserId: person.userId };
  const linked = () => linkedLearner(db, person.userId);
  const named = person.firstName ? await makeLearner(db, person.firstName, link, linked, reserved) : null;
  if (named) return named;
  // 32 random bits, and makeLearner's suffixes behind them: only a broken database gets past this.
  const made = await makeLearner(db, `Learner ${randomHex()}`, link, linked, reserved);
  if (made) return made;
  throw new Error(`No free Learner name for Clerk user ${person.userId}`);
}
