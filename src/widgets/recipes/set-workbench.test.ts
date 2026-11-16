import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { archetypeOf, WIDGET_BUDGET, widgetControls, widgetProblems, widgetRuleProblems, widgetTaskTexts, widgetWarnings } from "@/widgets/check";
import { WORKBENCH } from "./define";
import { figuresFromTutor, recipeInputsIn, WORKBENCH_FIGURE_INPUTS } from "./set-workbench";
import { RECIPES, recipeById } from "./index";

// Workbench Widgets (spec 2026-11-12, B2; ADR 0010): only a recipe can be one, and value_levers is the first (B3).

const recipe = recipeById("value_levers")!;
const built = recipe.build({ title: "What is Amazon worth a share?", inputs: { case: "amazon-dcf-2000" }, refs: {}, facts: {} });
if (!built.ok) throw new Error(built.error);
const lines = built.code.split("\n");
const levers = lines.find((line) => line.startsWith("levers = "))!;
const declarations = lines.filter((line) => line.startsWith("$"));

describe("value_levers (B3)", () => {
  it("binds Value levers to a Case id and opens each lever at the Case's own figure", () => {
    expect(levers).toMatch(/^levers = ValueLevers\("amazon-dcf-2000", \$revenue, \$margin, \$salesToCapital, \$risk, \$failure, \$moved, \$mostLever, \$mostBy, /);
    expect(declarations).toEqual(["$revenue = 39", "$margin = 10", "$salesToCapital = 3", "$risk = 12.84", "$failure = 0", "$moved = 0", "$mostLever = 0", "$mostBy = 0",
      // The Full sheet's rows (#104), each at no change from the Case's own figure.
      ...["$taxRow = 0", "$lossesRow = 0", "$growthAfterRow = 0", "$returnAfterRow = 0", "$cashRow = 0", "$debtRow = 0", "$optionsRow = 0"]]);
    expect(levers).toMatch(/, \$taxRow, \$lossesRow, \$growthAfterRow, \$returnAfterRow, \$cashRow, \$debtRow, \$optionsRow\)$/);
  });

  it("draws with no problem, as a Workbench", () => {
    expect(widgetProblems(built.code)).toEqual([]);
    expect(widgetRuleProblems(built.code)).toEqual([]);
    expect(archetypeOf(built.code)).toBe(WORKBENCH);
  });

  it("tells the Tutor its levers and its Things to try when code shows it", () => {
    const { sliders, tasks } = widgetControls(built.code);
    expect(sliders[0]).toBe("$revenue (How big it gets: revenue in year 10): 10 to 100 in steps of 1, starting at 39");
    expect(sliders[3]).toBe("$risk (How risky: cost of capital while it grows): 10 to 18 in steps of 0.25, starting at 12.84");
    expect(sliders[4]).toBe("$failure (Chance it fails): 0 to 50 in steps of 5, starting at 0");
    expect(tasks).toEqual(["Move one lever at a time. Which one moves the value most?", "Find a story worth the $84 price"]);
    expect(widgetTaskTexts(built.code)).toEqual(tasks);
  });

  it("opens all open mode on the chip of the Case it names, and refuses a Case its chips lack (Spine Topic 15)", () => {
    const yourself = recipe.examples[9] as { title: string; inputs: { mode: { kind: string; cases: { id: string }[] } } };
    expect(yourself.inputs.mode.cases.map((c) => c.id)).toEqual(["amazon-dcf-2000", "coffee-day-rupee-valuation-2015", "zomato-ipo-2021"]);
    const zomato = recipe.build({ ...yourself, inputs: { ...yourself.inputs, case: "zomato-ipo-2021" } });
    if (!zomato.ok) throw new Error(zomato.error);
    // Zomato's own levers (₹ crore, its margin), and the chip on Zomato, so the part draws the Case the call names.
    expect(zomato.code).toContain("$case = 2");
    expect(zomato.code).not.toContain("$case = 0");
    expect(zomato.code.split("\n").find((line) => line.startsWith("$revenue = "))).toBe("$revenue = 16400");
    expect(widgetTaskTexts(zomato.code)).toEqual(["Move one lever at a time. Which one moves the value most?", "Find a story worth the ₹76 price"]);
    const elsewhere = recipe.build({ ...yourself, inputs: { ...yourself.inputs, case: "amazon-yourself-2000" } });
    expect(!elsewhere.ok && elsewhere.error).toMatch(/case: not one of the mode's Cases; one of: amazon-dcf-2000, coffee-day-rupee-valuation-2015, zomato-ipo-2021/);
  });

  it("refuses a story worth the price that does not land near it, and a start off a lever's range", () => {
    const short = recipe.build({ title: "Amazon", inputs: { case: "amazon-dcf-2000", priceStory: { revenue: 80 } }, refs: {}, facts: {} });
    expect(!short.ok && short.error).toMatch(/priceStory: does not land near the price/);
    const off = recipe.build({ title: "Amazon", inputs: { case: "amazon-dcf-2000", start: { margin: 30 } }, refs: {}, facts: {} });
    expect(!off.ok && off.error).toMatch(/start\.margin: must lie between 2 and 20/);
  });
});

describe("only a recipe can be a Workbench (B2)", () => {
  it("refuses a program that puts parts beside a Workbench part, or wraps it in a Stack, so no Widget can claim its budget", () => {
    const beside = [
      'root = Widget("Amazon", [levers, rate, steps])',
      ...declarations,
      "$rate = 5",
      levers,
      'rate = Slider("rate", "Rate", 0, 10, 0.01, $rate, "percent")',
      "steps = GuidedTasks([t])",
      't = GuidedTask("Set 4%", $rate == 4)',
    ].join("\n");
    expect(widgetRuleProblems(beside).join("\n")).toMatch(/a Workbench Widget is drawn by code from its recipe and stands alone/);
    const stacked = ['root = Widget("Amazon", [stack])', ...declarations, "stack = Stack([levers])", levers].join("\n");
    expect(widgetRuleProblems(stacked).join("\n")).toMatch(/stands alone/);
  });

  it("refuses a Case that has no valuation block", () => {
    expect(widgetProblems(built.code.replace('"amazon-dcf-2000"', '"tesla-2020"')).join("\n")).toMatch(/"tesla-2020" is not a Valuation Case/);
    expect(recipe.build({ title: "Tesla", inputs: { case: "tesla-2020" }, refs: {}, facts: {} }).ok).toBe(false);
  });

  it("keeps a Widget the Tutor writes with four sliders to today's budget: it is warned past one control", () => {
    const four = [
      'root = Widget("Four levers", [a, b, c, d, steps])',
      ...["a", "b", "c", "d"].flatMap((v) => [`$${v} = 5`, `${v} = Slider("${v}", "${v}", 0, 10, 1, $${v}, "years")`]),
      "steps = GuidedTasks([t])",
      't = GuidedTask("Set a to 8", $a == 8)',
    ].join("\n");
    expect(WIDGET_BUDGET.controls).toBe(1);
    expect(widgetWarnings(four).join("\n")).toMatch(/4 controls are showing/);
  });
});

// The five Workbench Widgets of B4 and Value levers' Spine Topic modes (Appendix D): each recipe example is frozen as a fixture
// the Widget harness (/dev/widgets) and the browser tests open, and the fixture is exactly what the recipe compiles.
describe("the Workbench fixtures (B4, Done when: each Workbench has frozen fixtures)", () => {
  const FIXTURES: [file: string, recipe: string, example: number][] = [
    ["value-levers", "value_levers", 0],
    ["value-levers-market", "value_levers", 2],
    ["value-levers-margin-marks", "value_levers", 3],
    ["value-levers-roic", "value_levers", 4],
    ["value-levers-failure", "value_levers", 5],
    ["value-levers-two-stories", "value_levers", 6],
    ["value-levers-match-price", "value_levers", 7],
    ["value-levers-range", "value_levers", 8],
    ["value-levers-all-open", "value_levers", 9],
    ["value-levers-readings", "value_levers", 10],
    ["value-bridge", "value_bridge", 0],
    ["terminal-seesaw", "terminal_seesaw", 0],
    ["wacc-stack", "wacc_stack", 0],
    ["wacc-stack-readings", "wacc_stack", 2],
    ["cash-waterfall", "cash_waterfall", 0],
    ["cash-waterfall-company", "cash_waterfall", 1],
    ["multiple-decoder", "multiple_decoder", 0],
  ];

  it("covers every Workbench recipe, as the spec's six", () => {
    expect([...new Set(FIXTURES.map(([, id]) => id))]).toEqual(["value_levers", "value_bridge", "terminal_seesaw", "wacc_stack", "cash_waterfall", "multiple_decoder"]);
    expect(RECIPES.filter((r) => r.archetype === WORKBENCH).map((r) => r.id)).toEqual(["value_levers", "value_bridge", "terminal_seesaw", "wacc_stack", "cash_waterfall", "multiple_decoder"]);
  });

  for (const [file, id, i] of FIXTURES) {
    it(`${file}.openui is ${id}'s example ${i + 1}, compiled`, () => {
      const r = recipeById(id)!;
      const compiled = r.build(r.examples[i]);
      if (!compiled.ok) throw new Error(compiled.error);
      expect(readFileSync(join(process.cwd(), "src/widgets/fixtures/parts", `${file}.openui`), "utf8")).toBe(`${compiled.code}\n`);
    });
  }
});

describe("the B4 Workbench recipes", () => {
  const build = (id: string, inputs: unknown) => recipeById(id)!.build({ title: "A Workbench", inputs, refs: {}, facts: {} });

  it("bind each lever to a $variable at the opening the model works out, and list them for the Tutor", () => {
    const seesaw = build("terminal_seesaw", { case: "amazon-dcf-2000" });
    if (!seesaw.ok) throw new Error(seesaw.error);
    expect(seesaw.code.split("\n").filter((l) => l.startsWith("$"))).toEqual(["$growthAfter = 6", "$costAfter = 9.61"]);
    expect(widgetControls(seesaw.code).sliders).toEqual([
      "$growthAfter (Growth after year 10): 0 to 7 in steps of 0.25, starting at 6",
      "$costAfter (Cost of capital after year 10): 8 to 14 in steps of 0.25, starting at 9.61",
    ]);
    expect(archetypeOf(seesaw.code)).toBe(WORKBENCH);
  });

  it("refuse a Case with no valuation block, figures with no source, both a Case and a company, and a mode that does not parse", () => {
    expect(build("value_bridge", { case: "tesla-2020" })).toMatchObject({ ok: false, error: expect.stringMatching(/case: not a Valuation Case/) });
    expect(build("wacc_stack", { figures: { riskFree: 6.5, equityPremium: 4, relativeRisk: 1.6, debtShare: 1.2, costOfDebt: 8, taxRate: 0 } })).toMatchObject({ ok: false, error: expect.stringMatching(/source/) });
    const company = recipeById("cash_waterfall")!.examples[1] as { inputs: { company: unknown } };
    expect(build("cash_waterfall", { case: "amazon-dcf-2000", company: company.inputs.company })).toMatchObject({ ok: false, error: expect.stringMatching(/either a case or a company/) });
    expect(build("value_levers", { case: "amazon-dcf-2000", mode: { kind: "wishful" } })).toMatchObject({ ok: false, error: expect.stringMatching(/^inputs\.mode: /) });
    const decoder = recipeById("multiple_decoder")!.examples[0] as { inputs: Record<string, unknown> };
    expect(build("multiple_decoder", { ...decoder.inputs, assumptions: { taxPercent: 25, salesToCapital: 1.68, growthAfterPercent: 9 } })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/growth after year 10 must be below the opening cost of capital/),
    });
  });

  it("writes each company's Icon and short fact into the Multiple decoder, and refuses a picture the Icon set has not got (T33, F6)", () => {
    const decoder = recipeById("multiple_decoder")!.examples[0] as { inputs: { subject: Record<string, unknown> } };
    const built = build("multiple_decoder", decoder.inputs);
    if (!built.ok) throw new Error(built.error);
    expect(built.code).toContain('icon: "office-building", note: "604,000 desks"');
    expect(built.code).toContain('icon: "cityscape", note: "602,535 desks"');
    expect(build("multiple_decoder", { ...decoder.inputs, subject: { ...decoder.inputs.subject, icon: "wework-logo" } })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/subject\.icon: is not an Icon name/),
    });
  });

  it("refuse a Tutor program that draws a B4 Workbench part beside anything else", () => {
    const bridge = build("value_bridge", { case: "amazon-dcf-2000" });
    if (!bridge.ok) throw new Error(bridge.error);
    const beside = bridge.code.replace("[bridge]", "[bridge, note]") + '\nnote = TextContent("And another thing")';
    expect(widgetRuleProblems(beside).join("\n")).toMatch(/stands alone\. Open it with show_widget \(recipe value_bridge\)/);
  });
});

