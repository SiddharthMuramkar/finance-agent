import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { getAuth, googleSignInOn } from "@/auth/better-auth";
import { destinationOrDefault, safeDestination } from "@/auth/destination";
import { learnerForAuthUser } from "@/auth/google-learner";
import { learnerFromCookie } from "@/auth/learners";
import { ACCESS_COOKIE, passcodeList } from "@/auth/passcode";
import { getDb } from "@/db/client";

/** The only files a signed-out visitor may fetch besides Home: the link-preview image (site-metadata.ts). */
const LANDING_ASSET = /^\/landing-assets\/[\w-]+\.(png|webp)$/;

/** Developer pages, open without a sign-in outside production only. In production the page itself also answers 404. */
const DEV_PAGE = /^\/dev(?:\/|$)/;

/** Signing out works signed in or out, so a Learner already signed out in another tab still lands on Home. */
const SIGN_OUT = "/api/logout";

/** Next.js's own query parameters (such as `_rsc`), never part of a page the Learner meant to open. */
const isInternalParam = (key: string) => key === "_rsc" || key.startsWith("__next");

/** The requested page's path and query, without Next.js's internal parameters, if it is a safe destination. */
function rememberedPage(url: URL): string | null {
  const query = new URLSearchParams([...url.searchParams].filter(([key]) => !isInternalParam(key))).toString();
  return safeDestination(url.pathname + (query ? `?${query}` : ""));
}

/**
 * How this request counts at the gate (C1b): "passcode" for a verified `fa_access` (the signature is
 * checked first, so only a correctly signed cookie costs a database read; an archived Learner or a
 * name taken off the passcode list counts as signed out); "google" when Google sign-in is on and a
 * Better Auth session cookie is merely present (optimistic: the page or route still verifies through
 * `currentLearner()` before it reads any data); null otherwise. While Google sign-in is off, Better
 * Auth is skipped entirely and its cookie means nothing here.
 */
async function gate(request: NextRequest): Promise<"passcode" | "google" | null> {
  const cookie = request.cookies.get(ACCESS_COOKIE)?.value;
  if (cookie && (await learnerFromCookie(getDb(), cookie, process.env.SESSION_SECRET ?? "", passcodeList())) !== null) return "passcode";
  if (googleSignInOn(process.env) && getSessionCookie(request)) return "google";
  return null;
}

/**
 * The full Google check behind the optimistic cookie, for the login page only: the real Better Auth
 * session, resolved to a Learner. Only this (or a verified `fa_access`) may skip the login form, so a
 * stale cookie shows the form once instead of looping /study → /login → /study.
 */
async function googleLearnerSignedIn(request: NextRequest): Promise<boolean> {
  const auth = getAuth();
  if (!auth) return false;
  const found = await auth.api.getSession({ headers: request.headers });
  if (!found) return false;
  return (await learnerForAuthUser(getDb(), found.user)) !== null;
}

/**
 * Every page and API route needs a sign-in: a verified passcode cookie, or (optimistically) a Better
 * Auth session cookie while Google sign-in is on. Signed out, only a GET or HEAD of "/" (Home), the link-preview image and
 * the login page, and a POST to the sign-out route, get through; other pages redirect to the login, remembering a
 * GET or HEAD's page as `next`. Verified signed in, the login page skips its form and goes to the safe `next` or /study;
 * an optimistic Google cookie alone never does (it is fully checked first), so a stale cookie cannot loop.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const read = request.method === "GET" || request.method === "HEAD";
  // Developer tools (the Widget harness at /dev/widgets) need no sign-in, and exist only outside production.
  if (read && DEV_PAGE.test(pathname) && process.env.NODE_ENV !== "production") return NextResponse.next();
  const atGate = await gate(request);
  if (atGate) {
    if (read && pathname === "/login") {
      const verified = atGate === "passcode" || (await googleLearnerSignedIn(request));
      if (!verified) return NextResponse.next();
      const next = destinationOrDefault(request.nextUrl.searchParams.get("next"));
      return NextResponse.redirect(new URL(next, request.url), 307);
    }
    return NextResponse.next();
  }

  // A Server Action call or any write to "/" would run server code: refuse it outright.
  if (request.headers.has("next-action") || (pathname === "/" && !read)) {
    return NextResponse.json({ error: "Passcode required" }, { status: 401 });
  }
  // The login page must match exactly: anything looser and the final redirect below would loop.
  if (read && (pathname === "/" || pathname === "/login" || LANDING_ASSET.test(pathname))) return NextResponse.next();
  if (request.method === "POST" && pathname === SIGN_OUT) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Passcode required" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  const next = read ? rememberedPage(request.nextUrl) : null;
  if (next) login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  // `api/login` and `api/auth` (Better Auth's own routes, which must work signed out) skip the proxy only as whole
  // path segments, so "/api/login-anything" is still checked.
  // The login page itself goes through the proxy, so a signed-in visit can skip the form.
  // `api/cron/library-refresh` (exactly) skips it too: Vercel Cron has no passcode cookie, and the route checks CRON_SECRET itself.
  matcher: ["/((?!api/login(?:/|$)|api/auth(?:/|$)|api/cron/library-refresh$|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
