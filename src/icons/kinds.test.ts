import { describe, expect, it } from "vitest";
import { RECIPE_ARCHETYPES } from "@/widgets/recipes/define";
import { CHECK_TAB_ICON, KIND_ICON, NO_KIND_ICON } from "./kinds";
import { isIconName } from "./names";

/** Ticket A1b's table (spec 2026-11-11), held as a literal: each Widget kind and the Icon its tab shows. */
const TABLE = {
  Grow: "seedling",
  Compare: "balance-scale",
  Convert: "exchange",
  Chain: "link",
  Predict: "direct-hit",
  History: "scroll",
  Rank: "ranking",
  Check: "check-mark-button",
  Formula: "formula",
  Story: "story",
  Lingo: "lingo",
  // A Workbench Widget (spec 2026-11-12, B2): several controls feeding one number, drawn as a bar chart.
  workbench: "bar-chart",
};

describe("one Icon per Widget kind (A1b)", () => {
  it("names one Icon for each archetype, from the ticket's table", () => {
    expect(Object.keys(KIND_ICON)).toEqual([...RECIPE_ARCHETYPES]);
    for (const a of RECIPE_ARCHETYPES) expect(KIND_ICON[a]).toBe(TABLE[a]);
  });

  it("draws widget for a Widget with no kind, and the check mark for the Check tab", () => {
    expect(NO_KIND_ICON).toBe("widget");
    expect(CHECK_TAB_ICON).toBe("check-mark-button");
  });

  it("uses only names the Icon set has", () => {
    for (const name of [...Object.values(KIND_ICON), NO_KIND_ICON, CHECK_TAB_ICON]) expect(isIconName(name)).toBe(true);
  });
});
