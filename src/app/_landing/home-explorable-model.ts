import type { CaseData } from "@/case-data/case-data";
import type { HomeAnnuity } from "@/course/home-annuity";
import { annuityBreakEven, annuityPaymentCount, annuitySchedule } from "@/finance/present-value";
import { niceTicks } from "@/widgets/plot/scales";

export type { HomeAnnuity };

// The numbers behind Home's Explorable (the owner's design E, 11 Nov 2026; spec 2026-11-12 E3): what Present value's
// annuity is worth at the visitor's rate, by the tested present value formula, how that sits against the sourced cash
// option, where the two match, and how the rate slider moves. Pure and safe in the browser: the annuity is read from the
// Topic file on the server (src/course/home-annuity.ts).

/** Which side of the cash the annuity is on: worth more (gain), less (loss), or about the same (even). */
export type Side = "gain" | "loss" | "even";

/** Within this many dollars, the annuity and the cash count as worth the same (as the Widget's verdict line does). */
export const EVEN_WITHIN = 50_000;

export function sideOf(gap: number): Side {
  if (Math.abs(gap) < EVEN_WITHIN) return "even";
  return gap > 0 ? "gain" : "loss";
}

/** Each payment's year (0 is now) and worth today at `ratePercent`, and their sum: the annuity's worth today. */
export function worthAt(annuity: HomeAnnuity, ratePercent: number) {
  const { rows, presentValue } = annuitySchedule({ ...scheduleOf(annuity), ratePercent });
  return { rows, worth: presentValue };
}

const scheduleOf = (annuity: HomeAnnuity) => ({ total: annuity.total, payments: annuityPaymentCount(annuity.payments), growthPercent: annuity.growthPercent });

/**
 * The top of the bars' value axis, fixed from the first paint (spec E3): the tallest bar at the slider's lowest rate, in
 * round numbers ($95.2M drawn to $100M). It never changes with the rate, so the bars visibly shrink and grow under it.
 */
export function axisMax(annuity: HomeAnnuity): number {
  const tallest = Math.max(...worthAt(annuity, annuity.rate.min).rows.map((r) => r.presentValue));
  return niceTicks(0, tallest, 2).at(-1)!;
}

/**
 * Where the payments stand against the cash (spec E3): within 1% of the cash they match; below the match rate the
 * payments are worth more, above it the cash is.
 */
export type Standing = "payments" | "match" | "cash";

/** Within this share of the cash option, the payments and the cash count as a match ("within 1% of the cash option"). */
export const MATCH_WITHIN = 0.01;

export function standingOf(worth: number, cash: number): Standing {
  if (Math.abs(worth - cash) <= MATCH_WITHIN * cash) return "match";
  return worth > cash ? "payments" : "cash";
}

/** The rate, in percent, at which the 30 payments are worth exactly the cash (Appendix B.4: about 3.38%). */
export function matchRate(annuity: HomeAnnuity, cash: number): number | null {
  return annuityBreakEven(scheduleOf(annuity), cash);
}

/**
 * The rates at which the payments are within 1% of the cash: from where they are worth 1% more than the cash to where
 * they are worth 1% less (the worth falls as the rate rises). Null when the cash is out of the payments' reach.
 */
export function matchWindow(annuity: HomeAnnuity, cash: number): { low: number; high: number } | null {
  const low = annuityBreakEven(scheduleOf(annuity), cash * (1 + MATCH_WITHIN));
  const high = annuityBreakEven(scheduleOf(annuity), cash * (1 - MATCH_WITHIN));
  return low === null || high === null ? null : { low, high };
}

/** How the rate slider moves (spec B5): drags in steps of 0.05, arrow keys in 0.01 (0.1 with Shift), Page keys a whole point. */
export const DRAG_STEP = 0.05;
/** B5: "Dragging moves in steps at least two pixels wide." */
export const MIN_STEP_PX = 2;

/**
 * The drag step for a track `trackPx` wide: 0.05 (E3), or the smallest multiple of it whose steps are still two pixels
 * wide (B5) on a narrow track, so 0.1 on a phone's 326 px track. With no width (not yet laid out), 0.05.
 */
export function dragStep(annuity: HomeAnnuity, trackPx: number): number {
  if (!(trackPx > 0)) return DRAG_STEP;
  const fewest = ((annuity.rate.max - annuity.rate.min) * MIN_STEP_PX) / trackPx;
  return round2(Math.max(1, Math.ceil(fewest / DRAG_STEP - 1e-9)) * DRAG_STEP);
}
export const KEY_STEPS = { arrow: 0.01, shift: 0.1, page: 1 } as const;
/** The rates a visitor can set with one tap (spec E3: chips for 0%, 5% and 10%). */
export const RATE_CHIPS = [0, 5, 10] as const;

const round2 = (v: number) => Math.round(v * 100) / 100;

/** A rate inside the slider's range, rounded to hundredths (so 0.1 + 0.2 reads 0.3). */
export function clampRate(annuity: HomeAnnuity, value: number): number {
  return round2(Math.min(annuity.rate.max, Math.max(annuity.rate.min, value)));
}

/**
 * Where a drag leaves the rate: on the nearest `step` (0.05, or 0.1 on a narrow track: see dragStep), except
 * that a drag landing within 1% of the cash rests on the match rate, to the hundredth (3.38%), so the visitor can stop
 * there by mouse or touch (spec E3: "the slider rests there").
 */
export function dragRate(annuity: HomeAnnuity, value: number, cash: number | null, step: number = DRAG_STEP): number {
  const stepped = clampRate(annuity, annuity.rate.min + Math.round((value - annuity.rate.min) / step) * step);
  if (cash === null) return stepped;
  const match = matchRate(annuity, cash);
  if (match === null || standingOf(worthAt(annuity, stepped).worth, cash) !== "match") return stepped;
  return clampRate(annuity, match);
}

/** The visitor's guess before their first move (spec E3): kept and shown beside the match line, never marked. */
export type Guess = "payments" | "cash" | "same";
export const GUESSES: readonly Guess[] = ["payments", "cash", "same"];

/** $694.0M; $1.537B from a billion up (rounded first, so 999.96 million reads $1.000B). */
export function shortMoney(value: number): string {
  const abs = Math.abs(value);
  return abs >= 999_950_000 ? `$${(abs / 1e9).toFixed(3)}B` : `$${(abs / 1e6).toFixed(1)}M`;
}

/** The gap to the cash with its sign: +$212.4M, −$183.8M (a true minus), $0.0M when it rounds to nothing. */
export function signedMoney(gap: number): string {
  const text = shortMoney(gap);
  if (text === "$0.0M") return text;
  return `${gap > 0 ? "+" : "−"}${text}`;
}

/** The sourced figure the annuity is set against: the latest point of a dollar dataset in the Case Data sent with Home. */
export type CashFigure = { label: string; value: number; date: string; source: string; sourceUrl: string };

export function cashFigure(cases: readonly CaseData[], reference: string): CashFigure | null {
  const [caseId, datasetId] = reference.split("/");
  const dataset = cases.find((c) => c.caseId === caseId)?.datasets.find((d) => d.id === datasetId);
  const point = dataset?.points.at(-1);
  if (!dataset || !point || dataset.unit !== "USD") return null;
  return { label: dataset.label, value: point.value, date: point.date, source: dataset.source, sourceUrl: dataset.sourceUrl };
}
