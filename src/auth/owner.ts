import { isOwnerLearner } from "./access";
import type { AuthUser } from "./google-learner";
import type { Learner } from "./learners";
import { currentSignIn } from "./session";

// Who the owner is (ADR 0014): no environment variable, no role column. The owner is whoever holds the
// `owner` Learner through a Google or email-link account, linked once with
// `invites add <email> --learner owner`. Only that session opens /admin.

export { isOwnerLearner };

/** The signed-in owner: their Learner and the account it is linked to. */
export type Owner = { learner: Learner; user: AuthUser };

/**
 * The owner, when this request is theirs; otherwise null. Requires a Better Auth session (never the
 * passcode, a shared secret that never changes and is guarded only by a per-address lockout) that is
 * let in as the owner Learner, linked to that very account. Built on `currentSignIn`, so a denial,
 * an archived Learner and sign-in being off all count exactly as they do everywhere else.
 */
export async function signedInOwner(): Promise<Owner | null> {
  const signIn = await currentSignIn();
  if (signIn.kind !== "learner" || signIn.via !== "account") return null;
  if (!isOwnerLearner(signIn.learner) || signIn.learner.authUserId !== signIn.user.id) return null;
  return { learner: signIn.learner, user: signIn.user };
}
