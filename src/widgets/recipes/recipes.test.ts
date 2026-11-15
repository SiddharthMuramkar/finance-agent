import { describe, expect, it } from "vitest";
import { z } from "zod";
import { VISUALS, widgetNodes, widgetParts, widgetProblems, widgetRuleProblems, WORKBENCH_BUDGET, workbenchShapes } from "@/widgets/check";
import { ARCHETYPES, defineRecipe, ILLUSTRATION, program, recipeSignature, str, WORKBENCH } from "./define";
import { RECIPES, recipeById, recipeSignatures } from "./index";


const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe("Widget recipes", () => {
  it("has one recipe per id", () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    expect(recipeById("history_case")?.archetype).toBe("History");
  });

  it("registers the nine story recipes (E3), each stayed within its budget by the loop below", () => {
    for (const id of ["story_scene", "lingo_card", "timeline", "two_paths", "money_jar", "who_pays_whom", "myth_or_fact", "headline", "choice_cards"]) {
      expect(recipeById(id), id).toBeDefined();
    }
    expect(recipeById("story_scene")?.archetype).toBe("Story");
    expect(recipeById("lingo_card")?.archetype).toBe("Lingo");
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
            // Or a target written from the Widget as it stands (B7): another slider's value now ($new == $old), or a band
            // round a live value ($old >= $new + 1 - 0.1 && ...). guided-tasks-truth.test.ts checks those are reachable.
            const live = built.code
              .split("\n")
              .filter((line) => line.includes("= GuidedTask("))
              .some((line) => new RegExp(`\\$${variable} == \\$\\w+|\\$\\w+ == \\$${variable}\\b|\\$${variable} >= \\$\\w+`).test(line));
            expect(reaching.length > 0 || live, `${variable} has a reachable target`).toBe(true);
          }
        });

        it(`example ${i + 1} keeps within its archetype's budget (a Workbench's is WORKBENCH_BUDGET, B2)`, () => {
          const built = recipe.build(example);
          if (!built.ok) throw new Error(built.error);
          const nodes = widgetNodes(built.code);
          const shapes = workbenchShapes(built.code);
          if (recipe.archetype === WORKBENCH) {
            expect(recipe.budget).toEqual(WORKBENCH_BUDGET);
            // One Workbench part, standing alone, as the recipe draws it.
            expect(shapes).toHaveLength(1);
            expect(nodes.map((n) => n.typeName)).toEqual([shapes[0].part]);
            const [shape] = shapes;
            expect(shape.controls).toBeLessThanOrEqual(WORKBENCH_BUDGET.controls);
            expect(shape.more).toBeLessThanOrEqual(WORKBENCH_BUDGET.more);
            expect(shape.visuals).toBeLessThanOrEqual(WORKBENCH_BUDGET.visuals);
            expect(shape.numbers).toBeLessThanOrEqual(WORKBENCH_BUDGET.numbers);
            expect(shape.headlines).toBe(WORKBENCH_BUDGET.headlines);
            expect(shape.tasks).toBeLessThanOrEqual(WORKBENCH_BUDGET.tasks);
            expect(words(built.title) + shape.words).toBeLessThanOrEqual(WORKBENCH_BUDGET.words);
            return;
          }
          // Only a Workbench recipe draws a Workbench part.
          expect(shapes).toEqual([]);
          expect(nodes.filter((n) => n.typeName === "Slider").length).toBeLessThanOrEqual(recipe.budget.controls);
          expect(nodes.filter((n) => VISUALS.has(n.typeName)).length).toBeLessThanOrEqual(recipe.budget.visuals);
          const text = [built.title, ...nodes.filter((n) => n.typeName === "TextContent").map((n) => String(n.props.text ?? ""))].join(" ");
          expect(words(text)).toBeLessThanOrEqual(recipe.budget.words);
        });
      });
    });
  }

  it("has a Workbench archetype only a recipe can have: the Tutor's free-form kinds leave it out (B2, ADR 0010)", () => {
    expect(recipeById("value_levers")?.archetype).toBe(WORKBENCH);
    expect(ARCHETYPES as readonly string[]).not.toContain(WORKBENCH);
  });

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

  it("makes any Widget with facts an Illustration (ADR 0009)", () => {
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
    // What this guards is that the engine's instructions stay under the Widget library prompt's, which show-widget.test.ts
    // asserts outright (ENGINE_INSTRUCTIONS shorter than TUTOR_INSTRUCTIONS). The Workbench recipes meet it because their
    // figure inputs (topicInputs, ADR 0010) are collapsed in the Tutor's signature to one line that says to copy them from
    // the Topic file, and recipeSignature then drops a named schema nothing points at: multiple_decoder's traded multiple,
    // with its Icon and short fact (T33, F6), is not in its signature at all.
    for (const r of RECIPES) expect(recipeSignature(r).length, r.id).toBeLessThan(2400);
  });
});
