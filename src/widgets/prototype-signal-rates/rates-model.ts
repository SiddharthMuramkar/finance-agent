// PROTOTYPE (wayfinder #5, prototype A): throwaway. The maths, the copy and the dataset of the Signal "rates" widget
// (spec value-it-signal-spec.md §6.5). Pure and shared: the server clamp and the client widget both use it.
// Delete this folder when #5 picks its engine.

export type RatesState = { old: number; new: number };
export type Verdict = "right" | "wrong" | "careful";
export type OptionId = "literal" | "points" | "relative";
export type CallOption = { id: OptionId; label: string; verdict: Verdict; fb: string };

/** §8.2 ranges. old 1 to 8 step 0.25 (the Go deeper slider); new 2 to 7 step 0.05 (the main slider). */
export const RANGES = {
  old: { min: 1, max: 8, step: 0.25 },
  new: { min: 2, max: 7, step: 0.05 },
} as const;

/** The checked dataset the Tutor names by id (§8.1: the Tutor may not supply raw figures or verdicts). */
export type RatesDataset = {
  id: string;
  checked: true;
  checkedOn: string;
  source: string;
  category: string;
  title: string;
  defaultState: RatesState;
};

export const RATES_DATASETS: Record<string, RatesDataset> = {
  "rates-up-1": {
    id: "rates-up-1",
    checked: true,
    checkedOn: "2026-11-14",
    source: "Worked example from the Topic. No outside figures.",
    category: "The news",
    title: "One move, three sizes",
    defaultState: { old: 4, new: 5 },
  },
};

export const round2 = (x: number) => Math.round(x * 100) / 100;

/** §6.1 trim(x, d): up to d decimals, trailing zeros removed. */
export const trim = (x: number, d = 2) => String(Number(x.toFixed(d)));

const MINUS = "−";

/** §6.5.1 model. */
export function ratesModel(s: RatesState) {
  const o = s.old;
  const n = s.new;
  const pts = round2(n - o);
  const bp = Math.round(pts * 100);
  const rel = (pts / o) * 100;
  const literal = (o * Math.abs(pts)) / 100;
  const target = o + Math.sign(pts) * literal;
  const dir: "up" | "down" | "none" = pts > 0 ? "up" : pts < 0 ? "down" : "none";
  return { o, n, pts, bp, rel, literal, target, dir };
}
export type RatesModel = ReturnType<typeof ratesModel>;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const pointsWord = (pts: number) => (Math.abs(pts) === 1 ? "1 point" : `${trim(Math.abs(pts))} points`);

/** The three readout cells (§6.5.2, facts grid). */
export function readouts(m: RatesModel) {
  if (m.dir === "none") return { moved: "No move", traders: "0 bp", nextToOld: "0%" };
  return {
    moved: `${m.dir} ${pointsWord(m.pts)}`,
    traders: `${m.bp > 0 ? "+" : MINUS}${Math.abs(m.bp)} bp`,
    nextToOld: `${m.dir} ${trim(Math.abs(m.rel))}%`,
  };
}

/** “Up 1%”: the headline words for this move. */
export const headline = (m: RatesModel) => `${cap(m.dir)} ${trim(Math.abs(m.pts))}%`;

/** Trap sentence parts (hidden when there is no move). */
export function trapSentence(m: RatesModel) {
  if (m.dir === "none") return null;
  return {
    lead: `Read literally, “${headline(m).toLowerCase()}” is ${trim(Math.abs(m.pts))}% of the old ${trim(m.o)}%: a move of only `,
    bold: `${trim(m.literal, 3)} points`,
    tail: `, to ${trim(m.target, 3)}%.`,
  };
}

/**
 * The call's three options, built by code from the call facts (the state the Tutor opened the widget at).
 * Verdicts come from the maths, never from the Tutor. At 4 -> 5 the copy matches §6.5.2 except "a quarter" -> "25%".
 * Caller guarantees a move (the clamp refuses a no-move call state).
 */
export function callOptions(facts: RatesState): CallOption[] {
  const m = ratesModel(facts);
  const p = trim(Math.abs(m.pts));
  const r = trim(Math.abs(m.rel));
  const pp = Math.abs(m.pts) === 1 ? "percentage point" : "percentage points";
  const [hi, lo] = m.dir === "up" ? [m.n, m.o] : [m.o, m.n];
  return [
    {
      id: "literal",
      label: `${cap(m.dir)} ${p}%`,
      verdict: "careful",
      fb: `${p}% of ${trim(m.o)}% is only ${trim(m.literal, 3)} points, which would make the new rate ${trim(m.target, 3)}%. Writers often say “${m.dir} ${p}%” when they mean ${pointsWord(m.pts)}.`,
    },
    {
      id: "points",
      label: `${cap(m.dir)} ${p} ${pp}`,
      verdict: "right",
      fb: `${trim(hi)} minus ${trim(lo)} is ${pointsWord(m.pts)}. Traders call the same move ${Math.abs(m.bp)} basis points.`,
    },
    {
      id: "relative",
      label: `${cap(m.dir)} ${r}%`,
      verdict: "right",
      fb: `${cap(pointsWord(m.pts))} is ${r}% of the old ${trim(m.o)}%, so the rate itself ${m.dir === "up" ? "grew" : "fell"} by ${r}%.`,
    },
  ];
}

/** Ruler tick positions (rates, in %), from the old rate outward; null when the count would exceed 60 (§6.5.2). */
export function rulerTicks(m: RatesModel, unit: number): number[] | null {
  const count = Math.abs(m.pts) / unit;
  if (m.dir === "none" || count > 60 + 1e-9) return null;
  const k = Math.floor(count + 1e-9);
  const sign = Math.sign(m.pts);
  const out: number[] = [];
  for (let i = 0; i <= k; i++) out.push(m.o + sign * i * unit);
  if (Math.abs(out[out.length - 1] - m.n) > 1e-9) out.push(m.n);
  return out;
}
