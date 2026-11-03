import { NextResponse } from "next/server";
import { callerAddress, claimLoginTry, loginFailed, loginSucceeded } from "@/auth/login-guard";
import { ACCESS_COOKIE, accessToken, passcodeMatches } from "@/auth/passcode";
import { getDb } from "@/db/client";

export async function POST(request: Request) {
  const db = getDb();
  const ip = callerAddress(request);
  // The try is claimed before the comparison, so tries sent all at once can't all slip under the limit.
  // Too many wrong guesses lately: refused without even comparing, so a lucky guess can't get through.
  const tryId = await claimLoginTry(db, ip);
  if (tryId === null) return NextResponse.redirect(new URL("/login?locked=1", request.url), 303);
  const form = await request.formData();
  const passcode = String(form.get("passcode") ?? "");
  if (!passcodeMatches(passcode, process.env.PASSCODE ?? "")) {
    await loginFailed(db);
    return NextResponse.redirect(new URL("/login?wrong=1", request.url), 303);
  }
  await loginSucceeded(db, tryId);
  const response = NextResponse.redirect(new URL("/study", request.url), 303);
  response.cookies.set(ACCESS_COOKIE, await accessToken(process.env.SESSION_SECRET ?? ""), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return response;
}
