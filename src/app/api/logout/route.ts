import { NextResponse } from "next/server";
import { ACCESS_COOKIE, ACCESS_COOKIE_OPTIONS } from "@/auth/passcode";

/**
 * True only for a request this site's own pages sent. Sec-Fetch-Site decides when present; otherwise the
 * Origin header must equal the origin the request was sent to (never a hard-coded domain).
 */
function sameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null) return fetchSite === "same-origin";
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

/**
 * Sign out: expires this browser's passcode cookie and sends the Learner to Home with a 303. Changes no
 * Learner data; other devices stay signed in (rotating SESSION_SECRET signs every device out).
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return new NextResponse("Sign out must come from this site.", { status: 403, headers: { "content-type": "text/plain" } });
  }
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(ACCESS_COOKIE, "", { ...ACCESS_COOKIE_OPTIONS, expires: new Date(0) });
  return response;
}

/** Sign out is never a GET, so link prefetching or a crawler can't sign the Learner out. HEAD falls back to this. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
