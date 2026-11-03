import { cookies } from "next/headers";
import { ACCESS_COOKIE, hasAccess } from "./passcode";

/** True when this request carries the passcode cookie. Pages call it before reading any Learner data. */
export async function isSignedIn() {
  const jar = await cookies();
  return hasAccess(jar.get(ACCESS_COOKIE)?.value, process.env.SESSION_SECRET ?? "");
}
