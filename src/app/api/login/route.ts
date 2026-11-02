import { NextResponse } from "next/server";
import { callerAddress, loginAllowed, recordLoginFailure } from "@/auth/login-guard";
import { ACCESS_COOKIE, accessToken, passcodeMatches } from "@/auth/passcode";
import { getDb } from "@/db/client";

export async function POST(request: Request) {
  const db = getDb();
  const ip = callerAddress(request);
  // Too many wrong guesses lately: refused without even comparing, so a lucky guess can't get through.
  if (!(await loginAllowed(db, ip))) return NextResponse.redirect(new URL("/login?locked=1", request.url), 303);
  const form = await request.formData();
  const passcode = String(form.get("passcode") ?? "");
  if (!passcodeMatches(passcode, process.env.PASSCODE ?? "")) {
    await recordLoginFailure(db, ip);
    return NextResponse.redirect(new URL("/login?wrong=1", request.url), 303);
  }
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(ACCESS_COOKIE, await accessToken(process.env.SESSION_SECRET ?? ""), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return response;
}
