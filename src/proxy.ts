import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from "next/server";
import { SIGN_IN_PATH, destinationOrDefault, safeDestination } from "@/auth/destination";
import { clerkOn, passcodeDoorOpen } from "@/auth/gates";
import { learnerFromCookie } from "@/auth/learners";
import { ACCESS_COOKIE, passcodeList } from "@/auth/passcode";
import { getDb } from "@/db/client";
import { e2eEnabled } from "@/dev/e2e-mode";
import { isAuthPage, isPublicFile, isPublicPage } from "@/site/routes";

// What a signed-out visitor may open (the public pages, the auth pages and the public files) is one list,
// src/site/routes.ts, which next.config.ts's no-store headers and the browser test bed read too (issue #69).

/** Developer pages, open without a sign-in outside production only. In production the page itself also answers 404. */
const DEV_PAGE = /^\/dev(?:\/|$)/;

/** Signing out works signed in or out, so a Learner already signed out in another tab still lands on Home. */
const SIGN_OUT = "/api/logout";

/**
 * A signed-out Server Action call that must get through: a POST to the sign-in or sign-up pages while Clerk runs.
 * @clerk/nextjs's ClerkProvider calls its own Server Action (`invalidateCacheAction`, which only expires a throwaway
 * cookie) inside clerk-js `setActive`, before the new session's cookie is written; refused, `setActive` would wait for
 * it forever and a sign-in would never finish. The app defines no Server Actions of its own (proxy.test.ts checks), so
 * only Clerk's can run here.
 */
const isClerkSignInAction = (request: NextRequest) =>
  request.method === "POST" && request.headers.has("next-action") && isAuthPage(request.nextUrl.pathname) && clerkOn(process.env);

/** Next.js's own query parameters (such as `_rsc`), never part of a page the Learner meant to open. */
const isInternalParam = (key: string) => key === "_rsc" || key.startsWith("__next");

/** The requested page's path and query, without Next.js's internal parameters, if it is a safe destination. */
function rememberedPage(url: URL): string | null {
  const query = new URLSearchParams([...url.searchParams].filter(([key]) => !isInternalParam(key))).toString();
  return safeDestination(url.pathname + (query ? `?${query}` : ""));
}

/**
 * True for a verified passcode cookie while the passcode door is open (the signature is checked first, so only a
 * correctly signed cookie costs a database read; an archived Learner, a name taken off the passcode list or a Learner
 * that belongs to an account counts as signed out).
 */
async function passcodeAtGate(request: NextRequest): Promise<boolean> {
  if (!passcodeDoorOpen(process.env)) return false;
  const cookie = request.cookies.get(ACCESS_COOKIE)?.value;
  return cookie !== undefined && (await learnerFromCookie(getDb(), cookie, process.env.SESSION_SECRET ?? "", passcodeList())) !== null;
}

/** The browser test bed's stand-in for a Clerk session: a verified `fa_e2e_person` cookie. Never in a production build. */
async function testBedPersonAtGate(request: NextRequest): Promise<boolean> {
  if (process.env.NODE_ENV === "production" || !e2eEnabled(process.env)) return false;
  const { E2E_PERSON_COOKIE, e2eIdentityFromCookie } = await import("@/dev/e2e-identity");
  return (await e2eIdentityFromCookie(request.cookies.get(E2E_PERSON_COOKIE)?.value, process.env.SESSION_SECRET ?? "")) !== null;
}

/**
 * Every page and API route needs a sign-in: a verified Clerk session (`account`, checked by clerkMiddleware before this
 * runs), or a verified passcode cookie while the door is open. Signed out, only a GET or HEAD of a public page
 * (src/site/routes.ts: matched exactly; /sign-in and /sign-up with every step under them), a public file, a
 * POST to the sign-out route, and while Clerk runs a Server Action call on /sign-in and /sign-up (Clerk's own, which
 * finishes a sign-in: isClerkSignInAction), get through; any other write to a public page or Server Action call
 * answers 401; an API route answers 401; other pages redirect to /sign-in, remembering a GET or HEAD's page as `next`.
 * Signed in, a GET or HEAD of exactly /sign-in skips the form and goes to the safe `next` or /study: every sign-in here
 * is fully verified and every account has a Learner (learnerForClerkUser), so /sign-in and /study can never send anyone
 * back and forth.
 */
async function gate(request: NextRequest, account: boolean): Promise<Response> {
  const { pathname } = request.nextUrl;
  const read = request.method === "GET" || request.method === "HEAD";
  // Developer tools (the Widget harness at /dev/widgets) need no sign-in, and exist only outside production.
  if (read && DEV_PAGE.test(pathname) && process.env.NODE_ENV !== "production") return NextResponse.next();
  if (account || (await passcodeAtGate(request))) {
    if (read && pathname === SIGN_IN_PATH) {
      const next = destinationOrDefault(request.nextUrl.searchParams.get("next"));
      return NextResponse.redirect(new URL(next, request.url), 307);
    }
    return NextResponse.next();
  }

  if (isClerkSignInAction(request)) return NextResponse.next();
  // Any other Server Action call, or any write to a public page, would run server code: refuse it outright.
  if (request.headers.has("next-action") || (isPublicPage(pathname) && !read)) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }
  if (read && (isPublicPage(pathname) || isPublicFile(pathname))) return NextResponse.next();
  if (request.method === "POST" && pathname === SIGN_OUT) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }
  const signIn = new URL(SIGN_IN_PATH, request.url);
  const next = read ? rememberedPage(request.nextUrl) : null;
  if (next) signIn.searchParams.set("next", next);
  return NextResponse.redirect(signIn);
}

/** The gate inside clerkMiddleware, built on the first request that needs it (only while Clerk is on). */
let withClerk: NextMiddleware | undefined;

/**
 * The proxy: while Clerk is on (clerkOn), clerkMiddleware verifies the session and the gate asks it who is here;
 * otherwise Clerk is never called, and the gate reads only the passcode cookie, or in the browser test bed its stand-in
 * for a Clerk session.
 */
export async function proxy(request: NextRequest, event?: NextFetchEvent): Promise<Response> {
  if (!clerkOn(process.env)) return gate(request, await testBedPersonAtGate(request));
  withClerk ??= clerkMiddleware(async (auth, req) => gate(req, (await auth()).isAuthenticated));
  // Next.js always passes the event; clerkMiddleware answers every request our gate answers.
  const response = (await withClerk(request, event as NextFetchEvent)) as Response | null | undefined;
  return response ?? NextResponse.next();
}

export const config = {
  // `api/login` (the passcode door's own route, which must work signed out and checks the door itself) skips the proxy
  // only as a whole path segment, so "/api/login-anything" is still checked. The sign-in page itself goes through the
  // proxy, so a signed-in visit can skip the form.
  // `api/cron/library-refresh` and `api/cron/health` (#36) (exactly) skip it too: Vercel Cron and Schedules have no
  // sign-in, and each route checks CRON_SECRET itself.
  // BotID's challenge segment (withBotId's rewrites in next.config.ts) skips it as a whole segment: the visitor may be signed out.
  matcher: [
    "/((?!api/login(?:/|$)|api/cron/library-refresh$|api/cron/health$|149e9513-01fa-4fb0-aad4-566afd725d1b/|_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
