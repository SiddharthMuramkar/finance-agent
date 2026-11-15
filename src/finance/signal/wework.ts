/**
 * The WeWork Signal widget's model (spec §6.6, "a pace is not revenue"). A run rate is a pace: the latest month's
 * revenue times 12. Revenue is what was recorded. Five beats tell the story one at a time and reveal one bar each;
 * on beat 5 the learner makes the call, and the first tap opens Go deeper with the loss per dollar of revenue.
 * Pure functions only: the widget renders what `weworkView` returns, so the widget and the Tutor cannot differ.
 * Source: WeWork S-1, 14 Aug 2019.
 */

/** One beat of the story, 1 to 5 (the widget's only state key, spec §8.2). */
export type WeworkBeat = 1 | 2 | 3 | 4 | 5;

/** The two answers to the call. */
export type WeworkOptionId = "revenue" | "pace";

/** The beat reached, and the learner's call (null until the first tap on beat 5). */
export type WeworkState = { beat: WeworkBeat; answer: WeworkOptionId | null };

export const WEWORK_START: WeworkState = { beat: 1, answer: null };

/** What a bar says: a claim not yet earned, revenue recorded, or a loss. One kind, one colour in the widget. */
export type WeworkBarKind = "claim" | "recorded" | "loss";

type Row = { id: "runRate" | "recorded" | "netLoss"; label: string; kind: WeworkBarKind; amountBn: number; note: string; appearsAtBeat: WeworkBeat };

/** The three rows in $ billions (§6.6.1). Each names its own time base: a full-year pace and six-month totals share the axis. */
const ROWS: readonly Row[] = [
  { id: "runRate", label: "Run rate claimed", kind: "claim", amountBn: 3.0, note: "A full year, if the latest month repeated 12 times", appearsAtBeat: 2 },
  { id: "recorded", label: "Revenue recorded", kind: "recorded", amountBn: 1.54, note: "Six months, January to June 2019", appearsAtBeat: 3 },
  { id: "netLoss", label: "Net loss", kind: "loss", amountBn: -0.905, note: "The same six months", appearsAtBeat: 4 },
];

/** The right end of the shared bar scale, in $ billions. */
const SCALE_MAX_BN = 3.2;

/** A true minus sign (U+2212), as every Signal readout uses. */
const MINUS = "−";

/** Billions of dollars as the bars show them: up to 3 decimals, trailing zeros removed but one kept ("$3.0bn", "$1.54bn", "−$0.905bn"). */
function usdBn(bn: number): string {
  let digits = Math.abs(bn).toFixed(3).replace(/0+$/, "");
  if (digits.endsWith(".")) digits += "0";
  return `${bn < 0 ? MINUS : ""}$${digits}bn`;
}

export type WeworkBar = {
  id: Row["id"];
  label: string;
  kind: WeworkBarKind;
  note: string;
  /** False until the row's beat: the widget then shows it faded, with "?" and a zero-width bar. */
  shown: boolean;
  valueText: string;
  /** Bar width as a percent of the shared scale ($3.2bn); the loss uses its size. */
  widthPercent: number;
};

/** The beat card: one beat at a time (§6.6.2). */
export type WeworkCard = { number: WeworkBeat; speaker: string; text: string };

export type WeworkView = {
  card: WeworkCard;
  bars: WeworkBar[];
  /** "Next beat", which becomes a disabled "End of the story" on beat 5. */
  next: { label: "Next beat" | "End of the story"; disabled: boolean };
  /** Five progress dots; true once that beat is reached. */
  dots: boolean[];
  /** The call, on beat 5 only. */
  call: WeworkCall | null;
  /** Go deeper, open from the first tap on the call. */
  goDeeper: WeworkGoDeeper | null;
};

export type WeworkCall = {
  question: string;
  options: { id: WeworkOptionId; label: string }[];
  answer: { optionId: WeworkOptionId; verdict: "right" | "wrong"; feedback: string } | null;
};

export type WeworkGoDeeper = {
  title: string;
  sentence: string;
  /** Two bars on one scale: revenue recorded at 100%, the loss on it at its share of that revenue. */
  bars: { label: string; kind: WeworkBarKind; valueText: string; widthPercent: number }[];
};

const OPTIONS: readonly { id: WeworkOptionId; label: string; verdict: "right" | "wrong"; feedback: string }[] = [
  {
    id: "revenue",
    label: "Yes, it is revenue",
    verdict: "wrong",
    feedback: "Recorded revenue for the half-year was $1.54bn. The $3bn is the latest month multiplied by 12.",
  },
  {
    id: "pace",
    label: "No, it is a pace",
    verdict: "right",
    feedback: "It is the latest month’s revenue times 12. That is a pace, and it is only as good as the guess that the pace repeats.",
  },
];

