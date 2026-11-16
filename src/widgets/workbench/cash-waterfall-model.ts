import { cashYear } from "@/finance/cash-year";
import { CURRENCY_STYLE } from "@/finance/money";
import { toEngineInputs, type ValuationBlock } from "@/finance/valuation-case";
import {
  benchShape,
  ceilTo,
  clean,
  floorTo,
  niceUp,
  oneFigure,
  percentLever,
  type BenchHeadline,
  type BenchLever,
  type BenchNumber,
  type BenchReading,
  type BenchShape,
} from "./bench";
import { moneyText, type Money } from "./value-levers-model";

// Cash waterfall (spec 2026-11-12, B4; Spine Topic 3), as pure functions: one year of a business, revenue stepping down to
// free cash flow, worked out by the valuation engine's own year (cashYear). The Learner sets next year's revenue growth, its
// operating margin and the sales each dollar invested brings; the lesson is that growth uses cash before it shows as profit.
// The figures come from a Valuation Case (its base year and year 1) or from the company the Topic file names, with a source.

export const WATERFALL_LEVER_IDS = ["growth", "margin", "salesToCapital"] as const;
export type WaterfallLeverId = (typeof WATERFALL_LEVER_IDS)[number];
export type WaterfallSettings = Record<WaterfallLeverId, number>;

export type CashWaterfallData = {
  money: Money;
  /** This year's revenue, which next year's growth starts from. */
  lastRevenue: number;
  taxPercent: number;
  lossesCarried: number;
  /** Where the three levers open. */
  opening: WaterfallSettings;
  /** The company's name, for the caption and the scene (a company from the Topic file). */
  name?: string;
  /** The years the bench joins, as the Story names them: the revenue's year and the year shown (a beginner's bench). */
  years?: { from: string; to: string };
  /** One line, in words, saying what the bench makes up. */
  whatIf?: string;
  /** The company's Icon: the bench then shows a small scene that reacts to the levers. */
  icon?: string;
};

/** A Valuation Case's base year and year 1: Damodaran's Amazon opens at $1,117m growing 150%, a -13.36% margin and $3 of sales a dollar. */
export function cashWaterfallFromCase(block: ValuationBlock): CashWaterfallData {
  const engine = toEngineInputs(block);
  return {
    money: block,
    lastRevenue: block.baseRevenue,
    // Year 1's own figures, where the Case changes its tax rate or sales to capital by year (Uber, Tesla).
    taxPercent: block.taxPercentByYear?.[0] ?? block.taxPercent,
    lossesCarried: block.lossesCarried,
    opening: { growth: block.growthPercent[0], margin: engine.margin[0] * 100, salesToCapital: block.salesToCapitalByYear?.[0] ?? block.salesToCapital },
  };
}

/**
 * The levers, from the opening figures: growth from 0% (or below, for a shrinking business) to a round number at least
 * twice the opening's and 50%, in about 60 steps; the margin from 15 points below the opening (at least -20%) to 25 above
 * (at least 25%), by 0.5; sales for each dollar invested from 0.25 to 5 (or five thirds of the opening), by 0.25. Growth
 * also stops at 0%, the value the first Thing to try names.
 */
export function cashWaterfallLevers(data: CashWaterfallData): BenchLever<WaterfallLeverId>[] {
  const { growth, margin, salesToCapital } = data.opening;
  const growthMax = niceUp(Math.max(growth * 2, 50));
  const { symbol, word: [one, many] } = CURRENCY_STYLE[data.money.currency];
  const years = data.years;
  const growthLever = percentLever({
    id: "growth",
    label: years ? `Sales growth, ${years.from} to ${years.to}` : "Revenue growth next year",
    min: Math.min(0, floorTo(growth, 10)),
    max: growthMax,
    step: oneFigure(growthMax / 60),
    opening: growth,
    chips: [0],
    caption: years ? `${years.from} sales: ${moneyText(data.lastRevenue, data.money)}` : `This year: ${moneyText(data.lastRevenue, data.money)}`,
  });
  return [
    // A beginner reads 1241.3% as noise; "13.4 times" the year before is the same growth said plainly.
    years ? { ...growthLever, reading: timesText, spoken: (v: number) => (Math.abs(v) < 1e-9 ? "no growth" : `sales ${timesText(v)} the year before`) } : growthLever,
    percentLever({ id: "margin", label: "Operating margin", min: floorTo(Math.min(margin - 15, -20), 5), max: ceilTo(Math.max(margin + 25, 25), 5), step: 0.5, opening: margin }),
    {
      ...percentLever({ id: "salesToCapital", label: "Sales for each dollar invested", min: 0.25, max: Math.max(5, ceilTo((salesToCapital * 5) / 3, 0.25)), step: 0.25, opening: salesToCapital, more: !!years }),
      label: `Sales for each ${one} invested`,
      reading: (v) => `${symbol}${v.toFixed(2)}`,
      spoken: (v) => `${clean(v)} ${v === 1 ? one : many}`,
    },
  ];
}

/** Growth said as a multiple of the year before: 1241.3% is "13.4 times", 0% "No growth". */
function timesText(growth: number): string {
  if (Math.abs(growth) < 1e-9) return "No growth";
  return `${clean(Math.round((1 + growth / 100) * 10) / 10)} times`;
}

