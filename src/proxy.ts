import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, hasAccess } from "@/auth/passcode";

/** The only files a signed-out visitor may fetch besides the landing page: its screenshots. */
const LANDING_ASSET = /^\/landing-assets\/[\w-]+\.(png|webp)$/;

/**
 * Every page and API route needs the passcode cookie, except the login page itself.
 * Signed out, only a plain GET or HEAD of "/" (the public landing page) and its images get through.
 */
export async function proxy(request: NextRequest) {
  const ok = await hasAccess(request.cookies.get(ACCESS_COOKIE)?.value, process.env.SESSION_SECRET ?? "");
  if (ok) return NextResponse.next();

  const { pathname } = request.nextUrl;
  const read = request.method === "GET" || request.method === "HEAD";
  // A Server Action call or any write to "/" would run server code: refuse it outright.
  if (request.headers.has("next-action") || (pathname === "/" && !read)) {
    return NextResponse.json({ error: "Passcode required" }, { status: 401 });
  }
  if (read && (pathname === "/" || LANDING_ASSET.test(pathname))) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Passcode required" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // `login` and `api/login` skip the proxy only as whole path segments, so "/login-anything" is still checked.
  // `api/cron/library-refresh` (exactly) skips it too: Vercel Cron has no passcode cookie, and the route checks CRON_SECRET itself.
  matcher: ["/((?!login(?:/|$)|api/login(?:/|$)|api/cron/library-refresh$|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
