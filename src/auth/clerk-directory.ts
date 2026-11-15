import { clerkClient } from "@clerk/nextjs/server";
import { e2eEnabled } from "@/dev/e2e-mode";
import { clerkOn } from "./gates";

// Who a Clerk user is, for /admin (issue #33): the database keeps only each Learner's Clerk user id, so the email comes
// from Clerk's Backend API, read when the admin opens the page. Nothing is copied into the database.

/** What Clerk says about one user. `banned` is Clerk's ban, the way the owner takes someone's access away. */
export type DirectoryPerson = { email: string | null; banned: boolean };

/**
 * The people found, by Clerk user id. `answered` is false when Clerk was not asked (it is off) or failed; then a
 * missing person says nothing about them. When it is true, a missing person is one Clerk no longer has.
 */
export type ClerkDirectory = { people: ReadonlyMap<string, DirectoryPerson>; answered: boolean };

/** The most user ids Clerk takes in one `getUserList` filter. */
export const CLERK_LOOKUP_BATCH = 100;

/**
 * The Clerk users behind these ids. In the browser test bed, the test people (src/dev/e2e-identity.ts, loaded only
 * outside production builds); otherwise, while Clerk is on, Clerk's `users.getUserList`, 100 ids a call. A Clerk error
 * is logged and the directory comes back unanswered, so /admin still draws its figures.
 */
export async function clerkDirectory(userIds: readonly string[]): Promise<ClerkDirectory> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return { people: new Map(), answered: true };
  if (process.env.NODE_ENV !== "production" && e2eEnabled(process.env)) {
    const { E2E_PEOPLE } = await import("@/dev/e2e-identity");
    const people = new Map<string, DirectoryPerson>();
    for (const p of Object.values(E2E_PEOPLE)) if (ids.includes(p.userId)) people.set(p.userId, { email: p.email, banned: false });
    return { people, answered: true };
  }
  if (!clerkOn(process.env)) return { people: new Map(), answered: false };
  try {
    const client = await clerkClient();
    const people = new Map<string, DirectoryPerson>();
    for (let i = 0; i < ids.length; i += CLERK_LOOKUP_BATCH) {
      const batch = ids.slice(i, i + CLERK_LOOKUP_BATCH);
      const { data } = await client.users.getUserList({ userId: batch, limit: batch.length });
      for (const u of data) {
        people.set(u.id, { email: u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? null, banned: u.banned });
      }
    }
    return { people, answered: true };
  } catch (error) {
    console.error("clerkDirectory: Clerk did not answer", error);
    return { people: new Map(), answered: false };
  }
}
