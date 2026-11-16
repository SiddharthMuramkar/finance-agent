import { FORECAST_YEARS } from "@/finance/dcf-engine";
import { applyLevers, type ValuationBlock } from "@/finance/valuation-case";
import {
  benchShape,
  ceilTo,
  clean,
  floorTo,
  percentLever,
  percentText,
  type BenchHeadline,
  type BenchLever,
  type BenchNumber,
  type BenchReading,
  type BenchShape,
} from "./bench";
import { moneyText, valueText } from "./value-levers-model";

// Terminal seesaw (spec 2026-11-12, B4; Spine Topic 8), as pure functions over one Case's valuation block: growth after year
// 10 and the cost of capital after year 10 set the terminal value, and the seesaw weighs years 1 to 10 against everything
// after, in today's money. The headline is the share of the whole that sits after year 10, or, when years 1 to 10 lose
// value (Damodaran's Amazon: 112%, more than all of it), what after year 10 is worth and what years 1 to 10 lose. Growth can never reach the cost of capital on these sliders; if a setting ever did, the engine's
// sentence is shown, not a number.

export const SEESAW_LEVER_IDS = ["growthAfter", "costAfter"] as const;
export type SeesawLeverId = (typeof SEESAW_LEVER_IDS)[number];
export type SeesawSettings = Record<SeesawLeverId, number>;

export type TerminalSeesawData = { block: ValuationBlock };

const STEP = 0.25;

/** The Case's growth and cost of capital after year 10, in percent. */
function caseRates(block: ValuationBlock) {
  return { growth: block.growthAfterPercent, cost: block.costOfCapitalPercent[FORECAST_YEARS - 1] };
}

/**
 * The two ranges, split at the midpoint of the Case's growth and cost after year 10 so the top of growth stays below the
 * bottom of the cost of capital: growth up to a point above the Case's (or the midpoint, if nearer), the cost of capital from
 * the next step up, so no setting puts growth at or above the cost of capital. Amazon: growth 0% to 7%, cost of capital 8%
 * to 14%, in steps of 0.25, opening at 6% and 9.61%.
 */
function ranges(block: ValuationBlock) {
  const { growth, cost } = caseRates(block);
  const middle = (growth + cost) / 2;
  const growthMax = Math.max(growth, floorTo(Math.min(growth + 1, middle), STEP));
  const costMin = Math.min(cost, Math.max(ceilTo(middle, STEP), clean(growthMax + STEP)));
  return { growthMin: Math.min(0, Math.floor(growth) - 1), growthMax, costMin, costMax: Math.ceil(cost) + 4 };
}

/** The low growth the first Thing to try names: half the Case's, rounded to a whole percent, inside the range. */
function lowGrowth(block: ValuationBlock): number {
  const { growthMin } = ranges(block);
  return Math.max(growthMin, Math.round(caseRates(block).growth / 2));
}

/** The nearest growth can come to the cost of capital, rounded up to half a point, at least one point. */
function closestGap(block: ValuationBlock): number {
  const { growthMax, costMin } = ranges(block);
  return Math.max(1, ceilTo(costMin - growthMax, 0.5));
}

export function terminalSeesawLevers(data: TerminalSeesawData): BenchLever<SeesawLeverId>[] {
  const { block } = data;
  const { growth, cost } = caseRates(block);
  const r = ranges(block);
  return [
    percentLever({ id: "growthAfter", label: "Growth after year 10", min: r.growthMin, max: r.growthMax, step: STEP, opening: growth, chips: [lowGrowth(block)] }),
    percentLever({ id: "costAfter", label: "Cost of capital after year 10", min: r.costMin, max: r.costMax, step: STEP, opening: cost }),
  ];
}

/** The Things to try, with the values the Widget can reach (B7). */
export function terminalSeesawTasks(data: TerminalSeesawData): string[] {
  const gap = closestGap(data.block);
  return [`Set growth after year 10 to ${lowGrowth(data.block)}%. How much value goes?`, `Bring growth within ${gap} ${gap === 1 ? "point" : "points"} of the cost of capital`];
}

