import type { Identity } from "./identity";
import type { Learner } from "./learners";
import { currentSignIn } from "./session";

// Who the admin is (issue #33): whoever's Clerk session carries `publicMetadata.role = "admin"`, which only the owner
// sets, in Clerk. No environment variable, no Learner name, no role column.

/** The signed-in admin: their Learner and the identity their session carries. */
export type Admin = { learner: Learner; identity: Identity };

/**
 * The admin, when this request is theirs; otherwise null. Requires an account sign-in whose token says admin: never the
 * passcode (a shared secret, and a closed door in production). Built on `currentSignIn`, so an archived Learner and
 * Clerk being off count exactly as they do everywhere else.
 */
export async function signedInAdmin(): Promise<Admin | null> {
  const signIn = await currentSignIn();
  if (signIn.kind !== "learner" || signIn.via !== "account" || !signIn.identity.admin) return null;
  return { learner: signIn.learner, identity: signIn.identity };
}
