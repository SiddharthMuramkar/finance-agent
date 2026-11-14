// PROTOTYPE (wayfinder ticket #5, Prototype B): the Signal rates Widget, spec §6.5 "One move, three sizes", built as a
// recipe inside the OpenUI Lang pipeline. Throwaway: it answers "what does the pipeline force?", it is not production.
//
// The pure half of the part: the model of spec §6.5.1, the words of the call and the readouts, and the stage geometry.
// No React, so the recipe (run on the server) and the part (run in the browser) read the same numbers and words.

/** The stage's rate line, in percent (spec §6.5.2: X(v) = 14 + (v − 1) / 7 × (W − 28)). */
export const STAGE_MIN = 1;
export const STAGE_MAX = 8;

/** The sliders' ranges (spec §6.5.1 and §8.2): the old rate 1 to 8, the new rate 2 to 7. */
export const OLD_RANGE = { min: 1, max: 8 } as const;
export const NEW_RANGE = { min: 2, max: 7 } as const;

/** The sizes of one move (spec §6.5.1). */
export type Sizes = {
  /** n − o in percentage points, to 2 decimals, signed. */
  pts: number;
  /** pts × 100, whole, signed. */
  bp: number;
  /** pts as a percent of the old rate, signed; null when the old rate is 0. */
  rel: number | null;
  /** The points "up {pts}%" would mean if read as a percent of the old rate: o × |pts| / 100. */
  literal: number;
  /** The rate that literal reading would give: o ± literal. */
  target: number;
};

/** Rounds without float noise: 4.5 − 4 is 0.5, and a move of nothing is 0, never −0. */
const round = (value: number, decimals: number) => Math.round(Number(`${value.toFixed(10)}e${decimals}`)) / 10 ** decimals || 0;

export function sizes(o: number, n: number): Sizes {
  const pts = round(n - o, 2);
  const literal = (o * Math.abs(pts)) / 100;
  return { pts, bp: Math.round(pts * 100), rel: o === 0 ? null : (pts / o) * 100, literal, target: pts >= 0 ? o + literal : o - literal };
}

/** Up to `d` decimals, trailing zeros removed (spec §6.1 `trim`). */
export const trim = (x: number, d: number) => String(Number(x.toFixed(d)) || 0);

/** "Old 4.00%": a rate to two fixed decimals, as the stage labels write it. */
export const fixed2 = (x: number) => `${x.toFixed(2)}%`;

const MINUS = "−";
const pointWord = (p: number) => (Math.abs(p) === 1 ? "point" : "points");
/** A share said in words where it is a plain fraction: 25 is "a quarter". */
const FRACTIONS: Record<string, string> = { "12.5": "an eighth", "25": "a quarter", "50": "half", "100": "all" };

export type Verdict = "right" | "careful";
export type CallOption = { id: "literal" | "points" | "percent"; bit: number; label: string; verdict: Verdict; pill: string; feedback: string };

/**
 * The three options of the call (spec §6.5.2, multi-select): the literal reading (careful), points (right) and the
 * percent of the old rate (right). The verdicts live here, in tested code, never with the Tutor (spec §8.1). Each option
 * has a bit, so the Learner's taps fit in one number the Widget state can save ($called).
 */
export function callOptions(o: number, n: number): CallOption[] {
  const s = sizes(o, n);
  const up = s.pts >= 0;
  const way = up ? "Up" : "Down";
  const P = trim(Math.abs(s.pts), 2);
  const R = trim(Math.abs(s.rel ?? 0), 2);
  const O = trim(o, 2);
  const N = trim(n, 2);
  const L = trim(s.literal, 4);
  const T = trim(s.target, 4);
  const word = pointWord(s.pts);
  return [
    {
      id: "literal",
      bit: 1,
      label: `${way} ${P}%`,
      verdict: "careful",
      pill: "Careful",
      feedback: `${P}% of ${O}% is only ${L} points, which would make the new rate ${T}%. Writers often say “${way.toLowerCase()} ${P}%” when they mean ${P} ${word}.`,
    },
    {
      id: "points",
      bit: 2,
      label: `${way} ${P} percentage ${word}`,
      verdict: "right",
      pill: "Right",
      feedback: up
        ? `${N} minus ${O} is ${P} ${word}. Traders call the same move ${Math.abs(s.bp)} basis points.`
        : `${O} minus ${N} is ${P} ${word}, a fall. Traders call the same fall ${Math.abs(s.bp)} basis points.`,
    },
    {
      id: "percent",
      bit: 4,
      label: `${way} ${R}%`,
      verdict: "right",
      pill: "Right",
      feedback: `${P} ${word} is ${FRACTIONS[R] ?? `${R}%`} of the old ${O}%, so the rate itself ${up ? "grew" : "fell"} by ${R}%.`,
    },
  ];
}

