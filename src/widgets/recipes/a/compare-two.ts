import { z } from "zod";
import { defineRecipe, obj, program, rangeProblems, sliderStatements, str, taskStatements, type CompiledSlider } from "../define";
import { currencyOf, firstResult, heldProblems, numberCalculator, shortLabel, sliderBase } from "./shared";

const side = z
  .object({
    label: shortLabel,
    calculator: numberCalculator,
    held: z.record(z.string(), z.number()).describe("This side's other inputs, held fixed, by input name"),
  })
  .strict();

const KIND_UNIT: Record<string, string> = { money: "", percent: "percent", years: "years", number: "x" };

/** Two options side by side, worked out by our calculators at the one input the Learner moves. */
export const compareTwo = defineRecipe({
  id: "compare_two",
  archetype: "Compare",
  summary:
    "Two options side by side (Versus): each side is a calculator's first result, and one shared input on a slider moves both. For 'which is better, A or B', such as a SIP against a fixed deposit at the same rate. Set better to lower when the smaller number wins.",
  params: {
    inputs: z
      .object({
        currency: z.enum(["usd", "inr"]).optional(),
        better: z.enum(["higher", "lower"]).default("higher"),
        slider: sliderBase.extend({ input: z.string().describe("The input both calculators share, which the Learner moves") }),
        left: side,
        right: side,
      })
      .strict()
      .superRefine((p, ctx) => {
        const issue = (message: string) => ctx.addIssue({ code: "custom", message });
        for (const message of rangeProblems(p.slider)) issue(`slider: ${message}`);
        const kinds = new Set<string>();
        for (const name of ["left", "right"] as const) {
          const s = p[name];
          const problems = heldProblems(s.calculator, s.held, p.slider.input);
          problems.forEach((m) => issue(`${name}: ${m}`));
          if (problems.length) continue;
          for (const at of [p.slider.start, p.slider.min, p.slider.max]) {
            const result = firstResult(s.calculator, { ...s.held, [p.slider.input]: at }, p.currency);
            if (!result.ok) {
              issue(`${name}: with ${p.slider.input} at ${at}, ${s.calculator} says: ${result.error}`);
              break;
            }
            kinds.add(result.kind);
          }
        }
        if (kinds.size > 1) issue("the two sides must give the same kind of number (both money, both percent, ...): compare their first results");
      }),
    refs: z.object({}).strict(),
    facts: z.object({}).strict(),
  },
  budget: { controls: 1, numbers: 2, visuals: 1, words: 12 },
  examples: [
    {
      title: "SIP or fixed deposit: which grows ₹1,000 a month more?",
      inputs: {
        currency: "inr",
        slider: { input: "ratePercent", label: "Yearly return", unit: "percent", min: 4, max: 14, step: 0.5, start: 8 },
        left: { label: "SIP, ₹1,000 a month", calculator: "sip", held: { monthly: 1000, years: 10 } },
        right: { label: "Fixed deposit, same total", calculator: "fixed_deposit", held: { principal: 120_000, years: 10 } },
      },
      refs: {},
      facts: {},
    },
    {
      title: "Which loan costs less each month: 10 years or 20 years?",
      inputs: {
        currency: "inr",
        better: "lower",
        slider: { input: "ratePercent", label: "Yearly interest rate", unit: "percent", min: 6, max: 12, step: 0.25, start: 9 },
        left: { label: "Loan over 10 years", calculator: "emi", held: { principal: 1_000_000, years: 10 } },
        right: { label: "Loan over 20 years", calculator: "emi", held: { principal: 1_000_000, years: 20 } },
      },
      refs: {},
      facts: {},
    },
    {
      title: "Is it better to save a lump sum or add every month?",
      inputs: {
        currency: "inr",
        slider: { input: "years", label: "Years you keep saving", unit: "years", min: 1, max: 25, step: 1, start: 10 },
        left: { label: "Monthly ₹5,000 in a SIP", calculator: "sip", held: { monthly: 5000, ratePercent: 10 } },
        right: { label: "₹5 lakh once in a deposit", calculator: "fixed_deposit", held: { principal: 500_000, ratePercent: 7 } },
      },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs: p }) => {
    const slider: CompiledSlider = { name: "control", variable: p.slider.input, label: p.slider.label, range: p.slider, unit: p.slider.unit };
    const tasks = taskStatements([slider])!;
    const query = (name: string, s: typeof p.left) =>
      `${name} = Query("calculate", {calculator: ${str(s.calculator)}, inputs: ${obj({ ...s.held, [p.slider.input]: `$${p.slider.input}` })}, currency: ${str(currencyOf(s.calculator, p.currency))}}, {rows: []})`;
    // The kind of the first result decides the unit the two numbers are written in.
    const kind = firstResult(p.left.calculator, { ...p.left.held, [p.slider.input]: p.slider.start }, p.currency);
    const unit = kind.ok && KIND_UNIT[kind.kind] ? KIND_UNIT[kind.kind] : currencyOf(p.left.calculator, p.currency);
    const duel = `duel = Versus(${str(p.left.label)}, @First(a.rows.value), ${str(p.right.label)}, @First(b.rows.value), ${str(unit)}, ${str(p.better)})`;
    return program(title, ["control", "duel", tasks.name], [...sliderStatements(slider), query("a", p.left), query("b", p.right), duel, ...tasks.statements]);
  },
});
