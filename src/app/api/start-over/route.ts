import { NextResponse } from "next/server";
import { START_OVER_CONFIRM, startOver } from "@/auth/learners";
import { ACCESS_COOKIE, ACCESS_COOKIE_MAX_AGE, ACCESS_COOKIE_OPTIONS, learnerToken } from "@/auth/passcode";
import { sameOrigin } from "@/auth/same-origin";
import { currentSignIn } from "@/auth/session";
import { getDb } from "@/db/client";

export const runtime = "nodejs";

/** Where a fresh Learner lands: the Welcome. */
const WELCOME_PATH = "/welcome";

/**
 * Settings > Start over, after its confirmation: archives the signed-in Learner, makes a fresh empty
 * Learner under the same name, and opens the Welcome. An account keeps its Clerk link on the fresh
 * Learner; a passcode sign-in gets a cookie for it in the same response. Nothing is deleted; other
 * devices holding the old passcode cookie are signed out, because an archived Learner no longer signs in. A plain form post (303), never a GET, and only from this site.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return new NextResponse("Start over must come from this site.", { status: 403, headers: { "content-type": "text/plain" } });
  }
  const form = await request.formData().catch(() => null);
  if (form?.get("confirm") !== START_OVER_CONFIRM) {
    return NextResponse.json({ error: "Confirm Start over first." }, { status: 400 });
  }
  const signIn = await currentSignIn();
  if (signIn.kind !== "learner") return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const { learner } = signIn;
  const fresh = await startOver(getDb(), learner.id);
  if (!fresh) return NextResponse.json({ error: "This Learner has already started over." }, { status: 409 });
  console.info(`Start over: archived Learner ${learner.id}, opened Learner ${fresh.id} (${fresh.name})`);
  const response = NextResponse.redirect(new URL(WELCOME_PATH, request.url), 303);
  // An account finds its fresh Learner through the Clerk link Start over copies; only the passcode door needs a cookie.
  if (signIn.via === "passcode") {
    response.cookies.set(ACCESS_COOKIE, await learnerToken(fresh.id, process.env.SESSION_SECRET ?? ""), {
      ...ACCESS_COOKIE_OPTIONS,
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });
  }
  return response;
}

/** Start over is never a GET, so link prefetching or a crawler can't start the Learner over. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
