import { NextResponse } from "next/server";
import { ACCESS_COOKIE, accessToken, passcodeMatches } from "@/auth/passcode";

export async function POST(request: Request) {
  const form = await request.formData();
  const passcode = String(form.get("passcode") ?? "");
  if (!passcodeMatches(passcode, process.env.PASSCODE ?? "")) {
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