describe("Case figures come from a Topic file, or the Workbench is an Illustration (ADR 0010)", () => {
  const topics = [{ id: "t", explore: { workbench: { recipe: "cash_waterfall", inputs: { company: { name: "Webvan", revenue: 13.305, opening: { growth: 1, margin: 2 } } } } } }];
  it("finds every inputs a Topic file gives a recipe", () => {
    expect(recipeInputsIn(topics, "cash_waterfall")).toEqual([topics[0].explore.workbench.inputs]);
    expect(recipeInputsIn(topics, "wacc_stack")).toEqual([]);
  });
  it("is the Tutor's when a figure input differs from every Topic file's, in any key order", () => {
    expect(figuresFromTutor("cash_waterfall", { company: { opening: { margin: 2, growth: 1 }, revenue: 13.305, name: "Webvan" } }, recipeInputsIn(topics, "cash_waterfall"))).toBe(false);
    expect(figuresFromTutor("cash_waterfall", { company: { name: "Webvan", revenue: 20, opening: { growth: 1, margin: 2 } } }, recipeInputsIn(topics, "cash_waterfall"))).toBe(true);
  });
  it("is never the Tutor's for a Case id alone, or levers only", () => {
    expect(figuresFromTutor("cash_waterfall", { case: "amazon-dcf-2000" }, [])).toBe(false);
    expect(figuresFromTutor("terminal_seesaw", { case: "amazon-dcf-2000" }, [])).toBe(false);
    expect(figuresFromTutor("value_levers", { case: "amazon-dcf-2000", start: { revenue: 50 } }, [])).toBe(false);
  });
  it("lists a figure input for every Workbench that takes Case figures", () => {
    expect(Object.keys(WORKBENCH_FIGURE_INPUTS).sort()).toEqual(["cash_waterfall", "multiple_decoder", "value_bridge", "value_levers", "wacc_stack"]);
  });
});
