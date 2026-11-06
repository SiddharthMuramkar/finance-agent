import { describe, expect, it } from "vitest";
import { RECIPE_IDS, recipeById } from "@/widgets/recipes";
import { fallbackCandidates } from "./compose";
import { ENGINE_INSTRUCTIONS, ENGINE_TOOLS, ENGINE_TOOLS_WITH_COMPOSE } from "./instructions";
import { illustrationProblems, normalizePreset, presetProblems, QUICK_CHECK_REFUSAL, TUTOR_RECIPE_IDS, tutorRecipeSignatures, widgetValidator } from "./ready-made-widgets";

// Ready-made Widgets only (spec #229, ticket #242, ADR 0007): the Tutor's catalogue, a preset's checks, the facts a recipe
// may not be given, and the reply check's Widget validator.

const WIDGET = [
  'root = Widget("What the annuity is worth today", [rate, years])',
  "$rate = 5",
  "$years = 30",
  'rate = Slider("rate", "Discount rate", 0, 10, 0.01, $rate, "percent")',
  'years = Slider("years", "Years", 1, 30, 1, $years, "years")',
].join("\n");

describe("the Tutor's catalogue", () => {
  it("is every recipe except quick_check and percent_points, and holds rate_move", () => {
    expect(TUTOR_RECIPE_IDS).toContain("rate_move");
    expect(TUTOR_RECIPE_IDS).not.toContain("quick_check");
    expect(TUTOR_RECIPE_IDS).not.toContain("percent_points");
    expect([...TUTOR_RECIPE_IDS].sort()).toEqual(RECIPE_IDS.filter((id) => id !== "quick_check" && id !== "percent_points").sort());
  });

  it("lists the same recipes in the signatures the instructions carry", () => {
    const lines = tutorRecipeSignatures().split("\n");
    expect(lines.filter((l) => /^- [a-z_]+ \(/.test(l))).toHaveLength(TUTOR_RECIPE_IDS.length);
    expect(tutorRecipeSignatures()).not.toContain("- quick_check (");
    expect(ENGINE_INSTRUCTIONS).toContain("- rate_move (");
    expect(ENGINE_INSTRUCTIONS).not.toContain("- quick_check (");
    expect(ENGINE_INSTRUCTIONS).not.toContain("compose_widget");
  });

  it("lists the nine story recipes (E3), with headline by scene id only, and tells the Tutor to use them", () => {
    for (const id of ["story_scene", "lingo_card", "timeline", "two_paths", "money_jar", "who_pays_whom", "myth_or_fact", "headline", "choice_cards"]) {
      expect(TUTOR_RECIPE_IDS, id).toContain(id);
      expect(tutorRecipeSignatures(), id).toContain(`- ${id} (`);
    }
    const headlineLine = tutorRecipeSignatures()
      .split("\n")
      .filter((l) => l.startsWith("- headline (") || l.includes('"scene"'))
      .join(" ");
    expect(headlineLine).toContain('"scene"');
    expect(headlineLine).not.toContain('"paper"');
    expect(ENGINE_INSTRUCTIONS).toContain("For a story moment, a word or a who-pays-whom, show the story recipe that fits; never write a fact the Case does not give.");
    // A front page is written ahead: no compose fallback may show the headline recipe's example in a random Topic.
    expect(fallbackCandidates("History").map((c) => c.recipe)).not.toContain("headline");
  });

  it("accepts a headline scene reference and a stored, resolved headline in the Widget validator", () => {
    const valid = widgetValidator([]);
    expect(valid({ kind: "recipe", id: "headline", params: { title: "Rates up", inputs: { scene: "fed-front-page" }, refs: {}, facts: {} } })).toBeNull();
    // The stored form (code resolved the scene before storing) builds as it is.
    const stored = recipeById("headline")!.examples[0] as Record<string, unknown>;
    expect(valid({ kind: "recipe", id: "headline", params: stored })).toBeNull();
  });

  it("offers show_widget, open_widget (with a preset) and update_widget, and compose_widget only to a Session that has it", () => {
    expect(ENGINE_TOOLS.map((t) => t.name)).toEqual(expect.arrayContaining(["open_widget", "show_widget", "update_widget"]));
    expect(ENGINE_TOOLS.map((t) => t.name)).not.toContain("compose_widget");
    expect(ENGINE_TOOLS_WITH_COMPOSE.map((t) => t.name)).toContain("compose_widget");
    const open = ENGINE_TOOLS.find((t) => t.name === "open_widget") as unknown as { input_schema: { properties: Record<string, unknown> } };
    expect(Object.keys(open.input_schema.properties)).toEqual(["id", "preset"]);
    const show = ENGINE_TOOLS.find((t) => t.name === "show_widget") as unknown as { input_schema: { properties: { recipe: { enum: string[] } } } };
    expect(show.input_schema.properties.recipe.enum).toEqual([...TUTOR_RECIPE_IDS]);
  });
});

describe("presetProblems", () => {
  it("accepts slider values by $variable or bare name, within range and on step", () => {
    expect(presetProblems(WIDGET, { $rate: 3.38, years: 12 })).toEqual([]);
    expect(normalizePreset({ rate: 4, $years: 2 })).toEqual({ $rate: 4, $years: 2 });
  });

  it("refuses an unknown slider, a value out of range and a value off its step", () => {
    expect(presetProblems(WIDGET, { $price: 3 }).join(" ")).toMatch(/\$price is not one of its sliders/);
    expect(presetProblems(WIDGET, { $rate: 11 }).join(" ")).toMatch(/\$rate = 11 must be from 0 to 10/);
    expect(presetProblems(WIDGET, { $years: 2.5 }).join(" ")).toMatch(/\$years = 2.5 is not on a step of 1/);
    // A percent slider always moves in 0.01 steps, whatever step it is written with.
    expect(presetProblems(WIDGET, { $rate: 3.005 }).join(" ")).toMatch(/not on a step of 0.01/);
  });
});

describe("Illustrations", () => {
  it("refuses a fact that a Case Data path of the same recipe covers, naming the path to use", () => {
    const problems = illustrationProblems("buying_power", { inputs: {}, refs: { price: "reference/gold-inr-10g" }, facts: { price: 20 } });
    expect(problems.join(" ")).toMatch(/refs\.price/);
    expect(illustrationProblems("buying_power", { inputs: {}, refs: {}, facts: { price: 20 } })).toEqual([]);
    expect(illustrationProblems("fx_convert", { inputs: {}, refs: { unitPrice: "reference/x" }, facts: { unitPriceUsd: 2 } }).join(" ")).toMatch(/refs\.unitPrice/);
  });

  it("refuses a fact that an input covers, naming the input", () => {
    expect(illustrationProblems("percent_points", { inputs: {}, refs: {}, facts: { before: 6.5 } }).join(" ")).toMatch(/inputs\.slider\.start/);
  });

  it("leaves a made-up number no path covers as an Illustration", () => {
    expect(illustrationProblems("price_over_time", { inputs: {}, refs: {}, facts: { amount: 20 } })).toEqual([]);
    expect(illustrationProblems("grow_money", { inputs: {}, refs: {}, facts: {} })).toEqual([]);
  });
});

describe("widgetValidator", () => {
  const valid = widgetValidator([{ id: "annuity-worth-today", code: WIDGET }]);
  const rate = recipeById("rate_move")!;

  it("takes a known written-ahead Widget with a valid preset, and refuses an unknown id or a bad preset", () => {
    expect(valid({ kind: "written", id: "annuity-worth-today", params: { $rate: 4 } })).toBeNull();
    expect(valid({ kind: "written", id: "annuity-worth-today" })).toBeNull();
    expect(valid({ kind: "written", id: "nothing" })).toMatch(/no written-ahead Widget "nothing"/);
    expect(valid({ kind: "written", id: "annuity-worth-today", params: { $rate: 40 } })).toMatch(/must be from 0 to 10/);
  });

  it("takes a Tutor recipe with params that fit, and refuses quick_check, other recipes and params that do not fit", () => {
    const params = (rate.examples[0] as Record<string, unknown>) ?? {};
    expect(valid({ kind: "recipe", id: "rate_move", params })).toBeNull();
    expect(valid({ kind: "recipe", id: "quick_check", params: {} })).toBe(QUICK_CHECK_REFUSAL.replace("Not shown: ", ""));
    expect(valid({ kind: "recipe", id: "no_such", params: {} })).toMatch(/no Widget recipe/);
    expect(valid({ kind: "recipe", id: "rate_move", params: { title: "x" } })).toMatch(/do not fit the rate_move recipe/);
  });
});

describe("a shown rate_move Widget's readouts", () => {
  it("finds the two rate sliders so code can work out the three readouts for the Tutor", async () => {
    const { rateMoveSliders } = await import("./widget-context");
    const { readWidget } = await import("@/widgets/widget-reading");
    const built = recipeById("rate_move")!.build({ title: "A rate move", inputs: { old: 4, new: 5 }, refs: {}, facts: {} });
    if (!built.ok) throw new Error(built.error);
    const sliders = rateMoveSliders(built.code);
    expect(sliders).toEqual({ old: "$old", new: "$new" });
    const reading = readWidget(built.code, undefined, () => undefined, false, sliders);
    expect(reading?.readouts.join("; ")).toContain("1 point");
    expect(reading?.readouts.join("; ")).toContain("100 bp");
    expect(reading?.readouts.join("; ")).toContain("25%");
    // Practice mode has no rate sliders to read.
    const practice = recipeById("rate_move")!.build({ title: "A rate move", inputs: { old: 4, new: 5, mode: "practice" }, refs: {}, facts: {} });
    if (!practice.ok) throw new Error(practice.error);
    expect(rateMoveSliders(practice.code)).toBeUndefined();
  });
});
