import { z } from "zod";
import { FORMULAS, formulaById } from "@/finance/formulas";
import { caseDataRef, defineRecipe, obj, program, rangeProblems, sliderShape, sliderStatements, str, taskStatements, type CompiledSlider, type Recipe } from "../define";
import { calculatorRecipe } from "./calculator-recipe";

/**
 * The seed Widget recipes: built only from parts registered today (HistoryChart, Calculator, FormulaCard, Slider,
 * GuidedTasks). The recipe sets (set-a.ts, set-b.ts) add the rest of the catalog on the new primitives.
 */

/** What actually happened: one Case Data series on a time axis (optionally log), or the Learner draws what came next. */
export const historyCase = defineRecipe({
  id: "history_case",
  archetype: "History",
  summary:
    'What actually happened: draws one Case Data series (a reference from the Case Data list code sent, such as "reference/sensex-close") as a dated chart; scale "log" shows steady growth as a straight line. With draw set, the Learner first draws where it went next, then sees the record. The as-of rule decides what is drawn: nothing after the Case\'s as-of date shows before the reveal.',
  params: {
    inputs: z.object({
      scale: z.enum(["linear", "log"]).optional().describe('"log" opens the chart on a log axis'),
      draw: z.object({ prompt: z.string().trim().min(5).max(80) }).optional().describe("Turns the chart into a draw-the-next-stretch task"),
    }),
    refs: z.object({ dataset: caseDataRef }),
    facts: z.object({}),
  },
  budget: { controls: 0, numbers: 0, visuals: 1, words: 12 },
  examples: [
    { title: "The Sensex at its milestones, 1979 to March 1992", inputs: {}, refs: { dataset: "sensex-1992/sensex-close" }, facts: {} },
    { title: "Gold in rupees per 10 grams", inputs: { scale: "log" }, refs: { dataset: "reference/gold-inr-10g" }, facts: {} },
    { title: "Where was the Sensex heading?", inputs: { draw: { prompt: "Draw the next stretch of the Sensex" } }, refs: { dataset: "sensex-1992/sensex-close" }, facts: {} },
  ],
  compile: ({ title, inputs: p, refs }) => {
    if (p.draw) return program(title, ["draw"], ["$drawn = []", `draw = DrawTheLine(${str(refs.dataset)}, "", ${str(p.draw.prompt)}, $drawn)`]);
    return program(title, ["history"], [`history = HistoryChart(${str(refs.dataset)}${p.scale ? `, ${str(p.scale)}` : ""})`]);
  },
});

/** What money becomes: a savings calculator with one input on a slider. */
export const growMoney = calculatorRecipe({
  id: "grow_money",
  archetype: "Grow",
  summary: "What money becomes: a savings calculator (sip, fixed_deposit, future_value, ppf, recurring_deposit, annuity_future_value) with one input on a slider, worked out by our tested code.",
  calculators: ["sip", "fixed_deposit", "future_value", "ppf", "recurring_deposit", "annuity_future_value"],
  budget: { controls: 1, numbers: 3, visuals: 1, words: 12 },
  examples: [
    {
      title: "₹1,000 a month in a SIP",
      inputs: { calculator: "sip", currency: "inr", held: { monthly: 1000, ratePercent: 10 }, slider: { input: "years", label: "Years you keep investing", unit: "years", min: 1, max: 30, step: 1, start: 10 } },
      refs: {},
      facts: {},
    },
    {
      title: "₹1 lakh in a fixed deposit",
      inputs: { calculator: "fixed_deposit", held: { principal: 100_000, years: 5 }, slider: { input: "ratePercent", label: "Yearly interest rate", unit: "percent", min: 3, max: 9, step: 0.25, start: 7 } },
      refs: {},
      facts: {},
    },
  ],
});

