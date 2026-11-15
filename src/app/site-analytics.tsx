"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

// Vercel Analytics, minus the sign-in tokens (ADR 0014, issue #33). A Clerk invitation lands on
// /sign-up?__clerk_ticket=<ticket>, and a sign-in link emailed before the Clerk cutover on /login?link=<token> (now sent
// on to /sign-in, query kept); Analytics records every page's full address, query included. Each token signs someone in once, so it is dropped before any event leaves the browser. A client file because the filter is a function, which a server layout can't pass.

/** The old emailed link's `link`, and Clerk's own `__clerk_*` (an invitation's `__clerk_ticket`, a `__clerk_handshake`; issue #33). */
const isSignInParam = (key: string) => key === "link" || key.startsWith("__clerk_");

/** The event without the sign-in parameters; null (sent nowhere) for an address that can't be read, rather than risk a token. */
export function withoutSignInLink(event: BeforeSendEvent): BeforeSendEvent | null {
  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    return null;
  }
  const secret = [...url.searchParams.keys()].filter(isSignInParam);
  if (secret.length === 0) return event;
  for (const key of secret) url.searchParams.delete(key);
  return { ...event, url: url.toString() };
}

/** The site's Vercel Analytics, with the sign-in token filtered out. Rendered once, in the root layout. */
export function SiteAnalytics() {
  return <Analytics beforeSend={withoutSignInLink} />;
}
