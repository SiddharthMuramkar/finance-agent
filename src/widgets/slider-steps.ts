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

// ——— Sliders a person can land on (spec 2026-11-12, B5) ———

/** The most steps a drag moves through across the track: each at least 2 pixels wide on a track of about 400. */
export const MAX_DRAG_STEPS = 200;

/** How near, in pixels, a drag must come to a stop (a value a Guided Task names, or the opening value) to rest on it. */
export const SNAP_PX = 12;

/** A track's width when the page cannot measure it (a server render, a test): about a Widget panel's slider. */
export const ASSUMED_TRACK_PX = 400;

const nearlyEqual = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * The step a drag moves by: the slider's own step (sliderStep), or the smallest round multiple of it (1, 2 or 5 times a
 * power of ten) that keeps the track to MAX_DRAG_STEPS steps, and to one step every 2 pixels on a track `trackPx` wide.
 * A percent slider from 0% to 20% drags in 0.1 steps; its steppers and arrow keys still move 0.01.
 */
export function dragStep(range: SliderRange, trackPx?: number): number {
  const fine = sliderStep(range);
  const span = range.max - range.min;
  const most = trackPx && trackPx > 0 ? Math.max(1, Math.min(MAX_DRAG_STEPS, Math.floor(trackPx / 2))) : MAX_DRAG_STEPS;
  if (!(fine > 0) || !(span > 0) || span / fine <= most + 1e-9) return fine;
  // A whole number of fine steps, 1, 2 or 5 times a power of ten, so every value a drag lands on is one the steppers reach.
  const wanted = span / most / fine;
  for (let power = Math.max(0, Math.floor(Math.log10(wanted))); ; power++) {
    for (const lead of [1, 2, 5]) {
      if (lead * 10 ** power >= wanted - 1e-9) return Number((fine * lead * 10 ** power).toPrecision(12));
    }
  }
}

/** The stop a value is within `px` pixels of, on a track `trackPx` wide, nearest first; null when none is that near. */
export function nearStop(value: number, range: SliderRange, stops: readonly number[], trackPx: number = ASSUMED_TRACK_PX, px: number = SNAP_PX): number | null {
  const span = range.max - range.min;
  if (!(span > 0)) return null;
  const width = trackPx > 0 ? trackPx : ASSUMED_TRACK_PX;
  let best: number | null = null;
  for (const stop of stops) {
    if (stop < range.min || stop > range.max) continue;
    const distance = (Math.abs(value - stop) / span) * width;
    if (distance <= px + 1e-9 && (best === null || Math.abs(value - stop) < Math.abs(value - best))) best = stop;
  }
  return best;
}

/**
 * Where a drag (or a tap on the track) lands: on a stop when it comes within SNAP_PX of one, else on the drag step's grid
 * counted from min, inside min..max.
 */
export function landedValue(raw: number, range: SliderRange, stops: readonly number[] = [], trackPx: number = ASSUMED_TRACK_PX): number {
  const stop = nearStop(raw, range, stops, trackPx);
  if (stop !== null) return stop;
  const step = dragStep(range, trackPx);
  return settledValue(range.min + Math.round((raw - range.min) / step) * step, range);
}

/**
 * One fine step down (−1) or up (+1), for the steppers and arrow keys, stopping at a stop on the way: the steps run from
 * min, so a stop off them (a Case's 12.84% on a slider in 0.25 steps) is a value of its own the steppers pass through.
 */
export function nextValue(value: number, direction: -1 | 1, range: SliderRange, stops: readonly number[] = []): number {
  const step = sliderStep(range);
  const index = (value - range.min) / step;
  const onGrid = nearlyEqual(index, Math.round(index));
  const gridNext = range.min + (onGrid ? Math.round(index) + direction : direction > 0 ? Math.ceil(index) : Math.floor(index)) * step;
  const ahead = stops.filter((s) => s >= range.min && s <= range.max && (direction > 0 ? s > value + 1e-9 : s < value - 1e-9));
  const nearestStop = ahead.length ? (direction > 0 ? Math.min(...ahead) : Math.max(...ahead)) : null;
  const next = nearestStop !== null && (direction > 0 ? nearestStop < gridNext : nearestStop > gridNext) ? nearestStop : gridNext;
  return settledValue(next, range);
}

/** True when a slider's value is within one drag step of a value a Guided Task names, so the task ticks (B5). */
export function withinOneStep(value: number, target: number, range: SliderRange): boolean {
  return Math.abs(value - target) <= dragStep(range) * (1 + 1e-9);
}

/** How the slider says a value aloud, with its unit, for aria-valuetext: "4.5 percent", "10 years", "1,000 dollars". */
export function spokenValue(value: number, unit: string | undefined): string {
  const n = readingValue(value);
  if (unit === "percent") return `${n} percent`;
  if (unit === "years") return `${n} ${n === 1 ? "year" : "years"}`;
  if (unit === "inr") return `${n.toLocaleString("en-IN")} rupees`;
  if (unit === "usd") return `${n.toLocaleString("en-US")} dollars`;
  return String(n);
}
