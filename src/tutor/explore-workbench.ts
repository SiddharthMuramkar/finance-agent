import { exploreWorkbenchParams } from "@/course/explore-widget";
import type { Topic } from "@/course/map";

/**
 * A Spine Topic's explore Workbench (spec 2026-11-12 B2, C2; ADR 0018) as a show_widget call. Code puts the Workbench in
 * the Widget panel at explore (exploreWidgetOf, src/course/explore-widget.ts), and the Tutor is told it is on screen;
 * the call is the same recipe and params, so show_widget can tell a call that would open it again (opensExploreWorkbench)
 * and point the Tutor at the "Explore" tab instead of drawing a second copy. Pure.
 */
export type WorkbenchCall = NonNullable<ReturnType<typeof exploreWorkbenchParams>>;

/** The show_widget call that opens the Topic's explore Workbench, or null when it has none. */
export function exploreWorkbenchCall(topic: Pick<Topic, "title" | "explore">): WorkbenchCall | null {
  return exploreWorkbenchParams(topic);
}

/**
 * True when a show_widget call opens the Topic's explore Workbench again: the same recipe on the same Case (for a recipe
 * that reads no Case, the same recipe). Code already shows that Workbench as the "Explore" tab, so a second tab would
 * list it twice; show_widget points the Tutor at the open one instead.
 */
export function opensExploreWorkbench(topic: Pick<Topic, "title" | "explore">, recipe: string, params: unknown): boolean {
  const call = exploreWorkbenchCall(topic);
  if (!call || call.recipe !== recipe) return false;
  const want = call.params.inputs.case;
  const got = (params as { inputs?: { case?: unknown } } | null)?.inputs?.case;
  return want === undefined || got === undefined || got === want;
}
