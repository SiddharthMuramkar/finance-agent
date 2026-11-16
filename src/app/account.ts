import { currentSignIn, type SignIn } from "@/auth/session";
import type { HeaderAccount } from "./ui";

/** A request that is signed in, by an account or the passcode door. */
export type SignedIn = Extract<SignIn, { kind: "learner" }>;

/**
 * Who the header's account menu and the Settings Account card name (A5, issue #33): the Learner's name and, for an
 * account, the email its Clerk session carries (no call to Clerk, no database read). A passcode Learner has no email
 * and is marked `passcode`, so Settings says "Signed in with a passcode". `admin` (the menu's Admin row) only for an
 * account whose session says admin; the row is only a hint, as /admin checks the session itself (signedInAdmin).
 */
export function accountFor(signIn: SignedIn): HeaderAccount {
  if (signIn.via === "passcode") return { name: signIn.learner.name, passcode: true };
  const { email, admin } = signIn.identity;
  return { name: signIn.learner.name, ...(email ? { email } : {}), ...(admin ? { admin: true } : {}) };
}

/** This request's account, for the header and Settings; undefined when it is signed out. */
export async function currentAccount(): Promise<HeaderAccount | undefined> {
  const signIn = await currentSignIn();
  return signIn.kind === "learner" ? accountFor(signIn) : undefined;
}
