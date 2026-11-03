import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { type Learner, learnerFromCookie } from "./learners";
import { ACCESS_COOKIE, passcodeList } from "./passcode";

/**
 * The signed-in Learner of this request, or null when it counts as signed out. The proxy has already
 * checked the cookie; every page and route checks it again here before reading any Learner data,
 * so an archived Learner, or a name taken off the passcode list, is signed out everywhere at once.
 */
export async function currentLearner(): Promise<Learner | null> {
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