export const SEESAW_CAPTION = "Years 1 to 10 against everything after, in today's money";
export const TERMINAL_LABEL = "Terminal value at year 10";
export const SHARE_VALUE_LABEL = "Value a share";

/** One side of the seesaw: years 1 to 10, or everything after, in today's money. */
export type SeesawSide = { label: string; value: number; text: string };

export type TerminalSeesawModel = {
  /** The share of the business's value from after year 10, as a fraction (1.12 is 112%); null when it cannot be valued. */
  share: number | null;
  headline: BenchHeadline;
  numbers: BenchNumber[];
  /** Years 1 to 10 and everything after, in today's money. */
  sides: [SeesawSide, SeesawSide] | null;
  /** The beam's tilt, from -1 (all the value in years 1 to 10) to 1 (all of it, or more, after year 10). */
  tilt: number;
  conditions: boolean[];
  error?: string;
};

/** Everything Terminal seesaw shows for these settings, from the one valuation engine. */
export function terminalSeesawModel(data: TerminalSeesawData, settings: SeesawSettings): TerminalSeesawModel {
  const { block } = data;
  const conditions = [Math.abs(settings.growthAfter - lowGrowth(block)) <= STEP / 2, settings.costAfter - settings.growthAfter <= closestGap(block) + 1e-9];
  const result = applyLevers(block, { growthAfter: settings.growthAfter, costOfCapitalAfter: settings.costAfter });
  if (!result.ok) {
    return { share: null, headline: { before: "These settings cannot be valued: ", key: "", after: result.error }, numbers: [], sides: null, tilt: 0, conditions, error: result.error };
  }
  const share = result.terminalShare;
  const money = (v: number) => moneyText(v, block);
  const perShare = result.valuePerShare <= 0 ? `${moneyText(0, block)}, nothing left` : valueText(result.valuePerShare, block);
  return {
    share,
    // Spine critics round 1 on #95: a share above 100% puzzles a beginner (a part bigger than the whole), so when years 1 to
    // 10 lose value the headline says it in money and words; the share stays in what the Tutor reads.
    headline:
      result.sumPv < 0
        ? { before: "After year 10: ", key: money(result.pvTerminal), after: `, more than all; years 1 to 10 lose ${money(-result.sumPv)}` }
        : { before: "After year 10 holds ", key: percentText(share * 100, 0), after: " of the value" },
    numbers: [
      { label: TERMINAL_LABEL, text: money(result.terminalValue) },
      { label: block.per === "company" ? "Value for the owners" : SHARE_VALUE_LABEL, text: perShare },
    ],
    sides: [
      { label: result.sumPv < 0 ? "Years 1 to 10, a loss" : "Years 1 to 10", value: result.sumPv, text: money(result.sumPv) },
      { label: "After year 10", value: result.pvTerminal, text: money(result.pvTerminal) },
    ],
    // Level at half the value after year 10; tipping right as more of it sits there, nearly flat out past 100%.
    tilt: Math.tanh((share - 0.5) * 2),
    conditions,
  };
}

export function terminalSeesawShape(data: TerminalSeesawData): BenchShape {
  const levers = terminalSeesawLevers(data);
  const model = terminalSeesawModel(data, { growthAfter: levers[0].opening, costAfter: levers[1].opening });
  const prose = [`${model.headline.before}${model.headline.key}${model.headline.after}`, ...model.numbers.map((n) => n.label), SEESAW_CAPTION];
  return benchShape(levers, 1 + model.numbers.length, prose, terminalSeesawTasks(data).length);
}

export function terminalSeesawReading(data: TerminalSeesawData, settings: SeesawSettings): BenchReading {
  const levers = terminalSeesawLevers(data);
  const model = terminalSeesawModel(data, settings);
  const readouts =
    model.share === null
      ? [`Cannot be valued: ${model.error}`]
      : [`Share of the value from after year 10: ${percentText(model.share * 100, 0)}`, ...model.numbers.map((n) => `${n.label}: ${n.text}`), ...model.sides!.map((s) => `${s.label}, in today's money: ${s.text}`)];
  return { sliders: levers.map((l) => ({ label: l.label, text: l.reading(settings[l.id]) })), readouts };
}
