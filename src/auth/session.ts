import { cookies } from "next/headers";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { ACCESS_COOKIE, hasAccess } from "./passcode";

/** True when this request carries the passcode cookie. Pages call it before reading any Learner data. */
export async function isSignedIn() {
  const jar = await cookies();
  return hasAccess(jar.get(ACCESS_COOKIE)?.value, process.env.SESSION_SECRET ?? "");
}

/**
 * The current Learner of this request: the one whose Learner Memory, Sessions and turns every page and
 * route reads and writes. Until each person signs in with their own passcode, the one passcode signs in
 * as the owner, so every signed-in request is the owner's.
 */
export async function currentLearnerId(): Promise<number> {
  return OWNER_LEARNER_ID;
}