/** The ruler values (spec §6.5.2): "1 point" / "1.5 points" / "no move", "100 bp", "25%". Sizes, without direction. */
export function rulerValues(o: number, n: number): [string, string, string] {
  const s = sizes(o, n);
  if (s.bp === 0) return ["no move", "0 bp", "0%"];
  return [`${trim(Math.abs(s.pts), 2)} ${pointWord(s.pts)}`, `${Math.abs(s.bp)} bp`, `${trim(Math.abs(s.rel ?? 0), 2)}%`];
}

/** The three readouts (spec §6.5.2 facts grid): "up 1 point", "+100 bp", "up 25%"; "No move", "0 bp", "0%". */
export function readouts(o: number, n: number): [string, string, string] {
  const s = sizes(o, n);
  if (s.bp === 0) return ["No move", "0 bp", "0%"];
  const way = s.pts > 0 ? "up" : "down";
  return [`${way} ${trim(Math.abs(s.pts), 2)} ${pointWord(s.pts)}`, `${s.bp > 0 ? "+" : MINUS}${Math.abs(s.bp)} bp`, `${way} ${trim(Math.abs(s.rel ?? 0), 2)}%`];
}

/** The trap sentence's parts (spec §6.5.2), or null when there is no move: Read literally, "up 1%" is 1% of the old 4%… */
export function trapWords(o: number, n: number): { quote: string; percent: string; old: string; points: string; to: string } | null {
  const s = sizes(o, n);
  if (s.bp === 0) return null;
  return { quote: `${s.pts > 0 ? "up" : "down"} ${trim(Math.abs(s.pts), 2)}%`, percent: trim(Math.abs(s.pts), 2), old: trim(o, 2), points: trim(s.literal, 4), to: trim(s.target, 4) };
}

/** Where a rate sits on a stage `width` pixels wide (spec §6.5.2). */
export const xOf = (v: number, width: number) => 14 + ((v - STAGE_MIN) / (STAGE_MAX - STAGE_MIN)) * (width - 28);

/** A label's anchor: start near the left edge, end near the right, else middle (spec §6.5.2). */
export const anchorAt = (x: number, width: number): "start" | "middle" | "end" => (x < 60 ? "start" : x > width - 60 ? "end" : "middle");

/** One ruler: its label, its value, and the rates its ticks sit at, from the old rate outward (spec §6.5.2). */
export type Ruler = { label: string; value: string; unit: number; ticks: number[] };

/** The most ticks a ruler draws; past it, only the two ends (spec §6.5.2: "No ticks when the count would exceed 60"). */
export const MAX_TICKS = 60;

export function rulers(o: number, n: number): Ruler[] {
  const s = sizes(o, n);
  const values = rulerValues(o, n);
  const specs = [
    { label: "In percentage points", unit: 1 },
    { label: "In basis points, 10 to a tick", unit: 0.1 },
    { label: "As a percent of the old rate, 5% to a tick", unit: 0.05 * o },
  ];
  return specs.map(({ label, unit }, i) => {
    const dir = s.pts >= 0 ? 1 : -1;
    const count = unit > 0 ? Math.floor(Math.abs(s.pts) / unit + 1e-9) : 0;
    const inner = count > MAX_TICKS ? [] : Array.from({ length: Math.max(0, count - 1) }, (_, k) => o + dir * unit * (k + 1));
    // The far end is the new rate; an inner tick that lands on it (a whole number of units) is not drawn twice.
    const ticks = s.bp === 0 ? [] : [o, ...inner.filter((v) => Math.abs(v - n) > 1e-9), n];
    return { label, value: values[i], unit, ticks };
  });
}
