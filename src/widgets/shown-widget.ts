/**
 * A Widget the Tutor asked for with show_widget (code drew it from a Widget recipe, ADR 0005) or compose_widget (the
 * compose model wrote it, or code fell back to a recipe). It is stored as a
 * Session item, not written into the reply, so it carries its own identity: the tool call's id, the recipe and the
 * params the Tutor chose, and the OpenUI Lang program code compiled from them. No server imports: the browser
 * matches on the kind (thread.tsx) and draws `code` like any other Widget.
 */

/** The Session item kind of a Widget code drew from a recipe. */
export const WIDGET_SHOWN = "widget_shown";

/**
 * Where a shown Widget's code came from: a recipe (show_widget), a free-form program the compose model wrote
 * (compose_widget), a recipe code showed because the free-form one timed out or failed (compose_widget's fallback),
 * or a Companion Widget code added to a reply that had none (E4a, src/tutor/companion.ts).
 */
export type ShownWidgetSource = "recipe" | "compose" | "fallback" | "companion";

const SOURCES: readonly ShownWidgetSource[] = ["recipe", "compose", "fallback", "companion"];

/** The rule a Companion Widget came from (src/tutor/companion.ts), in the order code tries them. */
export type CompanionRule = "scene" | "lingo" | "running_example" | "case";

const COMPANION_RULES: readonly CompanionRule[] = ["scene", "lingo", "running_example", "case"];

/** compose_widget's server timings, kept with the Widget so the eval and the panel can read them. */
export type ComposeTimings = {
  /** How long the compose model ran, in ms (0 when it was not asked). */
  composeMs: number;
  /** Why code fell back to a recipe; absent when the free-form Widget was shown. */
  fallbackReason?: "timeout" | "failed" | "checks";
};

/** The data of a WIDGET_SHOWN item. */
export type ShownWidget = {
  /** The show_widget tool call's id: the Widget's own id, unique in the Session. */
  id: string;
  /** The recipe code drew it from; "" for a free-form Widget (source "compose"). */
  recipe: string;
  /** The params as the recipe parsed them (defaults filled in). */
  params: Record<string, unknown>;
  /** The Widget's title, which is its Widget key (widgetKey) for slider state, readings and updates in place. */
  title: string;
  /** The compiled OpenUI Lang program. */
  code: string;
  source: ShownWidgetSource;
  /** compose_widget only: its timings and whether it fell back. */
  timings?: ComposeTimings;
  /** A Companion Widget only (source "companion"): the rule that picked it. */
  companion?: CompanionRule;
  /** A Companion Widget only: what it shows, the scene id or the term, so a Session shows each once. */
  companionKey?: string;
  /** The Topic scene it shows, by id, when the Tutor showed a written-ahead headline scene, so a Session shows each scene once. */
  scene?: string;
};

/** The item's data as a ShownWidget, or null when it is not one (an older or broken row). */
export function shownWidgetOf(data: Record<string, unknown> | undefined): ShownWidget | null {
  if (!data || typeof data.code !== "string" || typeof data.title !== "string" || !data.code.trim()) return null;
  return {
    id: typeof data.id === "string" ? data.id : "",
    recipe: typeof data.recipe === "string" ? data.recipe : "",
    params: data.params && typeof data.params === "object" ? (data.params as Record<string, unknown>) : {},
    title: data.title,
    code: data.code,
    source: SOURCES.includes(data.source as ShownWidgetSource) ? (data.source as ShownWidgetSource) : "recipe",
    ...(data.timings && typeof data.timings === "object" ? { timings: data.timings as ComposeTimings } : {}),
    ...(COMPANION_RULES.includes(data.companion as CompanionRule) ? { companion: data.companion as CompanionRule } : {}),
    ...(typeof data.companionKey === "string" ? { companionKey: data.companionKey } : {}),
    ...(typeof data.scene === "string" ? { scene: data.scene } : {}),
  };
}

/** A shown Widget's code as a reply fence, so code that reads Widgets from reply text can read it in place. */
export const asFence = (code: string) => "```openui-lang\n" + code + "\n```";
