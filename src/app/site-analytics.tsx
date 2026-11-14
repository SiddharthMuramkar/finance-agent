"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

// Vercel Analytics, minus the sign-in token (ADR 0014). An emailed sign-in link lands on /login?link=<token>, and
// Analytics records every page's full address, query included. The token signs someone in once, so it is dropped
// before any event leaves the browser. A client file because the filter is a function, which a server layout can't pass.

/** The event without the `link` parameter; null (sent nowhere) for an address that can't be read, rather than risk a token. */
export function withoutSignInLink(event: BeforeSendEvent): BeforeSendEvent | null {
  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    return null;
  }
  if (!url.searchParams.has("link")) return event;
  url.searchParams.delete("link");
  return { ...event, url: url.toString() };
}

/** The site's Vercel Analytics, with the sign-in token filtered out. Rendered once, in the root layout. */
export function SiteAnalytics() {
  return <Analytics beforeSend={withoutSignInLink} />;
}