/** The Things to try: growth at 0%, which every range reaches, and a free cash flow above zero, which margin alone reaches. */
export function cashWaterfallTasks(): string[] {
  return ["Set growth to 0%. What happens to reinvestment?", "Find settings where free cash flow is above zero"];
}

export const WATERFALL_CAPTION = "Next year, from revenue to free cash flow";

/** The figure's caption: "Webvan 2000, from sales to free cash flow" on a bench with named years, else the next year's. */
export function cashWaterfallCaption(data: CashWaterfallData): string {
  return data.years ? `${data.name ?? ""} ${data.years.to}, from sales to free cash flow`.trim() : WATERFALL_CAPTION;
}

/** The bench's small scene (a company with an Icon): its line reacts to the levers, and the buildings grow with growth. */
export type WaterfallScene = { icon: string; name: string; mood: "building" | "still" | "cash"; line: string; buildings: number };

export function cashWaterfallScene(data: CashWaterfallData, settings: WaterfallSettings): WaterfallScene | null {
  if (!data.icon) return null;
  const name = data.name ?? "The company";
  const model = cashWaterfallModel(data, settings);
  const growthMax = cashWaterfallLevers(data)[0].max;
  const buildings = settings.growth <= 0 ? 0 : Math.max(1, Math.min(5, Math.ceil((settings.growth / growthMax) * 5)));
  if (Math.abs(settings.growth) < 1e-9) return { icon: data.icon, name, mood: "still", buildings, line: `No growth, so ${name} has nothing new to build or stock.` };
  if (model.fcf !== null && model.fcf > 0) return { icon: data.icon, name, mood: "cash", buildings, line: `Cash comes back: ${name} makes more than its growth costs.` };
  return { icon: data.icon, name, mood: "building", buildings, line: `More sales need warehouses, vans and stock first, so the cash goes out.` };
}
export const OPERATING_LABEL = "Operating income";
export const REINVESTMENT_LABEL = "Reinvestment";

/** One step of the waterfall: a bar from `from` to `to`, in the data's unit. */
export type WaterfallStep = { id: "revenue" | "costs" | "operating" | "tax" | "reinvestment" | "fcf"; label: string; from: number; to: number; text: string; total: boolean };

export type CashWaterfallModel = {
  fcf: number | null;
  headline: BenchHeadline;
  numbers: BenchNumber[];
  steps: WaterfallStep[];
  conditions: boolean[];
  error?: string;
};

/** Everything the Cash waterfall shows for these settings, from the engine's year. */
export function cashWaterfallModel(data: CashWaterfallData, settings: WaterfallSettings): CashWaterfallModel {
  const conditions = [Math.abs(settings.growth) < 1e-9];
  const year = cashYear({ lastRevenue: data.lastRevenue, growthPercent: settings.growth, marginPercent: settings.margin, taxPercent: data.taxPercent, salesToCapital: settings.salesToCapital, lossesCarried: data.lossesCarried });
  if (!year.ok) return { fcf: null, headline: { before: "No year to show: ", key: "", after: year.error }, numbers: [], steps: [], conditions: [...conditions, false], error: year.error };
  const money = (v: number) => moneyText(v, data.money);
  const steps: WaterfallStep[] = [
    { id: "revenue", label: "Revenue", from: 0, to: year.revenue, text: money(year.revenue), total: true },
    { id: "costs", label: "Less running costs", from: year.revenue, to: year.operatingIncome, text: money(-year.operatingCosts), total: false },
    { id: "operating", label: OPERATING_LABEL, from: 0, to: year.operatingIncome, text: money(year.operatingIncome), total: true },
    { id: "tax", label: "Less tax", from: year.operatingIncome, to: year.operatingIncome - year.tax, text: money(-year.tax), total: false },
    { id: "reinvestment", label: "Less what growth costs", from: year.operatingIncome - year.tax, to: year.fcf, text: money(-year.reinvestment), total: false },
    { id: "fcf", label: "Free cash flow", from: 0, to: year.fcf, text: money(year.fcf), total: true },
  ];
  return {
    fcf: year.fcf,
    headline: { before: data.years ? `Free cash flow in ${data.years.to}: ` : "Free cash flow next year: ", key: money(year.fcf), after: "" },
    numbers: [
      { label: OPERATING_LABEL, text: money(year.operatingIncome) },
      { label: REINVESTMENT_LABEL, text: money(year.reinvestment) },
    ],
    steps,
    conditions: [...conditions, year.fcf > 0],
  };
}

export function cashWaterfallShape(data: CashWaterfallData): BenchShape {
  const levers = cashWaterfallLevers(data);
  const model = cashWaterfallModel(data, data.opening);
  const prose = [`${model.headline.before}${model.headline.key}${model.headline.after}`, ...model.numbers.map((n) => n.label), cashWaterfallCaption(data), ...levers.flatMap((l) => (l.caption ? [l.caption] : [])), data.whatIf ?? ""];
  return benchShape(levers, 1 + model.numbers.length, prose, cashWaterfallTasks().length);
}

export function cashWaterfallReading(data: CashWaterfallData, settings: WaterfallSettings): BenchReading {
  const levers = cashWaterfallLevers(data);
  const model = cashWaterfallModel(data, settings);
  const readouts = model.fcf === null ? [`No year to show: ${model.error}`] : model.steps.map((s) => `${s.label}: ${s.text}`);
  return { sliders: levers.map((l) => ({ label: l.label, text: l.reading(settings[l.id]) })), readouts };
}
