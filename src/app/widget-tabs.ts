/**
 * The Widget panel's tab list (spec 2026-11-12 B6, ADR 0019): at most six tabs. Pure, so the rule is tested on lists.
 *
 * - A Widget that opens the same slider recipe as a tab at new numbers (same recipe id, both with slider presets), or the
 *   same written-ahead Widget (same id), takes that tab in place: its position stays, the tab shows the new numbers
 *   (`sameTab`, used by `updatedInPlace`). Two Lingo cards or two story scenes show different things, not new numbers,
 *   so they keep their own tabs.
 * - When a seventh tab arrives, the oldest tab that is neither written ahead for the Topic nor showing leaves.
 * - When every other tab is written ahead (or showing), the cap still holds: the oldest tab that is not showing leaves,
 *   written ahead or not. The newly arrived tab never leaves on its own arrival.
 *
 * Leaving the list deletes nothing: the Widget's saved state stays under its key, and its chip in the conversation
 * still opens it (it then shows, so it takes a tab again).
 */

/** At most this many Widget tabs in the panel. */
export const MAX_TABS = 6;

/** What the rule reads of a Widget: its key, its arrival number (higher is newer), and what it opens. */
export type TabWidget = {
  key: string;
  number: number;
  /** A written-ahead Widget's id in the Topic file. */
  writtenAhead?: string;
  /** The recipe code drew it from; absent, or "", for a Widget written in a reply or a free-form one. */
  recipe?: string;
  /** The slider values it opened at (by $variable): a Widget with none (a Lingo card, a story) has no numbers to change. */
  preset?: Record<string, number>;
};

/** True when `b` opens the same recipe, or the same written-ahead Widget, as `a`, so it takes `a`'s tab in place. */
export function sameTab(a: Pick<TabWidget, "writtenAhead" | "recipe" | "preset">, b: Pick<TabWidget, "writtenAhead" | "recipe" | "preset">): boolean {
  const sliders = (w: Pick<TabWidget, "preset">) => !!w.preset && Object.keys(w.preset).length > 0;
  return (!!a.writtenAhead && a.writtenAhead === b.writtenAhead) || (!!a.recipe && a.recipe === b.recipe && sliders(a) && sliders(b));
}

/**
 * The tabs the panel lists, oldest first: `widgets` (already updated in place) in order, one arrival at a time, with
 * the cap applied at each arrival. `showing` is the key of the Widget on screen, which never leaves; "oldest" is the
 * lowest arrival number (a tab updated in place counts from its newest Widget).
 */
export function cappedTabs<T extends TabWidget>(widgets: readonly T[], showing: string | undefined, max: number = MAX_TABS): T[] {
  const tabs: T[] = [];
  for (const arrived of widgets) {
    tabs.push(arrived);
    if (tabs.length <= max) continue;
    const leavable = tabs.filter((t) => t !== arrived && t.key !== showing);
    const oldest = (list: readonly T[]) => list.reduce<T | undefined>((o, t) => (!o || t.number < o.number ? t : o), undefined);
    const leaves = oldest(leavable.filter((t) => !t.writtenAhead)) ?? oldest(leavable);
    if (leaves) tabs.splice(tabs.indexOf(leaves), 1);
  }
  return tabs;
}
