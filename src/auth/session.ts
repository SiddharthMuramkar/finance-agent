import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuth } from "./better-auth";
import { learnerForAuthUser } from "./google-learner";
import { type Learner, learnerFromCookie } from "./learners";
import { ACCESS_COOKIE, passcodeList } from "./passcode";

/**
 * The signed-in Learner of this request, or null when it counts as signed out. Better Auth first
 * (C1b): a Google session resolves to its Learner through `learnerForAuthUser`, and that answer
 * stands even when it is null (not invited, sign-up closed). Only with no Better Auth session does
 * the passcode cookie decide, and only there must the Learner's name be on `PASSCODES`; a
 * Google-linked Learner never needs a passcode. While Google sign-in is off there is no instance and
 * Better Auth is skipped. The proxy has already checked a cookie; every page and route checks again
 * here before reading any Learner data, so an archived Learner is signed out everywhere at once.
 */
export async function currentLearner(): Promise<Learner | null> {
  const auth = getAuth();
  if (auth) {
    const found = await auth.api.getSession({ headers: await headers() });
    if (found) return learnerForAuthUser(getDb(), found.user);
  }
  const jar = await cookies();
  return learnerFromCookie(getDb(), jar.get(ACCESS_COOKIE)?.value, process.env.SESSION_SECRET ?? "", passcodeList());
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
