import { auth } from "@clerk/nextjs/server";
import { e2eEnabled } from "@/dev/e2e-mode";
import { clerkOn } from "./gates";

/**
 * The person a Clerk session belongs to (issue #33), read from the session token alone: no call to Clerk. `email` and
 * `firstName` are null when the token lacks them (types/clerk.d.ts names the claims the Clerk Dashboard adds). `admin`
 * is true only for `publicMetadata.role = "admin"`, which only the owner sets, in Clerk.
 */
export type Identity = { userId: string; email: string | null; firstName: string | null; admin: boolean };

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** The identity in a verified token's claims. A claim that is missing or of the wrong type reads as null (or not admin). */
export function identityFromClaims(userId: string, claims: CustomJwtSessionClaims | null | undefined): Identity {
  const metadata = claims?.metadata;
  return {
    userId,
    email: text(claims?.email),
    firstName: text(claims?.first_name),
    admin: typeof metadata === "object" && metadata !== null && metadata.role === "admin",
  };
}

/**
 * Who this request's account is, or null when nobody signed in with one. In the browser test bed it is the person the
 * test signed in as (src/dev/e2e-identity.ts, loaded only outside production builds); otherwise, while Clerk is on, the
 * verified Clerk session; otherwise null, without calling Clerk. A pending session (an unfinished session task) counts
 * as signed out, as `auth()` reports it.
 */
export async function currentIdentity(): Promise<Identity | null> {
  if (process.env.NODE_ENV !== "production" && e2eEnabled(process.env)) {
    const { e2eIdentity } = await import("@/dev/e2e-identity");
    return e2eIdentity();
  }
  if (!clerkOn(process.env)) return null;
  const { isAuthenticated, userId, sessionClaims } = await auth();
  return isAuthenticated ? identityFromClaims(userId, sessionClaims) : null;
}