/** Rounds without float noise and never gives -0. */
const round = (value: number, decimals: number) => Math.round(Number(`${value.toFixed(10)}e${decimals}`)) / 10 ** decimals || 0;

export type PerDollar = {
  /** The net result per $1 of revenue, to the cent; a loss is negative. */
  lossPerDollar: number;
  /** The same in whole cents, as the sentence says it ("about 59 cents"). */
  cents: number;
  /** The loss bar's width as a percent of the revenue bar, to one decimal. */
  lossWidthPercent: number;
};

/** The loss per dollar of revenue over the same period: WeWork's −$0.905bn on $1.54bn is −$0.59, 59 cents, 58.8%. */
export function perDollarOfRevenue(revenueBn: number, netResultBn: number): PerDollar {
  const share = netResultBn / revenueBn;
  return { lossPerDollar: round(share, 2), cents: round(Math.abs(share) * 100, 0), lossWidthPercent: round(Math.abs(share) * 100, 1) };
}

const CENTS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Dollars and cents with a true minus sign: "$1.00", "−$0.59". */
const usdCents = (value: number) => `${value < 0 ? MINUS : ""}$${CENTS.format(Math.abs(value))}`;

function goDeeper(): WeworkGoDeeper {
  const amount = (id: Row["id"]) => ROWS.find((row) => row.id === id)!.amountBn;
  const perDollar = perDollarOfRevenue(amount("recorded"), amount("netLoss"));
  return {
    title: "Put the loss next to the revenue.",
    sentence: `For every $1 of revenue it recorded in those six months, WeWork lost about ${perDollar.cents} cents.`,
    bars: [
      { label: "Revenue recorded", kind: "recorded", valueText: usdCents(1), widthPercent: 100 },
      { label: "Net loss on it", kind: "loss", valueText: usdCents(perDollar.lossPerDollar), widthPercent: perDollar.lossWidthPercent },
    ],
  };
}

function call(answer: WeworkOptionId | null): WeworkCall {
  const chosen = OPTIONS.find((o) => o.id === answer);
  return {
    question: "Is $3 billion of run-rate revenue $3 billion earned?",
    options: OPTIONS.map(({ id, label }) => ({ id, label })),
    answer: chosen ? { optionId: chosen.id, verdict: chosen.verdict, feedback: chosen.feedback } : null,
  };
}

const LAST_BEAT: WeworkBeat = 5;

const BEATS: readonly Omit<WeworkCard, "number">[] = [
  { speaker: "Narrator", text: "14 August 2019. WeWork publishes its plan to sell shares to the public." },
  { speaker: "WeWork", text: "Over seven years to $1 billion run-rate, then six months from $2 billion to $3 billion!" },
  { speaker: "Asha · weighs the share sale", text: "Nice. But the revenue actually recorded this half-year is $1.54 billion." },
  { speaker: "Asha", text: "And the net loss? About $905 million." },
  { speaker: "Narrator", text: "Asha must decide what a run rate tells her about earned revenue." },
];

/** An incoming beat (from the Tutor's widget state) as a whole number from 1 to 5; anything that is not a finite number is beat 1. */
export function clampBeat(value: unknown): WeworkBeat {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(LAST_BEAT, Math.max(1, Math.round(value))) as WeworkBeat;
}

/** "Next beat": one beat on, never past beat 5. */
export function nextBeat(state: WeworkState): WeworkState {
  return { ...state, beat: clampBeat(state.beat + 1) };
}

/** A tap on the call. It counts only on beat 5, and the first call stands: a later tap changes nothing. */
export function answerCall(state: WeworkState, optionId: WeworkOptionId): WeworkState {
  if (state.beat !== LAST_BEAT || state.answer !== null) return state;
  return { ...state, answer: optionId };
}

/** "Start again": back to beat 1, with the call reset. */
export function startAgain(): WeworkState {
  return WEWORK_START;
}

function bar(row: Row, beat: WeworkBeat): WeworkBar {
  const shown = beat >= row.appearsAtBeat;
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    note: row.note,
    shown,
    valueText: shown ? usdBn(row.amountBn) : "?",
    widthPercent: shown ? (Math.abs(row.amountBn) / SCALE_MAX_BN) * 100 : 0,
  };
}

/** Everything the widget shows for one state. */
export function weworkView(state: WeworkState): WeworkView {
  const { beat } = state;
  const last = beat === LAST_BEAT;
  return {
    card: { number: beat, ...BEATS[beat - 1] },
    bars: ROWS.map((row) => bar(row, beat)),
    next: last ? { label: "End of the story", disabled: true } : { label: "Next beat", disabled: false },
    dots: BEATS.map((_, i) => i + 1 <= beat),
    call: last ? call(state.answer) : null,
    goDeeper: last && state.answer !== null ? goDeeper() : null,
  };
}
