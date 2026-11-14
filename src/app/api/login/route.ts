import { NextResponse } from "next/server";
import { destinationOrDefault, safeDestination } from "@/auth/destination";
import { callerAddress, claimLoginTry, loginFailed, loginSucceeded } from "@/auth/login-guard";
import { signInAs } from "@/auth/learners";
import { ACCESS_COOKIE, ACCESS_COOKIE_MAX_AGE, ACCESS_COOKIE_OPTIONS, learnerToken, nameForPasscode, passcodeList } from "@/auth/passcode";
import { getDb } from "@/db/client";

/** Back to the login page with its message; a safe `next` is carried on, and with none the query stays exactly `?wrong=1` or `?locked=1`. */
function backToLogin(request: Request, message: "wrong" | "locked", next: string | null) {
  const url = new URL("/login", request.url);
  url.searchParams.set(message, "1");
  if (next) url.searchParams.set("next", next);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const db = getDb();
  const ip = callerAddress(request);
  const form = await request.formData();
  const next = safeDestination(form.get("next"));
  // The try is claimed before the comparison, so tries sent all at once can't all slip under the limit.
  // Too many wrong guesses lately: refused without even comparing, so a lucky guess can't get through.
  const tryId = await claimLoginTry(db, ip);
  if (tryId === null) return backToLogin(request, "locked", next);
  const passcode = String(form.get("passcode") ?? "");
  const name = nameForPasscode(passcode, passcodeList());
  if (name === null) {
    await loginFailed(db);
    return backToLogin(request, "wrong", next);
  }
  await loginSucceeded(db, tryId);
  // The name's active Learner, made on its first sign-in.
  const learner = await signInAs(db, name);
  console.info(`Sign-in: opened Learner ${learner.id} (${learner.name})`);
  // Only the resolved, safe path is used, never the submitted text, so the redirect can't leave the site.
  const response = NextResponse.redirect(new URL(destinationOrDefault(next), request.url), 303);
  response.cookies.set(ACCESS_COOKIE, await learnerToken(learner.id, process.env.SESSION_SECRET ?? ""), {
    ...ACCESS_COOKIE_OPTIONS,
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  return response;
}
