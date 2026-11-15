import { createHash, timingSafeEqual } from "node:crypto";

// The cron routes' access (the weekly Library refresh and the health check). Its own file, with no imports beyond
// Node, so the health route does not load the Library's parsers.

/** True only for `Authorization: Bearer <CRON_SECRET>`; no secret set means nobody gets in. */
export function isCronRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
