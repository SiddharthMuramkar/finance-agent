import { describe, expect, it } from "vitest";
import { recipeById } from "@/widgets/recipes";
import { loadCourseMap } from "./map";

// Percent's Widgets (spec #229, "The rate Widget"): the written-ahead "One rate change, said three ways" is gone, and
// every Concept card opens the rate_move recipe already set to the Running example, 4% to 5%, in show mode.

const percent = loadCourseMap().topic("num-percent-bps")!;

describe("Percent's Widgets", () => {
  it("has no written-ahead Widget, step setting or found line left", () => {
    expect(percent.widgets).toEqual([]);
    expect(percent.steps ?? []).not.toContainEqual(expect.objectContaining({ opens: expect.anything() }));
    expect(percent.found ?? []).toEqual([]);
  });

  it("opens rate_move at 4% to 5% in show mode on every card, built under the card's title", () => {
    for (const check of percent.checks) {
      const card = check.card!;
      expect(card.widget).toEqual({ recipe: "rate_move", inputs: { old: 4, new: 5, mode: "show" } });
      const built = recipeById("rate_move")!.build({ title: card.title, inputs: { old: 4, new: 5, mode: "show" }, refs: {}, facts: {} });
      expect(built.ok).toBe(true);
    }
  });

  it("keeps the Case's outcome out of every card: no card shows the 1994 move", () => {
    for (const check of percent.checks) expect(check.card!.lines.join(" ")).not.toMatch(/3\.25/);
  });
});
