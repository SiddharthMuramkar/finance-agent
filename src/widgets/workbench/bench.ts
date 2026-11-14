// What every Workbench Widget's view-model shares (spec 2026-11-12, B2 and B4; ADR 0018): a lever's shape, the size at rest
// the Workbench budget counts, the headline in three parts with its one key number, and the rounding the ranges are built
// with. Pure; the views (bench-view.tsx) draw only what a model returns, and the Widget check and what the Tutor is told
// read the same models, so the screen, the check and the Tutor agree.

/** One lever of a Workbench, as its model works it out and its view draws it with SliderControl. */
export type BenchLever<Id extends string = string> = {
  id: Id;
  /** A short plain name above the label, such as "How big it gets"; none when the label says it all. */
  title?: string;
  /** What it sets: "Growth after year 10". */
  label: string;
  min: number;
  max: number;
  step: number;
  /** Where it opens: the Case's own figure, or the one the Topic file gives. */
  opening: number;
  /** Values a drag rests on (B5): the opening and every value a Thing to try names. */
  stops: number[];
  /** Values a Thing to try names, shown as chips under the slider (B5). */
  chips: number[];
  /** Under "More settings". */
  more: boolean;
  /** A setting as the readout prints it: "6%", "$2.9bn", "1.60". */
  reading: (value: number) => string;
  /** A setting said aloud with its unit: "6 percent". */
  spoken: (value: number) => string;
  /** A small line under the label. */
  caption?: string;
};

/** The size of a Workbench at rest, for the Workbench budget (WORKBENCH_BUDGET in check.ts). */
export type BenchShape = { controls: number; more: number; visuals: number; numbers: number; headlines: number; words: number; tasks: number };

/** A headline in three parts, the middle one the key number: "After year 10 holds " "112%" " of the value". */
export type BenchHeadline = { before: string; key: string; after: string };

/** One number at rest, beside its label. */
export type BenchNumber = { label: string; text: string };

/** Where a figure came from, as the Topic file gives it. */
export type Source = { title: string; url: string };

/** What the Tutor is told of a Workbench (readWidget): each lever at its setting, and the readouts the engine works out. */
export type BenchReading = { sliders: { label: string; text: string }[]; readouts: string[] };

/** How many words a text has. */
export const wordsIn = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** A number with the float noise of decimal arithmetic taken off: 0.1 + 0.2 is 0.3. */
export const clean = (n: number) => Number(n.toPrecision(12));

/** Rounded to the nearest step, down to it, up to it. */
export const onStep = (n: number, step: number) => clean(Math.round(n / step) * step);
export const floorTo = (n: number, step: number) => clean(Math.floor(clean(n / step)) * step);
export const ceilTo = (n: number, step: number) => clean(Math.ceil(clean(n / step)) * step);

/** Equal but for float noise. */
export const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** Rounded to one significant figure: 9.75 is 10, 0.975 is 1, 2.1 is 2. */
export function oneFigure(n: number): number {
  if (!(n > 0)) return 0;
  const power = 10 ** Math.floor(Math.log10(n));
  return clean(Math.round(n / power) * power);
}

/** The round number at or above `n` from 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 and 10 of its power of ten: 15,157 is 20,000. */
export function niceUp(n: number): number {
  if (!(n > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(n));
  const lead = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * power >= n - 1e-9) ?? 10;
  return clean(lead * power);
}

/** Rounded to `digits` decimals, halves away from zero once float noise is off: -13.355 is -13.36, as Appendix B.1 prints it. */
export function roundTo(n: number, digits: number): number {
  const scale = 10 ** digits;
  return clean((Math.sign(n) * Math.round(clean(Math.abs(n) * scale))) / scale) || 0;
}

/** A percent as a reading: "6%", "12.84%", "-13.36%", to at most `digits` decimals. */
export const percentText = (n: number, digits = 2) => `${roundTo(n, digits)}%`;
/** A percent said aloud: "12.84 percent". */
export const percentSpoken = (n: number, digits = 2) => `${roundTo(n, digits)} percent`;

/** The stops of a lever: its opening and every value a task names, inside its range, sorted. */
export function stopsOf(lever: { min: number; max: number }, values: readonly number[]): number[] {
  return [...new Set(values.filter((v) => Number.isFinite(v) && v >= lever.min - 1e-9 && v <= lever.max + 1e-9))].sort((a, b) => a - b);
}

/** A percent lever: reading "6%", spoken "6 percent", stopping at its opening and at the values its tasks name. */
export function percentLever<Id extends string>(spec: { id: Id; label: string; min: number; max: number; step: number; opening: number; title?: string; caption?: string; more?: boolean; chips?: number[] }): BenchLever<Id> {
  const chips = stopsOf(spec, spec.chips ?? []);
  return {
    ...spec,
    more: spec.more ?? false,
    chips,
    stops: stopsOf(spec, [spec.opening, ...chips]),
    reading: (v) => percentText(v),
    spoken: (v) => percentSpoken(v),
  };
}

/** Settings from Widget state numbers: each lever's own where it is a finite number inside its range (clamped), else its opening. */
export function benchSettings<Id extends string>(values: Partial<Record<Id, unknown>>, levers: readonly BenchLever<Id>[]): Record<Id, number> {
  return Object.fromEntries(
    levers.map((lever) => {
      const v = values[lever.id];
      return [lever.id, typeof v === "number" && Number.isFinite(v) ? Math.min(lever.max, Math.max(lever.min, v)) : lever.opening];
    }),
  ) as Record<Id, number>;
}

/** Every lever at its opening. */
export function benchOpenings<Id extends string>(levers: readonly BenchLever<Id>[]): Record<Id, number> {
  return Object.fromEntries(levers.map((l) => [l.id, l.opening])) as Record<Id, number>;
}

/** What the Tutor is told of the levers: each label (with its plain name) and its reading. */
export function leverReadings<Id extends string>(levers: readonly BenchLever<Id>[], settings: Record<Id, number>): BenchReading["sliders"] {
  return levers.map((l) => ({ label: l.title && l.title !== l.label ? `${l.label} (${l.title.toLowerCase()})` : l.label, text: l.reading(settings[l.id]) }));
}

/** The size at rest from what a model shows: its levers, its numbers (the headline among them), its prose and its tasks. */
export function benchShape(levers: readonly BenchLever[], numbers: number, prose: readonly string[], tasks: number): BenchShape {
  return {
    controls: levers.filter((l) => !l.more).length,
    more: levers.filter((l) => l.more).length,
    visuals: 1,
    numbers,
    headlines: 1,
    words: prose.reduce((sum, text) => sum + wordsIn(text), 0),
    tasks,
  };
}
