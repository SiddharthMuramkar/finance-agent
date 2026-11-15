import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { accessFor } from "@/auth/access";
import { betterAuthOn, getAuth } from "@/auth/better-auth";
import { destinationOrDefault, safeDestination } from "@/auth/destination";
import { learnerFromCookie } from "@/auth/learners";
import { ACCESS_COOKIE, passcodeList } from "@/auth/passcode";
import { getDb } from "@/db/client";

/** The only files a signed-out visitor may fetch besides Home: the link-preview image (site-metadata.ts). */
const LANDING_ASSET = /^\/landing-assets\/[\w-]+\.(png|webp)$/;

/** The pages a signed-out visitor may read, matched exactly: Home and the About page. */
const PUBLIC_PAGES = new Set(["/", "/about"]);

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
 * checked first, so only a correctly signed cookie costs a database read; an archived Learner, a name
 * taken off the passcode list or a denied account counts as signed out); "account" when Better Auth is
 * on (Google or email links) and its session cookie is merely present (optimistic: the page or route
 * still verifies through `currentLearner()` before it reads any data); null otherwise. While Better
 * Auth is off, it is skipped entirely and its cookie means nothing here.
 */
async function gate(request: NextRequest): Promise<"passcode" | "account" | null> {
  const cookie = request.cookies.get(ACCESS_COOKIE)?.value;
  if (cookie && (await learnerFromCookie(getDb(), cookie, process.env.SESSION_SECRET ?? "", passcodeList())) !== null) return "passcode";
  if (betterAuthOn(process.env) && getSessionCookie(request)) return "account";
  return null;
}

/**
 * The full check behind the gate, for the login page only, in `currentSignIn()`'s order: a real
 * Better Auth session decides first, through the same `accessFor`, and its answer stands even when it
 * is waiting or denied; only with no Better Auth session does a verified `fa_access` count. Only an
 * approved answer may skip the login form, so neither a stale cookie, nor a waiting or denied session
 * (even one whose Learner is still active) beside a valid passcode cookie, can loop /study → /login → /study.
 */
async function signedInAtLogin(request: NextRequest, atGate: "passcode" | "account"): Promise<boolean> {
  const auth = getAuth();
  const found = auth ? await auth.api.getSession({ headers: request.headers }) : null;
  if (found) return (await accessFor(getDb(), found.user)).state === "approved";
  return atGate === "passcode";
}

/**
 * Every page and API route needs a sign-in: a verified passcode cookie, or (optimistically) a Better
 * Auth session cookie while Better Auth is on (Google or email links). Signed out, only a GET or HEAD of a public page
 * ("/" Home and "/about", matched exactly), the link-preview image and the login page, and a POST to the sign-out route,
 * get through; a write to a public page or any Server Action call answers 401; other pages redirect to the login, remembering a
 * GET or HEAD's page as `next`. Verified signed in, the login page skips its form and goes to the safe `next` or /study;
 * an optimistic Better Auth cookie alone never does (it is fully checked first), so a stale cookie, or a
 * waiting or denied person, sees the login page (which shows their status) and cannot loop.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const read = request.method === "GET" || request.method === "HEAD";
  // Developer tools (the Widget harness at /dev/widgets) need no sign-in, and exist only outside production.
  if (read && DEV_PAGE.test(pathname) && process.env.NODE_ENV !== "production") return NextResponse.next();
  const atGate = await gate(request);
  if (atGate) {
    if (read && pathname === "/login") {
      if (!(await signedInAtLogin(request, atGate))) return NextResponse.next();
      const next = destinationOrDefault(request.nextUrl.searchParams.get("next"));
      return NextResponse.redirect(new URL(next, request.url), 307);
    }
    return NextResponse.next();
  }

  // A Server Action call or any write to a public page would run server code: refuse it outright.
  if (request.headers.has("next-action") || (PUBLIC_PAGES.has(pathname) && !read)) {
    return NextResponse.json({ error: "Passcode required" }, { status: 401 });
  }
  // The login page must match exactly: anything looser and the final redirect below would loop.
  if (read && (PUBLIC_PAGES.has(pathname) || pathname === "/login" || LANDING_ASSET.test(pathname))) return NextResponse.next();
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
  // `api/cron/library-refresh` and `api/cron/health` (exactly) skip it too: Vercel Cron and Schedules have no passcode
  // cookie, and each route checks CRON_SECRET itself.
  // BotID's challenge segment (withBotId's rewrites in next.config.ts) skips it as a whole segment: the visitor may be signed out.
  matcher: [
    "/((?!api/login(?:/|$)|api/auth(?:/|$)|api/cron/library-refresh$|api/cron/health$|149e9513-01fa-4fb0-aad4-566afd725d1b/|_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