/** EMI, and what a loan really costs: the EMI calculator with one input on a slider. */
export const loanCost = calculatorRecipe({
  id: "loan_cost",
  archetype: "Compare",
  summary: "EMI and what you really repay on a loan (the emi calculator: principal, ratePercent, years), with one of them on a slider.",
  calculators: ["emi"],
  budget: { controls: 1, numbers: 3, visuals: 1, words: 12 },
  examples: [
    {
      title: "EMI on a ₹10 lakh home loan",
      inputs: { calculator: "emi", currency: "inr", held: { principal: 1_000_000, years: 20 }, slider: { input: "ratePercent", label: "Yearly interest rate", unit: "percent", min: 6, max: 12, step: 0.25, start: 8.5 } },
      refs: {},
      facts: {},
    },
  ],
});

const formulaIds = FORMULAS.map((f) => f.id) as [string, ...string[]];

/** Own the formula: a Formula Card (ADR 0002) with one symbol on a slider. */
export const formula = defineRecipe({
  id: "formula",
  archetype: "Formula",
  summary: `Own a named formula: a Formula Card (${formulaIds.join(", ")}) with one symbol on a slider; every other symbol is held or taken from Case Data.`,
  params: {
    inputs: z
      .object({
        formula: z.enum(formulaIds),
        slider: z.object({ symbol: z.string(), label: z.string().trim().min(2).max(40), ...sliderShape }),
        held: z.record(z.string(), z.number()).describe("Symbols held at a fixed number, by symbol key"),
      })
      .superRefine((p, ctx) => {
        const issue = (message: string) => ctx.addIssue({ code: "custom", message });
        for (const message of rangeProblems(p.slider)) issue(`slider: ${message}`);
        const f = formulaById(p.formula)!;
        const symbol = f.symbols.find((s) => s.key === p.slider.symbol);
        if (!symbol) issue(`slider.symbol must be one of ${p.formula}'s symbols: ${f.symbols.map((s) => s.key).join(", ")}`);
        else if (symbol.unit === "count") issue(`${symbol.key} is a count, which no slider shows; hold it instead`);
      }),
    refs: z.object({ sourced: z.record(z.string(), caseDataRef).default({}).describe("Symbols taken from Case Data, by symbol key") }),
    facts: z.object({}),
  },
  budget: { controls: 1, numbers: 4, visuals: 1, words: 12 },
  examples: [
    { title: "What $1,000 in five years is worth today", inputs: { formula: "present-value", slider: { symbol: "ratePercent", label: "Yearly discount rate", min: 0, max: 15, step: 0.5, start: 5 }, held: { amount: 1000, years: 5 } }, refs: { sourced: {} }, facts: {} },
  ],
  compile: ({ title, inputs: p, refs }) => {
    const f = formulaById(p.formula)!;
    // Every symbol exactly once, or the card would only say "Working it out…" (ADR 0002: the card shows the formula).
    const given = [p.slider.symbol, ...Object.keys(p.held), ...Object.keys(refs.sourced)];
    const missing = f.symbols.filter((s) => !given.includes(s.key)).map((s) => s.key);
    const twice = given.filter((k, i) => given.indexOf(k) !== i);
    const unknown = given.filter((k) => !f.symbols.some((s) => s.key === k));
    if (missing.length || twice.length || unknown.length) {
      throw new Error(
        [missing.length && `${p.formula} needs a value for ${missing.join(", ")}`, twice.length && `${[...new Set(twice)].join(", ")} given more than once`, unknown.length && `${unknown.join(", ")} not a symbol of ${p.formula}`]
          .filter(Boolean)
          .join("; ") + `. Its symbols: ${f.symbols.map((s) => s.key).join(", ")}`,
      );
    }
    const unit = f.symbols.find((s) => s.key === p.slider.symbol)?.unit;
    const slider: CompiledSlider = { name: "control", variable: p.slider.symbol, label: p.slider.label, range: p.slider, unit: unit === "percent" || unit === "years" ? unit : "usd" };
    const tasks = taskStatements([slider])!;
    const card = `card = FormulaCard(${str(p.formula)}, ${obj({ [p.slider.symbol]: `$${p.slider.symbol}` })}, ${obj(Object.fromEntries(Object.entries(refs.sourced).map(([k, v]) => [k, str(v)])))}, ${obj(p.held)})`;
    return program(title, ["control", "card", tasks.name], [...sliderStatements(slider), card, ...tasks.statements]);
  },
});

export const SEEDS: Recipe[] = [historyCase, growMoney, loanCost, formula];
