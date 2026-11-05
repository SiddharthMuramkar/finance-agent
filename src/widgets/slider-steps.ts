/**
 * How a Widget's slider moves and what values it takes (spec #119, "Widgets › Sliders"). Percent sliders
 * always move in 0.01 steps, whatever step the Widget is written with, so a Learner can set 3.33%. Every
 * value set is rounded to the step's decimals, so a Guided Task that checks `$rate == 3.38` ticks when
 * 3.38 is typed; starting values sit on a step.
 */

export type SliderRange = { min: number; max: number; step: number; unit?: string };

/** The step the slider moves by: 0.01 for a percent slider, the written step otherwise. */
export function sliderStep({ step, unit }: SliderRange): number {
  return unit === "percent" ? 0.01 : step;
}

/** How many decimals a step has: 0.01 → 2, 0.25 → 2, 1 → 0, 100000 → 0. */
function decimalsOf(step: number): number {
  const written = String(step).toLowerCase();
  const [digits, exponent] = written.split("e");
  const fraction = digits.split(".")[1]?.length ?? 0;
  return Math.max(0, fraction - Number(exponent ?? 0));
}

const round = (value: number, decimals: number) => Number(value.toFixed(Math.min(decimals, 20)));
const clamp = (value: number, { min, max }: SliderRange) => Math.min(max, Math.max(min, value));

/** A value set on the slider: inside min..max and rounded to the step's decimals. */
export function settledValue(value: number, range: SliderRange): number {
  return round(clamp(value, range), decimalsOf(sliderStep(range)));
}

/** One step down (−1) or up (+1), stopping at min and max. */
export function steppedValue(value: number, direction: -1 | 1, range: SliderRange): number {
  return settledValue(value + direction * sliderStep(range), range);
}

/** A starting value moved onto the nearest step from the minimum, inside min..max. */
export function snappedValue(value: number, range: SliderRange): number {
  const step = sliderStep(range);
  if (!(step > 0)) return settledValue(value, range);
  return settledValue(range.min + Math.round((value - range.min) / step) * step, range);
}

/** A value as the readout prints it: at its own precision, without float noise (3.38 on a 0.25 slider). */
export function readingValue(value: number): number {
  return round(value, 10);
}
