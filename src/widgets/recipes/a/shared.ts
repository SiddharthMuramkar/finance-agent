import { z } from "zod";
import { calculate, calculateParts, CALCULATORS, type Currency } from "@/finance/calculators";
import { rangeProblems, SLIDER_UNITS, sliderShape } from "../define";

/** The numeric input names of a calculator (a Widget takes numbers only). */
export function inputNames(id: string): string[] {
  const calculator = CALCULATORS.find((c) => c.id === id);
  return Object.keys((calculator?.inputs as unknown as { shape?: object })?.shape ?? {});
}

/** Calculators whose inputs are lists (cash flows), which a Widget cannot run. */
const LIST_CALCULATORS = new Set(["npv", "irr", "dcf"]);

/** Every calculator a Widget can run: those that take numbers only. */
export const NUMBER_CALCULATORS = CALCULATORS.filter((c) => !LIST_CALCULATORS.has(c.id)).map((c) => c.id) as [string, ...string[]];

/** A calculator id that takes numbers only. A string with a check, so the Tutor's catalog does not list every id for every use. */
export const numberCalculator = z.string().refine((id) => NUMBER_CALCULATORS.includes(id), `a calculator id that takes numbers only: ${NUMBER_CALCULATORS.join(", ")}`);

export const currencyOf = (id: string, currency?: Currency): Currency => currency ?? CALCULATORS.find((c) => c.id === id)?.defaultCurrency ?? "inr";

/** A label for a control or a side: short plain text. */
export const shortLabel = z.string().trim().min(2).max(40);

/** A slider's range and label. Strict: an extra key (a free number) is refused, not dropped. */
export const sliderBase = z.object({ label: shortLabel, unit: z.enum(SLIDER_UNITS), ...sliderShape }).strict();
export type SliderParams = z.output<typeof sliderBase>;

/** The first result of a calculator at some inputs, or the plain reason it cannot be worked out. */
export function firstResult(id: string, inputs: Record<string, number>, currency?: Currency): { ok: true; value: number; kind: string } | { ok: false; error: string } {
  const done = calculate(id, inputs, currency);
  if (!done.ok) return done;
  const first = done.results[0];
  return Number.isFinite(first?.value) ? { ok: true, value: first.value, kind: first.kind } : { ok: false, error: `${id} gave no number` };
}

/** Problems with a calculator's held inputs and the one input a slider moves. */
export function heldProblems(calculator: string, held: Record<string, number>, slider: string): string[] {
  const names = inputNames(calculator);
  const problems: string[] = [];
  if (!names.includes(slider)) problems.push(`slider input "${slider}" is not an input of ${calculator}: ${names.join(", ")}`);
  for (const key of Object.keys(held)) if (!names.includes(key)) problems.push(`held.${key} is not an input of ${calculator}: ${names.join(", ")}`);
  if (slider in held) problems.push(`${slider} is both held and on the slider`);
  return problems;
}

/**
 * A calculator with one input on a slider and the rest held. The calculator (or, with `parts`, its split into
 * the parts MoneyStack draws) is run at the slider's start, min and max, so the Widget never shows an error.
 */
export function calculatorSliderInputs(calculators: readonly [string, ...string[]], opts: { parts?: boolean } = {}) {
  return z
    .object({
      calculator: z.enum(calculators),
      currency: z.enum(["usd", "inr"]).optional(),
      held: z.record(z.string(), z.number()).describe("The calculator's other inputs, held fixed, by input name"),
      slider: sliderBase.extend({ input: z.string().describe("The calculator input the Learner moves") }),
      caption: z.string().trim().max(60).optional().describe("A few words above the picture"),
    })
    .strict()
    .superRefine((p, ctx) => {
      const issue = (message: string) => ctx.addIssue({ code: "custom", message });
      for (const message of rangeProblems(p.slider)) issue(`slider: ${message}`);
      const problems = heldProblems(p.calculator, p.held, p.slider.input);
      problems.forEach(issue);
      if (problems.length) return;
      for (const at of [p.slider.start, p.slider.min, p.slider.max]) {
        const inputs = { ...p.held, [p.slider.input]: at };
        const result = opts.parts ? calculateParts(p.calculator, inputs, currencyOf(p.calculator, p.currency)) : calculate(p.calculator, inputs, p.currency);
        if (!result.ok) {
          issue(`with ${p.slider.input} at ${at}, ${p.calculator} says: ${result.error}`);
          break;
        }
      }
    });
}
