import type { RecipeArchetype } from "@/widgets/recipes/define";
import type { IconName } from "./names";

// Which Icon names a Widget's kind on the Widget panel's tabs (spec 2026-11-11, ticket A1b, ADR 0014): one per
// archetype, `widget` for a Widget with no archetype, and the check mark for the open quiz's Check tab.

/** Each archetype's Icon, in `ARCHETYPES` order. */
export const KIND_ICON = {
  Grow: "seedling",
  Compare: "balance-scale",
  History: "scroll",
  Formula: "formula",
  Predict: "direct-hit",
  Check: "check-mark-button",
  Rank: "ranking",
  Chain: "link",
  Convert: "exchange",
  Story: "story",
  Lingo: "lingo",
  workbench: "bar-chart",
} as const satisfies Record<RecipeArchetype, IconName>;

/** The Icon of a Widget whose kind is unknown (`archetypeOf` is null). */
export const NO_KIND_ICON = "widget" satisfies IconName;

/** The Icon of the open quiz's Check tab. */
export const CHECK_TAB_ICON = "check-mark-button" satisfies IconName;
