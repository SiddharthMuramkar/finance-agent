import { NextResponse } from "next/server";
import { getAuth } from "@/auth/better-auth";
import { ACCESS_COOKIE, ACCESS_COOKIE_OPTIONS } from "@/auth/passcode";
import { sameOrigin } from "@/auth/same-origin";

/**
 * Sign out: ends the Better Auth session too when Google sign-in is on, expires this browser's
 * passcode cookie, and sends the Learner to Home with a 303. Both cookies end on one click (C1b).
 * Changes no Learner data; other devices keep their own sessions. While Google sign-in is off there
 * is no instance and Better Auth is skipped, exactly as before.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return new NextResponse("Sign out must come from this site.", { status: 403, headers: { "content-type": "text/plain" } });
  }
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(ACCESS_COOKIE, "", { ...ACCESS_COOKIE_OPTIONS, expires: new Date(0) });
  const auth = getAuth();
  if (auth) {
    const out = await auth.api.signOut({ headers: request.headers, asResponse: true });
    // Appended after cookies.set: NextResponse rewrites the header when its cookie jar changes.
    for (const cookie of out.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
  }
  return response;
}

/** Sign out is never a GET, so link prefetching or a crawler can't sign the Learner out. HEAD falls back to this. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
