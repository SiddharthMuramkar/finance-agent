import { NextResponse } from "next/server";
import { START_OVER_CONFIRM, startOver } from "@/auth/learners";
import { ACCESS_COOKIE, ACCESS_COOKIE_MAX_AGE, ACCESS_COOKIE_OPTIONS, learnerToken } from "@/auth/passcode";
import { sameOrigin } from "@/auth/same-origin";
import { currentLearner } from "@/auth/session";
import { getDb } from "@/db/client";

export const runtime = "nodejs";

/** Where a fresh Learner lands: the Welcome. */
const WELCOME_PATH = "/welcome";

/**
 * Settings > Start over, after its confirmation: archives the signed-in Learner, makes a fresh empty
 * Learner under the same name, signs this browser in as it in the same response, and opens the
 * Welcome. Nothing is deleted; other devices holding the old cookie are signed out, because an
 * archived Learner no longer signs in. A plain form post (303), never a GET, and only from this site.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return new NextResponse("Start over must come from this site.", { status: 403, headers: { "content-type": "text/plain" } });
  }
  const form = await request.formData().catch(() => null);
  if (form?.get("confirm") !== START_OVER_CONFIRM) {
    return NextResponse.json({ error: "Confirm Start over first." }, { status: 400 });
  }
  const learner = await currentLearner();
  if (!learner) return NextResponse.json({ error: "Passcode required" }, { status: 401 });
  const fresh = await startOver(getDb(), learner.id);
  if (!fresh) return NextResponse.json({ error: "This Learner has already started over." }, { status: 409 });
  console.info(`Start over: archived Learner ${learner.id}, opened Learner ${fresh.id} (${fresh.name})`);
  const response = NextResponse.redirect(new URL(WELCOME_PATH, request.url), 303);
  response.cookies.set(ACCESS_COOKIE, await learnerToken(fresh.id, process.env.SESSION_SECRET ?? ""), {
    ...ACCESS_COOKIE_OPTIONS,
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  return response;
}

/** Start over is never a GET, so link prefetching or a crawler can't start the Learner over. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
