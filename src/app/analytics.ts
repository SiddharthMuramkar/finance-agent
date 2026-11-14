import { track as vercelTrack } from "@vercel/analytics";

/**
 * The five timing and health events the UX audit asks for (REPORT star-8b), and Home's six (spec 2026-11-12 E10: so the
 * Owner can tell whether Home works), sent through Vercel Web Analytics. A thin wrapper: it never throws and does nothing
 * under tests, so a blocked or missing analytics script can never break a turn or a Widget. Custom events need the
 * Vercel Pro plan or above; on Hobby they are dropped. Home's events carry no personal data: only which section, how the
 * slider moved, or the visitor's untracked guess.
 */
export type AnalyticsEvent = "turn_first_text" | "widget_first_pixel" | "widget_interactive" | "widget_timeout" | "widget_fallback" | HomeEvent;

/**
 * Home's six events (E10), names shared with the other workstreams: the hero slider's first move, the match found, a
 * lever's first move and the price found (Home's Value levers, section 2), a step of "How every Topic works" opened
 * (section 3), and Join pressed, with the section it was pressed in.
 */
export const HOME_EVENTS = ["home_slider_first_move", "home_match_found", "home_lever_first_move", "home_price_found", "home_step_opened", "home_join_pressed"] as const;
export type HomeEvent = (typeof HOME_EVENTS)[number];

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
