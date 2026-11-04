import { z } from "zod";
import { calculate, CALCULATORS } from "@/finance/calculators";
import { defineRecipe, program, rangeProblems, SLIDER_UNITS, sliderShape, sliderStatements, taskStatements, obj, str, type Archetype, type Budget, type CompiledSlider } from "../define";

/** The numeric input names of a calculator (the Calculator part takes numbers only). */
export function calculatorInputNames(id: string): string[] {
  const calculator = CALCULATORS.find((c) => c.id === id);
  return Object.keys((calculator?.inputs as unknown as { shape?: object })?.shape ?? {});
}

type CalculatorRecipe = {
  id: string;
  archetype: Archetype;
  summary: string;
  calculators: readonly [string, ...string[]];
  budget: Budget;
  examples: { title: string; inputs: { calculator: string; currency?: "usd" | "inr"; held: Record<string, number>; slider: { input: string; label: string; unit: (typeof SLIDER_UNITS)[number]; min: number; max: number; step: number; start: number } }; refs: Record<string, never>; facts: Record<string, never> }[];
};

/**
 * A recipe drawn with our Calculator part: one slider moves one calculator input, the others are held, and the
 * results are worked out in the browser by our tested calculator. The params are checked by running the calculator
 * at the slider's start, min and max, so a recipe Widget never shows a calculator error.
 */
export function calculatorRecipe(r: CalculatorRecipe) {
  const inputs = z
    .object({
      calculator: z.enum(r.calculators),
      currency: z.enum(["usd", "inr"]).optional(),
      held: z.record(z.string(), z.number()).describe("The calculator's other inputs, held fixed, by input name"),
      slider: z.object({ input: z.string().describe("The calculator input the Learner moves"), label: z.string().trim().min(2).max(40), unit: z.enum(SLIDER_UNITS), ...sliderShape }),
    })
    .superRefine((p, ctx) => {
      const names = calculatorInputNames(p.calculator);
      const issue = (message: string) => ctx.addIssue({ code: "custom", message });
      for (const message of rangeProblems(p.slider)) issue(`slider: ${message}`);
      if (!names.includes(p.slider.input)) issue(`slider.input must be one of ${p.calculator}'s inputs: ${names.join(", ")}`);
      for (const key of Object.keys(p.held)) if (!names.includes(key)) issue(`held.${key} is not an input of ${p.calculator}: ${names.join(", ")}`);
      if (p.slider.input in p.held) issue(`${p.slider.input} is both held and on the slider`);
      for (const at of [p.slider.start, p.slider.min, p.slider.max]) {
        const result = calculate(p.calculator, { ...p.held, [p.slider.input]: at }, p.currency);
        if (!result.ok) {
          issue(`with ${p.slider.input} at ${at}, ${p.calculator} says: ${result.error}`);
          break;
        }
      }
    });
  return defineRecipe({
    id: r.id,
    archetype: r.archetype,
    summary: r.summary,
    params: { inputs, refs: z.object({}), facts: z.object({}) },
    budget: r.budget,
    examples: r.examples,
    compile: ({ title, inputs: p }) => {
      const slider: CompiledSlider = { name: "control", variable: p.slider.input, label: p.slider.label, range: p.slider, unit: p.slider.unit };
      const tasks = taskStatements([slider])!;
      const calc = `calc = Calculator(${str(p.calculator)}, ${obj({ ...p.held, [p.slider.input]: `$${p.slider.input}` })}${p.currency ? `, ${str(p.currency)}` : ""})`;
      return program(title, ["control", "calc", tasks.name], [...sliderStatements(slider), calc, ...tasks.statements]);
    },
  });
}
