import { describe, expect, it } from "vitest";
import { widgetNodes, widgetParts, widgetProblems, widgetRuleProblems, widgetWarnings, WIDGET_BUDGET } from "@/widgets/check";
import { recipeById } from "./index";
import { shuffled } from "./b/rank";
import { SET_B } from "./set-b";

const ids = ["price_over_time", "predict_number", "history_case", "chain", "rank", "formula", "fx_convert"];

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

const build = (id: string, raw: unknown) => {
  const built = recipeById(id)!.build(raw);
  if (!built.ok) throw new Error(built.error);
  return built;
};

describe("recipe set B", () => {
  it("registers all seven recipes", () => {
    for (const id of ids) expect(recipeById(id), id).toBeDefined();
    expect(SET_B.map((r) => r.id)).toEqual(["price_over_time", "predict_number", "chain", "rank", "fx_convert"]);
  });

  for (const id of ids) {
    describe(id, () => {
      const recipe = recipeById(id)!;
      recipe.examples.forEach((example, i) => {
        it(`example ${i + 1} compiles and passes every Widget check`, () => {
          const built = build(id, example);
          expect(widgetProblems(built.code)).toEqual([]);
          expect(widgetRuleProblems(built.code)).toEqual([]);
          expect(widgetParts(built.code).title).toBe(built.title);
        });

        it(`example ${i + 1} gives every slider a Guided Task it can reach (#146)`, () => {
          const built = build(id, example);
          for (const slider of widgetNodes(built.code).filter((n) => n.typeName === "Slider")) {
            const variable = (slider.props.value as { n: string }).n.replace(/^\$/, "");
            const { min, max } = slider.props as { min: number; max: number };
            const targets = built.code
              .split("\n")
              .filter((line) => line.includes("= GuidedTask("))
              .flatMap((line) => [...line.matchAll(new RegExp(`\\$${variable} == ([0-9.]+)`, "g"))].map((m) => Number(m[1])))
              .filter((v) => v >= min && v <= max);
            expect(targets.length, `${variable} has a reachable target`).toBeGreaterThan(0);
          }
        });

        it(`example ${i + 1} stays inside the information budget`, () => {
          const built = build(id, example);
          // The freeform budget warnings (controls, numbers, visuals, words, callouts, tasks) never fire.
          expect(widgetWarnings(built.code)).toEqual([]);
          expect(widgetWarnings(built.code).filter((w) => /is shown twice/.test(w)), "no number is shown twice").toHaveLength(0);
          const nodes = widgetNodes(built.code);
          expect(nodes.filter((n) => n.typeName === "Slider").length).toBeLessThanOrEqual(recipe.budget.controls);
          expect(recipe.budget.words).toBeLessThanOrEqual(WIDGET_BUDGET.words);
          const text = [built.title, ...nodes.filter((n) => n.typeName === "TextContent").map((n) => String(n.props.text ?? ""))].join(" ");
          expect(words(text)).toBeLessThanOrEqual(recipe.budget.words);
        });
      });
    });
  }

  it("makes a Widget with facts an Illustration, and one without not", () => {
    expect(build("price_over_time", recipeById("price_over_time")!.examples[0]).title).toMatch(/^Illustration:/);
    expect(build("fx_convert", recipeById("fx_convert")!.examples[0]).title).toMatch(/^Illustration:/);
    expect(build("predict_number", recipeById("predict_number")!.examples[0]).title).not.toMatch(/^Illustration:/);
    expect(build("rank", recipeById("rank")!.examples[0]).title).not.toMatch(/^Illustration:/);
  });

  describe("price_over_time", () => {
    const base = { title: "Prices over time", refs: {}, facts: { amount: 20 } };
    it("holds the one the slider does not move", () => {
      const bad = recipeById("price_over_time")!.build({ ...base, inputs: { show: "price", item: "Tea", held: {}, slider: { on: "years", label: "Years", min: 0, max: 10, step: 1, start: 2 } } });
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(bad.error).toMatch(/held\.ratePercent/);
    });
    it("moves the rate when the slider is on it", () => {
      const built = build("price_over_time", recipeById("price_over_time")!.examples[1]);
      expect(built.code).toMatch(/Slider\("ratePercent"/);
      expect(built.code).toMatch(/ShrinkingNote\(100, \$ratePercent, 10, "inr"\)/);
    });
  });

  describe("predict_number", () => {
    it("takes the answer from Case Data, which is withheld until the reveal", () => {
      const built = build("predict_number", recipeById("predict_number")!.examples[0]);
      expect(built.code).toContain('Query("case_data", {dataset: "sensex-1992/sensex-close"}');
      expect(built.code).toContain("@Last(data.rows.value)");
      expect(built.refs).toEqual(["sensex-1992/sensex-close"]);
      expect(widgetWarnings(built.code).join()).not.toMatch(/actual is typed/);
    });
    it("refuses a start outside its range", () => {
      const raw = { ...(recipeById("predict_number")!.examples[0] as { inputs: object }), inputs: { prompt: "Your guess?", unit: "percent", min: 0, max: 10, step: 1, start: 50 } };
      expect(recipeById("predict_number")!.build({ ...raw, title: "A guess", refs: { dataset: "reference/usd-inr" }, facts: {} }).ok).toBe(false);
    });
  });

  describe("history_case", () => {
    it("opens on a log axis when asked", () => {
      const built = build("history_case", recipeById("history_case")!.examples[1]);
      expect(built.code).toContain('HistoryChart("reference/gold-inr-10g", "log")');
    });
    it("can ask the Learner to draw what came next; the as-of rule is the part's, so no hindsight is in the program", () => {
      const built = build("history_case", recipeById("history_case")!.examples[2]);
      expect(built.code).toContain("DrawTheLine(");
      expect(built.code).not.toMatch(/Query\(|\d{4}-\d\d-\d\d/);
      expect(built.refs).toEqual(["sensex-1992/sensex-close"]);
    });
  });

  describe("chain", () => {
    const steps = [
      { title: "First", body: "Something happens first." },
      { title: "Then", body: "Something follows after it." },
    ];
    it("refuses numbers it cannot source unless they are declared as facts", () => {
      const withNumber = { title: "A chain", inputs: { steps: [{ title: "First", body: "Prices rise 5 percent." }, steps[1]] }, refs: {} };
      const bad = recipeById("chain")!.build({ ...withNumber, facts: {} });
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(bad.error).toMatch(/number/);
      const ok = recipeById("chain")!.build({ ...withNumber, facts: { numbers: true } });
      expect(ok.ok && ok.title).toBe("Illustration: A chain");
    });
    it("refuses a formula in symbols", () => {
      const bad = recipeById("chain")!.build({ title: "A chain", inputs: { steps: [{ title: "First", body: "Value is P(1 + r)^n later." }, steps[1]] }, refs: {}, facts: { numbers: true } });
      expect(bad.ok).toBe(false);
    });
    it("refuses a wordy step", () => {
      expect(recipeById("chain")!.build({ title: "A chain", inputs: { steps: [{ title: "First", body: "word ".repeat(30) }, steps[1]] }, refs: {}, facts: {} }).ok).toBe(false);
    });
  });

  describe("rank", () => {
    it("never shows the answer already in order, and the answer key matches the scramble", () => {
      for (let n = 2; n <= 8; n++) {
        const order = shuffled(n);
        expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
        expect(order.some((v, i) => v !== i), `n=${n}`).toBe(true);
      }
    });
    it("keeps each reason with its item and lists the right order from low to high", () => {
      const built = build("rank", recipeById("rank")!.examples[0]);
      const rank = widgetNodes(built.code).find((n) => n.typeName === "Rank")!;
      const items = rank.props.items as string[];
      const correct = rank.props.correctOrder as number[];
      const reasons = rank.props.reasons as string[];
      expect(correct.map((i) => items[i])).toEqual(["A house", "A fixed deposit", "Money in your savings account", "Cash in your wallet"]);
      expect(correct.map((i) => reasons[i])[0]).toBe("A house takes months to sell.");
    });
  });

  describe("formula", () => {
    const raw = (inputs: object, sourced = {}) => ({ title: "Own the formula", inputs, refs: { sourced }, facts: {} });
    const slider = { symbol: "ratePercent", label: "Yearly discount rate", min: 0, max: 15, step: 0.5, start: 5 };
    it("is a Formula Card, never a formula typed out (ADR 0002)", () => {
      const built = build("formula", recipeById("formula")!.examples[0]);
      expect(built.code).toContain("FormulaCard(");
      expect(built.code).not.toMatch(/\^|\(1 \+/);
    });
    it("says which symbol is missing, repeated or unknown", () => {
      const missing = recipeById("formula")!.build(raw({ formula: "present-value", slider, held: { years: 5 } }));
      expect(!missing.ok && missing.error).toMatch(/needs a value for amount/);
      const twice = recipeById("formula")!.build(raw({ formula: "present-value", slider, held: { amount: 1, years: 5, ratePercent: 3 } }));
      expect(!twice.ok && twice.error).toMatch(/ratePercent given more than once/);
      const unknown = recipeById("formula")!.build(raw({ formula: "present-value", slider, held: { amount: 1, years: 5, nope: 3 } }));
      expect(!unknown.ok && unknown.error).toMatch(/nope not a symbol/);
    });
    it("takes a symbol from Case Data when sourced", () => {
      const built = build("formula", raw({ formula: "present-value", slider, held: { years: 5 } }, { amount: "mega-millions-2018/cash-option" }));
      expect(built.refs).toEqual(["mega-millions-2018/cash-option"]);
      expect(widgetProblems(built.code)).toEqual([]);
    });
  });

  describe("fx_convert", () => {
    const example = recipeById("fx_convert")!.examples[0] as { title: string; inputs: object; refs: object; facts: object };
    it("outlines what the real rate bought, from reference data", () => {
      const built = build("fx_convert", example);
      expect(built.code).toContain('Query("case_data", {dataset: "reference/usd-inr"}');
      expect(built.refs).toEqual(["reference/usd-inr"]);
    });
    it("needs the dollar price exactly once", () => {
      const none = recipeById("fx_convert")!.build({ ...example, facts: {} });
      expect(none.ok).toBe(false);
      const both = recipeById("fx_convert")!.build({ ...example, refs: { unitPrice: "reference/gold-usd-oz" } });
      expect(both.ok).toBe(false);
      const sourced = recipeById("fx_convert")!.build({ ...example, facts: {}, refs: { rate: "reference/usd-inr", unitPrice: "reference/gold-usd-oz" } });
      expect(sourced.ok && sourced.title).not.toMatch(/^Illustration:/);
    });
  });
});
