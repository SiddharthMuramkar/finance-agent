import { JOIN_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "../auth/destination";
import { EXAMPLE_SLUGS, examplePath } from "./examples";

// The one list of what a Visitor may open (issue #69): the sign-in gate (src/proxy.ts), the no-store headers
// (next.config.ts) and the browser test bed's page lists all read it, and src/proxy.test.ts fails if they disagree.
// Pure on purpose, with relative imports only: next.config.ts loads it outside the app's `@/` aliases.

/**
 * A page a signed-out Visitor may read, matched exactly (decision #7). `site` marks the Signal site's pages
 * (src/app/(site)): their nav and CTAs follow the viewer state, so they are sent no-store. `sitemap` marks the pages a
 * search engine should list.
 */
export type PublicPage = { path: string; site: boolean; sitemap: boolean };

/**
 * A file a signed-out Visitor may fetch, matched by `pattern`. `samples` are real paths it serves (the tests ask the
 * gate about each). Some never reach the proxy at all: its matcher skips them (src/proxy.ts `config`).
 */
export type PublicFile = { id: string; pattern: RegExp; samples: readonly string[] };

/** The case pages, from the same list as their generateStaticParams, so an unknown slug is never public. */
const CASE_PAGES = EXAMPLE_SLUGS.map(examplePath);

/** Home, How it works, Examples, the case pages, About, and the Waitlist (/join, issue #33). */
export const PUBLIC_PAGES: readonly PublicPage[] = [
  { path: "/", site: true, sitemap: true },
  { path: "/how-it-works", site: true, sitemap: true },
  { path: "/examples", site: true, sitemap: true },
  ...CASE_PAGES.map((path) => ({ path, site: true, sitemap: true })),
  { path: "/about", site: true, sitemap: true },
  { path: JOIN_PATH, site: false, sitemap: true },
];

/** The files: the link-preview images (src/app/site-metadata.ts) and the icons. */
export const PUBLIC_FILES: readonly PublicFile[] = [
  { id: "share-images", pattern: /^\/landing-assets\/[\w-]+\.(png|webp)$/, samples: ["/landing-assets/workspace-light.png"] },
  { id: "icon", pattern: /^\/(icon\.svg|favicon\.ico)$/, samples: ["/icon.svg", "/favicon.ico"] },
];

/** The sign-in and sign-up pages, with every step under them (Clerk's catch-all routes, such as /sign-in/sso-callback). */
export const AUTH_ROOTS: readonly string[] = [SIGN_IN_PATH, SIGN_UP_PATH];

/**
 * Everything else the app answers, each with every path under it: the signed-in pages, the developer pages (open
 * outside production only) and the API (401 signed out).
 */
export const SIGNED_IN_ROOTS: readonly string[] = [
  "/study", "/course", "/notebook", "/settings", "/profile", "/admin", "/welcome", "/sessions", "/passages", "/dev", "/api",
];

/** The Signal site's pages, in the order the site nav lists them. */
export const SITE_PAGES: readonly string[] = PUBLIC_PAGES.filter((p) => p.site).map((p) => p.path);

/** The case page that stands for all five where one is enough (they are one route): the browser specs and the warm-up. */
export const STAND_IN_CASE = examplePath("amazon-2000");

/** The site pages with one case page for the five. */
export const SITE_PAGES_ONE_CASE: readonly string[] = SITE_PAGES.filter((path) => !CASE_PAGES.includes(path) || path === STAND_IN_CASE);

/** next.config.ts's header sources for the site pages: the five case pages are one source. */
export const NO_STORE_SOURCES: readonly string[] = [...new Set(SITE_PAGES.map((path) => (CASE_PAGES.includes(path) ? "/examples/:slug" : path)))];

const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

/** /sign-in or /sign-up, or any step under them. */
export const isAuthPage = (path: string) => AUTH_ROOTS.some((root) => under(path, root));

/** A public page (exactly) or an auth page. */
export const isPublicPage = (path: string) => PUBLIC_PAGES.some((p) => p.path === path) || isAuthPage(path);

/** A signed-in page, a developer page or an API route: a signed-out request there is sent to the sign-in, or refused. */
export const isSignedInPath = (path: string) => SIGNED_IN_ROOTS.some((root) => under(path, root));

/** A public file. */
export const isPublicFile = (path: string) => PUBLIC_FILES.some((f) => f.pattern.test(path));
