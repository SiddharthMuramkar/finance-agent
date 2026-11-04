// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetView } from "@/app/widget-view";
import { CaseDataProvider } from "@/widgets/case-data-provider";
import { archetypeOf, WIDGET_BUDGET, widgetNodes, widgetParts, widgetProblems, widgetRuleProblems, widgetWarnings } from "@/widgets/check";
import type { Recipe } from "./define";
import { recipeById } from "./index";
import { SET_A } from "./set-a";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const IDS = ["buying_power", "grow_money", "loan_cost", "compare_two", "breakeven_hunt", "percent_points", "quick_check"];
const VISUAL_TESTIDS = ["money-stack", "pictogram", "versus", "breakeven", "waffle"];
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

const built = (recipe: Recipe, example: unknown) => {
  const done = recipe.build(example);
  if (!done.ok) throw new Error(done.error);
  return done;
};

// Synthetic Case Data (it never goes into git): the right shape for the reference series the examples read.
const CASES = [
  {
    caseId: "reference",
    asOf: "2026-01-01",
    revealed: false,
    datasets: [
      {
        id: "gold-inr-10g",
        label: "Gold (synthetic)",
        unit: "INR",
        source: "Synthetic test data",
        sourceUrl: "https://example.com/",
        checkedOn: "2026-01-01",
        points: [
          { date: "1990-12-31", value: 3000 },
          { date: "2025-12-31", value: 120_000 },
        ],
      },
    ],
  },
];

