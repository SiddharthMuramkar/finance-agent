import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_DESTINATION, safeDestination } from "@/auth/destination";
import { ACCESS_COOKIE, hasAccess } from "@/auth/passcode";

/** The only files a signed-out visitor may fetch besides the landing page: its screenshots. */
const LANDING_ASSET = /^\/landing-assets\/[\w-]+\.(png|webp)$/;

/** Next.js's own query parameters (such as `_rsc`), never part of a page the Learner meant to open. */
const isInternalParam = (key: string) => key === "_rsc" || key.startsWith("__next");

/** The requested page's path and query, without Next.js's internal parameters, if it is a safe destination. */
function rememberedPage(url: URL): string | null {
  const query = new URLSearchParams([...url.searchParams].filter(([key]) => !isInternalParam(key))).toString();
  return safeDestination(url.pathname + (query ? `?${query}` : ""));
}

/**
 * Every page and API route needs the passcode cookie.
 * Signed out, only a plain GET or HEAD of "/" (the public landing page), its images and exactly the
 * login page get through. Other pages redirect to the login, remembering a GET or HEAD's page as `next`.
 * Signed in, a GET or HEAD of the login page skips the form and goes to the safe `next`, or /study.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const read = request.method === "GET" || request.method === "HEAD";
  const ok = await hasAccess(request.cookies.get(ACCESS_COOKIE)?.value, process.env.SESSION_SECRET ?? "");
  if (ok) {
    if (read && pathname === "/login") {
      const next = safeDestination(request.nextUrl.searchParams.get("next")) ?? DEFAULT_DESTINATION;
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
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Passcode required" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  const next = read ? rememberedPage(request.nextUrl) : null;
  if (next) login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  // `api/login` skips the proxy only as a whole path segment, so "/api/login-anything" is still checked.
  // The login page itself goes through the proxy, so a signed-in visit can skip the form.
  matcher: ["/((?!api/login(?:/|$)|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
