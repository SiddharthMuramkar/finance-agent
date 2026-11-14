// The small scales every plot shares: nice ticks, and linear, log, time and band mappings from data to drawing units.

/** The steps a nice tick may take: 1, 2, 2.5 and 5 times a power of ten. */
const NICE_STEPS = [1, 2, 2.5, 5, 10];

/** Strips floating-point noise (0.30000000000000004) from a tick value. */
const clean = (v: number) => Number(v.toPrecision(12));

/** The smallest nice step (1, 2, 2.5 or 5 × 10ⁿ) that is at least `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = raw / power;
  const step = NICE_STEPS.find((s) => s >= unit - 1e-9) ?? 10;
  return clean(step * power);
}

/**
 * Round-number ticks that cover [min, max], about `count` of them: the first at or below `min`, the last at or
 * above `max`, a nice step apart (1, 2, 2.5 or 5 × 10ⁿ). A single value gets a range made around it.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep((hi - lo) / Math.max(1, count - 1));
  const first = Math.floor(lo / step + 1e-9);
  const last = Math.ceil(hi / step - 1e-9);
  const ticks: number[] = [];
  for (let i = first; i <= last; i++) ticks.push(clean(i * step));
  return ticks;
}

/**
 * Ticks on a log axis covering [min, max] (both above zero): powers of ten, or 1, 2 and 5 × a power of ten
 * when the span is under three decades. The first is at or below `min`, the last at or above `max`.
 */
export function logTicks(min: number, max: number): number[] {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (!(lo > 0)) return [1, 10];
  const first = Math.floor(Math.log10(lo) + 1e-9);
  const last = Math.ceil(Math.log10(hi) - 1e-9);
  const multiples = last - first < 3 ? [1, 2, 5] : [1];
  const all: number[] = [];
  for (let p = first; p <= last; p++) for (const m of multiples) all.push(clean(m * Math.pow(10, p)));
  const below = Math.max(...all.filter((t) => t <= lo * (1 + 1e-9)));
  const above = Math.min(...all.filter((t) => t >= hi * (1 - 1e-9)));
  const kept = all.filter((t) => t >= below && t <= above);
  return kept.length > 1 ? kept : [below, below * 10];
}

/** A mapping from a data value to a drawing coordinate, and back. */
export type Scale = { (v: number): number; invert: (r: number) => number; domain: [number, number]; range: [number, number] };

/** A straight-line map from [d0, d1] to [r0, r1]. A zero-width domain maps to the middle of the range. */
export function linearScale(d0: number, d1: number, r0: number, r1: number): Scale {
  const span = d1 - d0;
  const f = ((v: number) => (span === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0))) as Scale;
  f.invert = (r) => (r1 === r0 ? d0 : d0 + ((r - r0) / (r1 - r0)) * span);
  f.domain = [d0, d1];
  f.range = [r0, r1];
  return f;
}

/** A log map from [d0, d1] (both above zero) to [r0, r1]. */
export function logScale(d0: number, d1: number, r0: number, r1: number): Scale {
  if (!(d0 > 0) || !(d1 > 0)) throw new RangeError("A log scale needs values above zero");
  const inner = linearScale(Math.log10(d0), Math.log10(d1), r0, r1);
  const f = ((v: number) => inner(Math.log10(Math.max(v, Number.MIN_VALUE)))) as Scale;
  f.invert = (r) => Math.pow(10, inner.invert(r));
  f.domain = [d0, d1];
  f.range = [r0, r1];
  return f;
}

/** Milliseconds since the epoch of a "YYYY", "YYYY-MM" or "YYYY-MM-DD" date, read as UTC; NaN when it is not a date. */
export function dateMs(date: string): number {
  if (/^\d{4}$/.test(date)) return Date.parse(`${date}-01-01T00:00:00Z`);
  if (/^\d{4}-\d{2}$/.test(date)) return Date.parse(`${date}-01T00:00:00Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return Date.parse(`${date}T00:00:00Z`);
  return NaN;
}

/** A time map from [t0, t1] (milliseconds) to [r0, r1]: distance on the axis is distance in time. */
export function timeScale(t0: number, t1: number, r0: number, r1: number): Scale {
  return linearScale(t0, t1, r0, r1);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const YEAR_MS = 365.25 * 86_400_000;

/** A moment as "Apr 1979" (UTC). */
export function monthYear(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** A label on a time axis: where (milliseconds), what it says, and whether it is the first or last. */
export type TimeMark = { ms: number; text: string; edge?: "start" | "end" };

/** How far in from either end (as a share of the span) a year tick must be, so it never meets an end label. */
const YEAR_TICK_MARGIN = 0.2;

/**
 * The labels for a time axis from `t0` to `t1`. A span of three years or more gets its first and last moments as
 * "Apr 1979" and round year ticks between them; a shorter span gets the first and last dates as written (`first`,
 * `last`), which the caller supplies so a daily series keeps its ISO dates.
 */
export function timeMarks(t0: number, t1: number, first: string, last: string): TimeMark[] {
  const marks: TimeMark[] = [];
  if (t1 - t0 >= 3 * YEAR_MS) {
    marks.push({ ms: t0, text: monthYear(t0), edge: "start" });
    const y0 = new Date(t0).getUTCFullYear();
    const y1 = new Date(t1).getUTCFullYear();
    for (const year of niceTicks(y0, y1, 4)) {
      const ms = Date.UTC(year, 0, 1);
      const at = (ms - t0) / (t1 - t0);
      if (Number.isInteger(year) && at >= YEAR_TICK_MARGIN && at <= 1 - YEAR_TICK_MARGIN) marks.push({ ms, text: String(year) });
    }
    marks.push({ ms: t1, text: monthYear(t1), edge: "end" });
    return marks;
  }
  marks.push({ ms: t0, text: first, edge: "start" });
  if (t1 !== t0) marks.push({ ms: t1, text: last, edge: "end" });
  return marks;
}

/** Evenly spaced bands for `n` categories across [r0, r1]. */
export type BandScale = { step: number; bandwidth: number; start: (i: number) => number; center: (i: number) => number; nearest: (r: number) => number };

/** `padding` is the share of each band left empty; `maxBandwidth` caps the band's width, which stays centred in its slot. */
export function bandScale(n: number, r0: number, r1: number, padding = 0.2, maxBandwidth = Infinity): BandScale {
  const count = Math.max(1, n);
  const step = (r1 - r0) / count;
  const bandwidth = Math.min(step * (1 - padding), maxBandwidth);
  const center = (i: number) => r0 + step * (i + 0.5);
  return {
    step,
    bandwidth,
    center,
    start: (i) => center(i) - bandwidth / 2,
    nearest: (r) => Math.min(count - 1, Math.max(0, Math.floor((r - r0) / step))),
  };
}
