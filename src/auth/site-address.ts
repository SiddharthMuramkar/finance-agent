// The site's own address (BETTER_AUTH_URL), which both ways in are built on: Google's redirect URI and the host of
// every emailed sign-in link (#6). Read here once, so Google, email links and Better Auth agree on what counts as set.

type Env = Record<string, string | undefined>;

/** Hosts that may use plain http: this machine only (local development and the browser test bed). */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * BETTER_AUTH_URL as a bare origin, e.g. "https://www.value-it.xyz" (a trailing / or spaces are dropped); null when it
 * is unset or anything else: no scheme, a path, a query, or http on a host other than this machine. Better Auth throws
 * on an address without a scheme and takes a path as its own base path, and every page's sign-in check builds it, so a
 * mistyped address would fail every page; null keeps both ways in off instead, exactly as an unset one does.
 */
export function siteAddress(env: Env = process.env): string | null {
  const value = env.BETTER_AUTH_URL?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const local = url.protocol === "http:" && LOOPBACK.has(url.hostname);
  if (url.protocol !== "https:" && !local) return null;
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
  return url.origin;
}
