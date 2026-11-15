import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { learnerForClerkUser } from "./clerk-learner";
import { SIGN_IN_PATH } from "./destination";
import { passcodeDoorOpen } from "./gates";
import { currentIdentity, type Identity } from "./identity";
import { type Learner, learnerFromCookie } from "./learners";
import { ACCESS_COOKIE, passcodeList } from "./passcode";

/**
 * Who this request belongs to (issue #33):
 * - `learner` `via: "account"`: a Clerk session (in the browser test bed, its stand-in), with the identity its token
 *   carries. Who may sign in at all is Clerk's call (Waitlist mode), so every account has a Learner.
 * - `learner` `via: "passcode"`: the `fa_access` cookie, only while the passcode door is open (never in production). It
 *   carries no identity, so it can never stand for the admin.
 * - `signed-out`: nobody.
 */
export type SignIn =
  | { kind: "learner"; learner: Learner; via: "account"; identity: Identity }
  | { kind: "learner"; learner: Learner; via: "passcode"; identity?: undefined }
  | { kind: "signed-out" };

/**
 * Who signed in, the account first: its Learner is made or found on first use and always exists. Only with no account
 * does the passcode cookie decide, and only while the door is open, for an active Learner whose name is on `PASSCODES`
 * and who belongs to no account. The proxy has only let the request through; every page and route checks here before
 * reading any Learner data, so an archived Learner is signed out everywhere at once.
 */
export async function currentSignIn(): Promise<SignIn> {
  const identity = await currentIdentity();
  if (identity) return { kind: "learner", learner: await learnerForClerkUser(getDb(), identity), via: "account", identity };
  if (!passcodeDoorOpen(process.env)) return { kind: "signed-out" };
  const jar = await cookies();
  const learner = await learnerFromCookie(getDb(), jar.get(ACCESS_COOKIE)?.value, process.env.SESSION_SECRET ?? "", passcodeList());
  return learner ? { kind: "learner", learner, via: "passcode" } : { kind: "signed-out" };
}

/** The signed-in Learner of this request, or null when it is signed out. */
export async function currentLearner(): Promise<Learner | null> {
  const signIn = await currentSignIn();
  return signIn.kind === "learner" ? signIn.learner : null;
}

/** True when this request is signed in, by an account or a passcode. */
export async function isSignedIn() {
  return (await currentLearner()) !== null;
}

/**
 * The current Learner's id: the one whose Learner Memory, Sessions and turns every page and route
 * reads and writes. A signed-out request is sent to the sign-in instead (the proxy normally does that
 * first; this is the check behind it).
 */
export async function currentLearnerId(): Promise<number> {
  return (await signedInLearner()).id;
}

/** The signed-in Learner (with its Settings choices); a signed-out request is sent to the sign-in instead. */
export async function signedInLearner(): Promise<Learner> {
  const learner = await currentLearner();
  if (!learner) redirect(SIGN_IN_PATH);
  return learner;
}
