import { z } from "zod";
import { calculate } from "@/finance/calculators";
import { caseDataRef, defineRecipe, num, obj, program, rangeProblems, sliderStatements, str, taskStatements, type CompiledSlider } from "../define";
import { currencyOf, firstResult, heldProblems, numberCalculator, sliderBase } from "./shared";

const MAX_POINTS = 200;

/** Find the flip point: the one input where a calculator's result crosses a target another calculator works out. */
export const breakevenHunt = defineRecipe({
  id: "breakeven_hunt",
  archetype: "Compare",
  summary:
    "Find the break-even: the Learner hunts with one slider for the value where a calculator's first result crosses a target (another calculator's first result). For 'at what rate / how many years does A beat B'. The answer shows only once found. refs.marker can mark a sourced reference on the track.",
  params: {
    inputs: z
      .object({
        question: z.string().trim().min(5).max(80).describe("What the Learner is hunting for, as a question"),
        currency: z.enum(["usd", "inr"]).optional(),
        unit: z.string().trim().max(10).optional().describe('Added after the found figure, such as "%" or " years"'),
        markerLabel: z.string().trim().max(40).optional(),
        slider: sliderBase.extend({ input: z.string().describe("The input of the curve calculator the Learner moves") }),
        curve: z.object({ calculator: numberCalculator, held: z.record(z.string(), z.number()) }).strict(),
        target: z.object({ calculator: numberCalculator, held: z.record(z.string(), z.number()) }).strict(),
      })
      .strict()
      .superRefine((p, ctx) => {
        const issue = (message: string) => ctx.addIssue({ code: "custom", message });
        for (const message of rangeProblems(p.slider)) issue(`slider: ${message}`);
        if ((p.slider.max - p.slider.min) / p.slider.step > MAX_POINTS) issue(`slider: at most ${MAX_POINTS} steps between min and max`);
        heldProblems(p.curve.calculator, p.curve.held, p.slider.input).forEach((m) => issue(`curve: ${m}`));
        const target = calculate(p.target.calculator, p.target.held, p.currency);
        if (!target.ok) return issue(`target: ${p.target.calculator} says: ${target.error}`);
        const goal = target.results[0]?.value;
        const ends = [p.slider.min, p.slider.max].map((at) => firstResult(p.curve.calculator, { ...p.curve.held, [p.slider.input]: at }, p.currency));
        for (const end of ends) if (!end.ok) return issue(`curve: ${end.error}`);
        const [low, high] = ends.map((e) => (e.ok ? e.value : NaN));
        if (!(Math.min(low, high) <= goal && goal <= Math.max(low, high))) {
          issue(`the curve runs from ${low} to ${high} across the slider, so it never reaches the target ${goal}: widen the range or change the target`);
        }
      }),
    refs: z.object({ marker: caseDataRef.optional().describe("A sourced reference shown on the track, such as a bond yield: its latest point") }).strict(),
    facts: z.object({}).strict(),
  },
  budget: { controls: 1, numbers: 0, visuals: 1, words: 12 },
  examples: [
    {
      title: "At what rate does a SIP match a ₹10 lakh deposit?",
      inputs: {
        question: "At what yearly return does the SIP catch the deposit?",
        currency: "inr",
        unit: "%",
        slider: { input: "ratePercent", label: "Yearly return on the SIP", unit: "percent", min: 1, max: 20, step: 0.5, start: 5 },
        curve: { calculator: "sip", held: { monthly: 5000, years: 15 } },
        target: { calculator: "fixed_deposit", held: { principal: 1_000_000, years: 15, ratePercent: 6 } },
      },
      refs: {},
      facts: {},
    },
    {
      title: "How many years until I have saved a crore?",
      inputs: {
        question: "In how many years do you reach the target?",
        currency: "inr",
        unit: " years",
        slider: { input: "years", label: "Years you keep investing", unit: "years", min: 1, max: 40, step: 1, start: 5 },
        curve: { calculator: "sip", held: { monthly: 10_000, ratePercent: 12 } },
        target: { calculator: "future_value", held: { amount: 1_000_000, ratePercent: 8, years: 40 } },
      },
      refs: {},
      facts: {},
    },
    {
      title: "When is a long loan as heavy as a short one?",
      inputs: {
        question: "At what rate does the 20-year EMI reach the 10-year EMI at 6%?",
        currency: "inr",
        unit: "%",
        slider: { input: "ratePercent", label: "Yearly interest rate", unit: "percent", min: 4, max: 14, step: 0.25, start: 9 },
        curve: { calculator: "emi", held: { principal: 1_000_000, years: 20 } },
        target: { calculator: "emi", held: { principal: 1_000_000, years: 10, ratePercent: 6 } },
      },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs: p, refs }) => {
    const currency = currencyOf(p.curve.calculator, p.currency);
    const slider: CompiledSlider = {
      name: "control",
      variable: p.slider.input,
      label: p.slider.label,
      range: p.slider,
      unit: p.slider.unit,
      task: `Slide ${p.slider.label.toLowerCase()} until the meter says you found it`,
    };
    const tasks = taskStatements([slider])!;
    const curve = `curve = Query("calculate_range", {calculator: ${str(p.curve.calculator)}, inputs: ${obj({ ...p.curve.held, [p.slider.input]: p.slider.start })}, vary: ${str(p.slider.input)}, from: ${num(p.slider.min)}, to: ${num(p.slider.max)}, step: ${num(p.slider.step)}, currency: ${str(currency)}}, {rows: [], output: "", outputs: []})`;
    const goal = `goal = Query("calculate", {calculator: ${str(p.target.calculator)}, inputs: ${obj(p.target.held)}, currency: ${str(currency)}}, {rows: []})`;
    const tolerance = Math.max(p.slider.step, (p.slider.max - p.slider.min) / 100);
    const extra = [num(tolerance), ...(refs.marker ? [str(refs.marker), str(p.markerLabel ?? "Sourced reference")] : []), ...(p.unit ? (refs.marker ? [str(p.unit)] : ["null", "null", str(p.unit)]) : [])];
    const find = `find = Breakeven(${str(p.question)}, curve.rows, @First(goal.rows.value), $${p.slider.input}, ${extra.join(", ")})`;
    return program(title, ["control", "find", tasks.name], [...sliderStatements(slider), curve, goal, find, ...tasks.statements]);
  },
});
