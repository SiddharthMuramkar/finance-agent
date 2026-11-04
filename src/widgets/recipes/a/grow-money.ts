import { z } from "zod";
import { defineRecipe, obj, program, sliderStatements, str, taskStatements, type CompiledSlider, type Recipe } from "../define";
import { calculatorSliderInputs, currencyOf } from "./shared";

type MoneyInputs = z.input<ReturnType<typeof calculatorSliderInputs>>;

/** The shape of the two money recipes: one slider moves one calculator input and a MoneyStack shows the split. */
export type MoneyRecipe = {
  id: string;
  archetype: "Grow" | "Compare";
  summary: string;
  calculators: readonly [string, ...string[]];
  /** A label for a Stat above the picture: the calculator's first result, in the Learner's colour (their assumptions made it). */
  stat?: string;
  examples: { title: string; inputs: MoneyInputs; refs: Record<string, never>; facts: Record<string, never> }[];
};

export function moneyRecipe(r: MoneyRecipe): Recipe {
  return defineRecipe({
    id: r.id,
    archetype: r.archetype,
    summary: r.summary,
    params: { inputs: calculatorSliderInputs(r.calculators, { parts: true }), refs: z.object({}).strict(), facts: z.object({}).strict() },
    budget: { controls: 1, numbers: r.stat ? 1 : 0, visuals: 1, words: 12 },
    examples: r.examples,
    compile: ({ title, inputs: p }) => {
      const currency = currencyOf(p.calculator, p.currency);
      const slider: CompiledSlider = { name: "control", variable: p.slider.input, label: p.slider.label, range: p.slider, unit: p.slider.unit };
      const tasks = taskStatements([slider])!;
      const inputs = obj({ ...p.held, [p.slider.input]: `$${p.slider.input}` });
      const statements = [...sliderStatements(slider)];
      const children = ["control"];
      if (r.stat) {
        statements.push(`worked = Query("calculate", {calculator: ${str(p.calculator)}, inputs: ${inputs}, currency: ${str(currency)}}, {rows: []})`);
        statements.push(`headline = Stat(${str(r.stat)}, @First(worked.rows.value), ${str(currency)}, "", "you")`);
        children.push("headline");
      }
      statements.push(`pile = MoneyStack(${str(p.calculator)}, ${inputs}, ${str(currency)}${p.caption ? `, ${str(p.caption)}` : ""})`);
      children.push("pile", tasks.name);
      return program(title, children, [...statements, ...tasks.statements]);
    },
  });
}

/** What money becomes: a savings calculator whose money pile splits what you put in from what it earned. */
export const growMoney = moneyRecipe({
  id: "grow_money",
  archetype: "Grow",
  summary: "What money becomes: a savings calculator (sip, fixed_deposit, future_value, recurring_deposit, ppf) with one input on a slider and a money pile that splits what you put in from what it earned.",
  calculators: ["sip", "fixed_deposit", "future_value", "recurring_deposit", "ppf"],
  examples: [
    {
      title: "What does ₹1,000 a month in a SIP become?",
      inputs: { calculator: "sip", currency: "inr", held: { monthly: 1000, ratePercent: 10 }, slider: { input: "years", label: "Years you keep investing", unit: "years", min: 1, max: 30, step: 1, start: 10 }, caption: "Your SIP at 10% a year" },
      refs: {},
      facts: {},
    },
    {
      title: "How much does a fixed deposit earn?",
      inputs: { calculator: "fixed_deposit", held: { principal: 100_000, years: 5 }, slider: { input: "ratePercent", label: "Yearly interest rate", unit: "percent", min: 3, max: 9, step: 0.25, start: 7 } },
      refs: {},
      facts: {},
    },
    {
      title: "What will ₹50,000 grow to?",
      inputs: { calculator: "future_value", held: { amount: 50_000, years: 10 }, slider: { input: "ratePercent", label: "Yearly return", unit: "percent", min: 2, max: 14, step: 1, start: 8 } },
      refs: {},
      facts: {},
    },
  ],
});
