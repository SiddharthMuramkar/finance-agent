// Widget state: a Widget's saved work in one Session, its slider values and ticked Guided Tasks (spec #119,
// "Widgets › Widget state"). The pure part, shared by the browser, the route and the store: the shape, the
// limits and how a request's body is cleaned. No React and no database.

/** One Widget's saved work: the numbers on its sliders by `$variable`, and the texts of the Guided Tasks it has ticked. */
export type SavedWidget = { values: Record<string, number>; ticked: string[] };

/** A Session's saved Widgets by Widget key: the written-ahead Widget's id, or the title of a Widget the Tutor drew. */
export type WidgetStates = Record<string, SavedWidget>;

export const MAX_WIDGET_KEY = 200;
export const MAX_VALUES = 20;
export const MAX_TICKED = 20;
export const MAX_TASK_TEXT = 300;

/** The key the explore Widget (shown by code from the Topic file, not drawn by the Tutor) is saved under. */
export const EXPLORE_WIDGET_KEY = "explore";

/**
 * A Widget's key: the explore Widget's own, else its title. A Widget with no title has no key, so its work is
 * kept only while the page is open.
 */
export function widgetKey(title: string | null | undefined, explore = false): string | undefined {
  if (explore) return EXPLORE_WIDGET_KEY;
  const trimmed = title?.trim();
  return trimmed ? trimmed.slice(0, MAX_WIDGET_KEY) : undefined;
}

/**
 * What the browser sent as a Widget's saved work, or null when it is not that: values are finite numbers on
 * `$variable` names, ticks are short texts, each within its limit.
 */
export function cleanSavedWidget(raw: unknown): SavedWidget | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { values, ticked } = raw as { values?: unknown; ticked?: unknown };
  if (!values || typeof values !== "object" || Array.isArray(values) || !Array.isArray(ticked)) return null;
  const entries = Object.entries(values as Record<string, unknown>);
  if (entries.length > MAX_VALUES || ticked.length > MAX_TICKED) return null;
  if (!entries.every(([k, v]) => /^\$[A-Za-z_]\w*$/.test(k) && typeof v === "number" && Number.isFinite(v))) return null;
  if (!ticked.every((t) => typeof t === "string" && t.length <= MAX_TASK_TEXT)) return null;
  return { values: Object.fromEntries(entries) as Record<string, number>, ticked: [...new Set(ticked as string[])] };
}