describe("recipe set A", () => {
  it("holds the seven recipes of the brief, one entry per id", () => {
    expect(SET_A.map((r) => r.id).sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(recipeById(id), id).toBe(SET_A.find((r) => r.id === id));
  });

  for (const recipe of SET_A) {
    describe(recipe.id, () => {
      it("has three realistic beginner asks as examples", () => expect(recipe.examples).toHaveLength(3));

      recipe.examples.forEach((example, i) => {
        it(`example ${i + 1} compiles and passes every Widget check, with no budget warning`, () => {
          const { code, title } = built(recipe, example);
          expect(widgetProblems(code)).toEqual([]);
          expect(widgetRuleProblems(code)).toEqual([]);
          expect(widgetWarnings(code)).toEqual([]);
          expect(widgetParts(code).title).toBe(title);
          expect(archetypeOf(code)).not.toBeNull();
        });

        it(`example ${i + 1} stays within the recipe's information budget when counted from the parsed code`, () => {
          const { code } = built(recipe, example);
          const nodes = widgetNodes(code);
          expect(nodes.filter((n) => n.typeName === "Slider").length).toBeLessThanOrEqual(recipe.budget.controls);
          expect(nodes.filter((n) => ["MoneyStack", "Pictogram", "Versus", "Breakeven", "Waffle"].includes(n.typeName)).length).toBeLessThanOrEqual(recipe.budget.visuals);
          expect(nodes.filter((n) => n.typeName === "Stat").length + 2 * nodes.filter((n) => n.typeName === "Versus").length).toBeLessThanOrEqual(WIDGET_BUDGET.numbers);
          expect(nodes.filter((n) => n.typeName === "Stat").length).toBeLessThanOrEqual(recipe.budget.numbers + 1);
        });

        it(`example ${i + 1} draws in the real renderer with one control at most, one visual at most and few words`, async () => {
          const { code } = built(recipe, example);
          await act(async () => {
            root.render(
              <CaseDataProvider cases={CASES}>
                <WidgetView code={code} complete />
              </CaseDataProvider>,
            );
          });
          await act(async () => {
            await new Promise((r) => setTimeout(r, 30));
          });
          expect(host.textContent).not.toContain("could not be drawn");
          expect(host.querySelectorAll('input[type="range"]').length).toBeLessThanOrEqual(recipe.budget.controls);
          const visuals = VISUAL_TESTIDS.reduce((sum, id) => sum + host.querySelectorAll(`[data-testid="${id}"]`).length, 0);
          expect(visuals).toBeLessThanOrEqual(recipe.budget.visuals);
          expect(visuals, "the visual is drawn").toBe(recipe.budget.visuals);
          expect(host.querySelectorAll('input[type="range"]').length, "the control is drawn").toBe(recipe.budget.controls);
          // The words a Widget shows outside its parts (the parts' own captions are counted by their own tests).
          const clone = host.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('[data-testid], label, [role="group"], button, input').forEach((el) => el.remove());
          expect(words(clone.textContent ?? "")).toBeLessThanOrEqual(WIDGET_BUDGET.words);
        });
      });

      it("refuses a free number outside facts: an extra key in inputs, refs or facts", () => {
        const example = structuredClone(recipe.examples[0]) as { inputs: Record<string, unknown>; refs: Record<string, unknown>; facts: Record<string, unknown> };
        for (const part of ["inputs", "refs", "facts"] as const) {
          const tampered = structuredClone(example);
          tampered[part].invented = 42;
          expect(recipe.build(tampered).ok, `${part}.invented`).toBe(false);
        }
        const loose = structuredClone(example);
        if ("slider" in loose.inputs) {
          (loose.inputs.slider as Record<string, unknown>).price = 42;
          expect(recipe.build(loose).ok, "slider.price").toBe(false);
        }
      });
    });
  }

  it("turns any fact into an Illustration, and only a fact", () => {
    const power = recipeById("buying_power")!;
    const fact = built(power, power.examples[1]);
    const sourced = built(power, power.examples[0]);
    expect(fact.title.startsWith("Illustration:")).toBe(true);
    expect(sourced.title.startsWith("Illustration:")).toBe(false);
    expect(sourced.refs).toEqual(["reference/gold-inr-10g"]);
  });

  it("gives buying_power one price, sourced or made up", () => {
    const power = recipeById("buying_power")!;
    const example = power.examples[0] as { inputs: unknown; refs: unknown; facts: unknown };
    expect(power.build({ title: "Gold for ₹1 lakh", ...example, facts: { price: 5 } }).ok).toBe(false);
    expect(power.build({ title: "Gold for ₹1 lakh", ...example, refs: {} }).ok).toBe(false);
  });

  it("refuses a break-even the curve never reaches", () => {
    const hunt = recipeById("breakeven_hunt")!;
    const example = structuredClone(hunt.examples[0]) as { inputs: { slider: { max: number }; target: { held: Record<string, number> } } };
    example.inputs.target.held.principal = 900_000_000;
    const result = hunt.build({ title: "Never", ...example });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/never reaches/);
  });

  it("refuses two sides that give different kinds of number", () => {
    const compare = recipeById("compare_two")!;
    const example = structuredClone(compare.examples[0]) as { inputs: { right: { calculator: string; held: Record<string, number> } } };
    example.inputs.right = { ...example.inputs.right, calculator: "cagr", held: { start: 100, end: 200 } };
    expect(compare.build({ title: "Mixed", ...example }).ok).toBe(false);
  });

  it("makes a quiz with numbers an Illustration, and refuses one that hides them", () => {
    const quiz = recipeById("quick_check")!;
    const withNumbers = structuredClone(quiz.examples[0]) as { inputs: unknown; refs: unknown; facts: unknown };
    expect(quiz.build({ title: "Present value", ...withNumbers, facts: {} }).ok).toBe(false);
    expect(built(quiz, quiz.examples[0]).title.startsWith("Illustration:")).toBe(true);
    const outOfRange = { title: "Bad answer", inputs: { questions: [{ question: "Which is it?", options: ["A", "B"], answer: 2, why: "Because it is." }] }, refs: {}, facts: {} };
    expect(quiz.build(outOfRange).ok).toBe(false);
  });

  it("gives every slider a Guided Task it can reach", () => {
    for (const recipe of SET_A) {
      const { code } = built(recipe, recipe.examples[0]);
      for (const slider of widgetNodes(code).filter((n) => n.typeName === "Slider")) {
        const variable = (slider.props.value as { n: string }).n.replace(/^\$/, "");
        const { min, max } = slider.props as { min: number; max: number };
        const targets = [...code.matchAll(new RegExp(`GuidedTask\\([^\\n]*\\$${variable} == ([0-9.]+)\\)`, "g"))].map((m) => Number(m[1]));
        expect(targets.some((v) => v >= min && v <= max), `${recipe.id}: ${variable}`).toBe(true);
      }
    }
  });
});
