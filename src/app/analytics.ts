import { track as vercelTrack } from "@vercel/analytics";

/**
 * The five timing and health events the UX audit asks for (REPORT star-8b), sent through Vercel Web Analytics.
 * A thin wrapper: it never throws and does nothing under tests, so a blocked or missing analytics script can
 * never break a turn or a Widget. Custom events need the Vercel Pro plan or above; on Hobby they are dropped.
 */
export type AnalyticsEvent = "turn_first_text" | "widget_first_pixel" | "widget_interactive" | "widget_timeout" | "widget_fallback";

export type AnalyticsProps = Record<string, string | number | boolean | null>;

/** Where a Widget came from: the item's `source` ("recipe", "compose", "fallback"), or "fence" for one written in the reply text. */
export const widgetLane = (source: unknown): string => (typeof source === "string" && source ? source : "fence");

export function track(name: AnalyticsEvent, props?: AnalyticsProps): void {
  if (process.env.NODE_ENV === "test") return;
  try {
    vercelTrack(name, props);
  } catch {
    // Analytics must never break the page.
  }
}
