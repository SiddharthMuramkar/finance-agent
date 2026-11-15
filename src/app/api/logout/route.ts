import { NextResponse } from "next/server";
import { ACCESS_COOKIE, ACCESS_COOKIE_OPTIONS } from "@/auth/passcode";
import { sameOrigin } from "@/auth/same-origin";
import { e2eEnabled } from "@/dev/e2e-mode";

/**
 * Sign out of the passcode door (issue #33): expires this browser's `fa_access` cookie and sends the Learner to Home
 * with a 303. A Clerk session lives in Clerk's own cookies, which Clerk's browser SDK ends (src/app/sign-out.tsx posts
 * here first, then asks Clerk). In the browser test bed it also ends the test's stand-in for a Clerk session, the
 * `fa_e2e_person` cookie (src/dev/e2e-identity.ts, loaded only outside production builds). Changes no Learner data.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return new NextResponse("Sign out must come from this site.", { status: 403, headers: { "content-type": "text/plain" } });
  }
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(ACCESS_COOKIE, "", { ...ACCESS_COOKIE_OPTIONS, expires: new Date(0) });
  if (process.env.NODE_ENV !== "production" && e2eEnabled(process.env)) {
    const { E2E_PERSON_COOKIE, E2E_PERSON_COOKIE_OPTIONS } = await import("@/dev/e2e-identity");
    response.cookies.set(E2E_PERSON_COOKIE, "", { ...E2E_PERSON_COOKIE_OPTIONS, expires: new Date(0) });
  }
  return response;
}

/** Sign out is never a GET, so link prefetching or a crawler can't sign the Learner out. HEAD falls back to this. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
