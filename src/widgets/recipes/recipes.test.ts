import { describe, expect, it } from "vitest";
import { z } from "zod";
import { VISUALS, widgetNodes, widgetParts, widgetProblems, widgetRuleProblems } from "@/widgets/check";
import { defineRecipe, ILLUSTRATION, program, recipeSignature, str } from "./define";
import { RECIPES, recipeById, recipeSignatures } from "./index";


const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe("Widget recipes", () => {
  it("has one recipe per id", () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    expect(recipeById("history_case")?.archetype).toBe("History");
  });

  for (const recipe of RECIPES) {
    describe(recipe.id, () => {
      it("has examples", () => expect(recipe.examples.length).toBeGreaterThan(0));

      recipe.examples.forEach((example, i) => {
        it(`example ${i + 1} compiles and passes every Widget check`, () => {
          const built = recipe.build(example);
          if (!built.ok) throw new Error(built.error);
          expect(widgetProblems(built.code)).toEqual([]);
          expect(widgetRuleProblems(built.code)).toEqual([]);
          expect(widgetParts(built.code).title).toBe(built.title);
        });

        it(`example ${i + 1} gives every slider a Guided Task at a number it can reach (#146)`, () => {
          const built = recipe.build(example);
          if (!built.ok) throw new Error(built.error);
          const nodes = widgetNodes(built.code);
          for (const slider of nodes.filter((n) => n.typeName === "Slider")) {
            const variable = (slider.props.value as { n: string }).n.replace(/^\$/, "");
            const { min, max } = slider.props as { min: number; max: number };
            const reaching = built.code
              .split("\n")
              .filter((line) => line.includes("= GuidedTask("))
              .flatMap((line) => [...line.matchAll(new RegExp(`\\$${variable} == ([0-9.]+)`, "g"))].map((m) => Number(m[1])))
              .filter((v) => v >= min && v <= max);
            expect(reaching.length, `${variable} has a reachable target`).toBeGreaterThan(0);
          }
        });

        it(`example ${i + 1} keeps within the information budget`, () => {
          const built = recipe.build(example);
          if (!built.ok) throw new Error(built.error);
          const nodes = widgetNodes(built.code);
          expect(nodes.filter((n) => n.typeName === "Slider").length).toBeLessThanOrEqual(recipe.budget.controls);
          expect(nodes.filter((n) => VISUALS.has(n.typeName)).length).toBeLessThanOrEqual(recipe.budget.visuals);
          const text = [built.title, ...nodes.filter((n) => n.typeName === "TextContent").map((n) => String(n.props.text ?? ""))].join(" ");
          expect(words(text)).toBeLessThanOrEqual(recipe.budget.words);
        });
      });
    });
  }

  it("refuses params that do not fit, with a plain reason", () => {
    const built = recipeById("grow_money")!.build({
      title: "Bad SIP",
      inputs: { calculator: "sip", held: { monthly: 1000, nonsense: 3 }, slider: { input: "years", label: "Years", unit: "years", min: 5, max: 1, step: 1, start: 3 } },
      refs: {},
      facts: {},
    });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error).toMatch(/nonsense|min must be below max/);
    expect(recipeById("history_case")!.build({ title: "Sensex", inputs: {}, refs: { dataset: "not a reference" }, facts: {} }).ok).toBe(false);
  });

  it("collects the Case Data references a Widget draws", () => {
    const built = recipeById("history_case")!.build({ title: "Gold in rupees", inputs: {}, refs: { dataset: "reference/gold-inr-10g" }, facts: {} });
    expect(built.ok && built.refs).toEqual(["reference/gold-inr-10g"]);
  });

  it("makes any Widget with facts an Illustration (ADR 0003)", () => {
    const shown = defineRecipe({
      id: "test_fact",
      archetype: "Check",
      summary: "test",
      params: { inputs: z.object({}), refs: z.object({}), facts: z.object({ price: z.number().optional() }) },
      budget: { controls: 0, numbers: 1, visuals: 0, words: 10 },
      examples: [],
      compile: ({ title, facts }) => program(title, ["t"], [`t = TextContent(${str(`Price ${facts.price ?? "none"}`)})`]),
    });
    const withFact = shown.build({ title: "A vada pav", inputs: {}, refs: {}, facts: { price: 20 } });
    const without = shown.build({ title: "A vada pav", inputs: {}, refs: {}, facts: {} });
    expect(withFact.ok && withFact.title).toBe(`${ILLUSTRATION} A vada pav`);
    expect(without.ok && without.title).toBe("A vada pav");
  });

  it("lists every recipe for the Tutor in a few hundred tokens each", () => {
    const text = recipeSignatures();
    for (const r of RECIPES) expect(text).toContain(`- ${r.id} (`);
    for (const r of RECIPES) expect(recipeSignature(r).length).toBeLessThan(2400);
  });
});
