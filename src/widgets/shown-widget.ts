/**
 * A Widget the Tutor asked for with show_widget and code drew from a Widget recipe (ADR 0005). It is stored as a
 * Session item, not written into the reply, so it carries its own identity: the tool call's id, the recipe and the
 * params the Tutor chose, and the OpenUI Lang program code compiled from them. No server imports: the browser
 * matches on the kind (thread.tsx) and draws `code` like any other Widget.
 */

/** The Session item kind of a Widget code drew from a recipe. */
export const WIDGET_SHOWN = "widget_shown";

/** Where a shown Widget's code came from: a recipe today; freeform (compose_widget) comes later. */
export type ShownWidgetSource = "recipe";

/** The data of a WIDGET_SHOWN item. */
export type ShownWidget = {
  /** The show_widget tool call's id: the Widget's own id, unique in the Session. */
  id: string;
  recipe: string;
  /** The params as the recipe parsed them (defaults filled in). */
  params: Record<string, unknown>;
  /** The Widget's title, which is its Widget key (widgetKey) for slider state, readings and updates in place. */
  title: string;
  /** The compiled OpenUI Lang program. */
  code: string;
  source: ShownWidgetSource;
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
    source: "recipe",
  };
}

/** A shown Widget's code as a reply fence, so code that reads Widgets from reply text can read it in place. */
export const asFence = (code: string) => "```openui-lang\n" + code + "\n```";
