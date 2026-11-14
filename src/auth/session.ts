import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { accessFor } from "./access";
import { getAuth } from "./better-auth";
import type { AuthUser } from "./google-learner";
import { type Learner, learnerFromCookie } from "./learners";
import { ACCESS_COOKIE, passcodeList } from "./passcode";

/**
 * Who this request belongs to (ADR 0014):
 * - `learner`: someone who may enter, as this Learner. `via: "account"` is a Better Auth session
 *   (Google or an email link) and carries its user; `via: "passcode"` is the `fa_access` cookie and
 *   never does, so it can never stand for the owner on /admin.
 * - `waiting` / `denied`: signed in with an account that may not enter yet, or ever. They have no
 *   Learner, so every page and route treats them as signed out; only /login shows them their status.
 * - `signed-out`: nobody.
 */
export type SignIn =
  | { kind: "learner"; learner: Learner; via: "account"; user: AuthUser }
  | { kind: "learner"; learner: Learner; via: "passcode"; user?: undefined }
  | { kind: "waiting" | "denied"; user: AuthUser }
  | { kind: "signed-out" };

/**
 * Who signed in, Better Auth first: a session resolves through `accessFor` (a denial first, then
 * their Learner, else waiting), and that answer stands even when it is not a Learner. Only with no
 * Better Auth session does the passcode cookie decide, and only there must the Learner's name be on
 * `PASSCODES`, and its account (if the owner linked one) not be denied. While Better Auth is off
 * (no Google and no email links) there is no instance and it is skipped. The proxy has only checked
 * that a cookie exists; every page and route checks here before reading any Learner data, so an
 * archived or denied Learner is signed out everywhere at once.
 */
export async function currentSignIn(): Promise<SignIn> {
  const auth = getAuth();
  if (auth) {
    const found = await auth.api.getSession({ headers: await headers() });
    if (found) {
      const user: AuthUser = { id: found.user.id, email: found.user.email, name: found.user.name };
      const access = await accessFor(getDb(), user);
      if (access.state === "approved") return { kind: "learner", learner: access.learner, via: "account", user };
      return { kind: access.state, user };
    }
  }
  const jar = await cookies();
  const learner = await learnerFromCookie(getDb(), jar.get(ACCESS_COOKIE)?.value, process.env.SESSION_SECRET ?? "", passcodeList());
  return learner ? { kind: "learner", learner, via: "passcode" } : { kind: "signed-out" };
}

/** The signed-in Learner of this request, or null when it counts as signed out (waiting and denied included). */
export async function currentLearner(): Promise<Learner | null> {
  const signIn = await currentSignIn();
  return signIn.kind === "learner" ? signIn.learner : null;
}

/** True when this request carries a cookie for an active, listed Learner. */
export async function isSignedIn() {
  return (await currentLearner()) !== null;
}

/**
 * The current Learner's id: the one whose Learner Memory, Sessions and turns every page and route
 * reads and writes. A signed-out request is sent to the login instead (the proxy normally does that
 * first; this is the check behind it).
 */
export async function currentLearnerId(): Promise<number> {
  return (await signedInLearner()).id;
}

/** The signed-in Learner (with its Settings choices); a signed-out request is sent to the login instead. */
export async function signedInLearner(): Promise<Learner> {
  const learner = await currentLearner();
  if (!learner) redirect("/login");
  return learner;
}
