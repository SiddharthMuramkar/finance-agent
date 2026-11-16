import { applyLevers, valueCase, type ValuationBlock } from "@/finance/valuation-case";
import {
  benchShape,
  near,
  niceUp,
  oneFigure,
  stopsOf,
  type BenchHeadline,
  type BenchLever,
  type BenchNumber,
  type BenchReading,
  type BenchShape,
} from "./bench";
import { moneySpoken, moneyText, valueText } from "./value-levers-model";

// Value bridge (spec 2026-11-12, B4; Spine Topic 9), as pure functions over one Case's valuation block: the business value
// the one valuation engine gives the Case's story, stepping down through cash, debt and leases, and options to what is left
// for shareholders and one share. The Learner moves the three claims; the business does not move, which is the lesson:
// lenders, landlords and option holders are paid before shareholders.

export const BRIDGE_LEVER_IDS = ["cash", "debt", "options"] as const;
export type BridgeLeverId = (typeof BRIDGE_LEVER_IDS)[number];
export type BridgeSettings = Record<BridgeLeverId, number>;

/** Leases the Topic counts as debt (spec C4: WeWork's lease obligations), in the block's unit, with what they are. */
export type BridgeLeases = { amount: number; label: string };

/** A report's lines beside the bridge (#93), amounts in the block's unit; a line with a lever can be put into that lever. */
export type BridgeReportLine = { line: string; amount: number; lever?: "cash" | "debt" };
export type BridgeReport = { title: string; lines: BridgeReportLine[] };

export type ValueBridgeData = { block: ValuationBlock; leases?: BridgeLeases; report?: BridgeReport };

/** The report's figure for a lever, if it gives one. */
export const reportFigure = (data: ValueBridgeData, lever: BridgeLeverId): number | undefined => data.report?.lines.find((l) => l.lever === lever)?.amount;

/** The report's levers, in the order its Thing to try names them: debt, then cash. */
const reportLevers = (data: ValueBridgeData): ("debt" | "cash")[] => (["debt", "cash"] as const).filter((id) => reportFigure(data, id) !== undefined);

/** The business value the engine gives the Case's own story, before cash, debt and options; null when it cannot be valued. */
export function bridgeBusinessValue(block: ValuationBlock): number | null {
  const valued = valueCase(block);
  return valued.ok ? valued.businessValue : null;
}

/** The Things to try (B7: each can be reached on any Case, since debt and leases go up to the business value and options down to nothing). */
export function valueBridgeTasks(data: ValueBridgeData): string[] {
  const raise = data.leases ? "Raise debt and leases until shareholders get nothing" : "Raise debt until shareholders get nothing";
  // With a report beside it (#93), its figures come first and the options wait under More settings.
  const fromReport = reportLevers(data);
  if (fromReport.length) return [`Put in the report's ${fromReport.join(" and ")}. Watch one share.`, raise];
  return [raise, `Set the options to ${moneyText(0, data.block)}. What does a share gain?`];
}

/**
 * The three levers, each from nothing to the round number at or above the business value (15,157 is $20bn for Amazon), in
 * a hundredth of that rounded to one figure ($0.2bn); each opens at the Case's figure (debt with any leases added), which is
 * a stop, and options also stop at nothing, the value its Thing to try names.
 */
export function valueBridgeLevers(data: ValueBridgeData): BenchLever<BridgeLeverId>[] {
  const { block, leases } = data;
  const business = bridgeBusinessValue(block) ?? 0;
  const debtOpening = block.debt + (leases?.amount ?? 0);
  const top = niceUp(Math.max(business, block.cash, debtOpening, block.options, 1));
  const step = oneFigure(top / 100);
  const lever = (id: BridgeLeverId, label: string, opening: number, chips: number[] = [], caption?: string, more = false): BenchLever<BridgeLeverId> => {
    const range = { min: 0, max: top };
    return {
      id,
      label,
      ...range,
      step,
      opening,
      chips: stopsOf(range, chips),
      stops: stopsOf(range, [opening, ...chips]),
      more,
      reading: (v) => moneyText(v, block),
      spoken: (v) => moneySpoken(v, block),
      ...(caption ? { caption } : {}),
      ...(reportFigure(data, id) !== undefined ? { marks: [{ value: reportFigure(data, id)!, label: "In the report" }] } : {}),
    };
  };
  const at = (id: BridgeLeverId) => {
    const figure = reportFigure(data, id);
    return figure === undefined ? [] : [figure];
  };
  return [
    lever("cash", "Cash", block.cash, at("cash")),
    lever("debt", leases ? "Debt and leases" : "Debt", debtOpening, at("debt"), leases ? `Includes ${leases.label}: ${moneyText(leases.amount, block)}` : undefined),
    lever("options", "Options", block.options, data.report ? [] : [0], undefined, Boolean(data.report)),
  ];
}

/** One step of the bridge: the business, a claim added or taken off, or what is left. */
export type BridgeStep = { id: "business" | BridgeLeverId | "shareholders"; label: string; value: number; text: string; kind: "start" | "add" | "take" | "total" };

export const BRIDGE_CAPTION = "From the business to one share";
export const BUSINESS_LABEL = "Business value";
export const SHAREHOLDERS_LABEL = "Left for shareholders";

export type ValueBridgeModel = {
  /** Value a share (or the owners' whole value, per: company); null when the Case cannot be valued. */
  value: number | null;
  nothingLeft: boolean;
  headline: BenchHeadline;
  numbers: BenchNumber[];
  steps: BridgeStep[];
  /** Whether each Thing to try holds now. */
  conditions: boolean[];
  error?: string;
};

/** Who takes everything when nothing is left: the claims that are there, in words. */
function takers(settings: BridgeSettings, leases: BridgeLeases | undefined): string {
  const who = ["lenders", ...(leases ? ["landlords"] : []), ...(settings.options > 0 ? ["option holders"] : [])];
  const list = who.length > 1 ? `${who.slice(0, -1).join(", ")} and ${who[who.length - 1]}` : who[0];
  return `${list} take everything`;
}

/** Everything Value bridge shows for these settings, from the one valuation engine (applyLevers with cash, debt and options). */
export function valueBridgeModel(data: ValueBridgeData, settings: BridgeSettings): ValueBridgeModel {
  const { block, leases } = data;
  const result = applyLevers(block, settings);
  if (!result.ok) {
    return { value: null, nothingLeft: false, headline: { before: "This story cannot be valued: ", key: "", after: result.error }, numbers: [], steps: [], conditions: [false, false], error: result.error };
  }
  const value = result.valuePerShare;
  const nothingLeft = value <= 0;
  const money = (v: number) => moneyText(v, block);
  const headline: BenchHeadline = nothingLeft
    ? { before: "", key: moneyText(0, block), after: `: ${takers(settings, leases)}` }
    : block.per === "company"
      ? { before: "The owners' part is worth ", key: valueText(value, block), after: "" }
      : { before: "Each share is worth ", key: valueText(value, block), after: "" };
  const steps: BridgeStep[] = [
    { id: "business", label: BUSINESS_LABEL, value: result.businessValue, text: money(result.businessValue), kind: "start" },
    { id: "cash", label: "Plus cash", value: settings.cash, text: money(settings.cash), kind: "add" },
    { id: "debt", label: leases ? "Less debt and leases" : "Less debt", value: -settings.debt, text: money(-settings.debt), kind: "take" },
    { id: "options", label: "Less options", value: -settings.options, text: money(-settings.options), kind: "take" },
    { id: "shareholders", label: SHAREHOLDERS_LABEL, value: result.equity, text: money(Math.max(0, result.equity)), kind: "total" },
  ];
  return {
    value,
    nothingLeft,
    headline,
    numbers: [
      { label: BUSINESS_LABEL, text: money(result.businessValue) },
      { label: SHAREHOLDERS_LABEL, text: money(Math.max(0, result.equity)) },
    ],
    steps,
    conditions: reportLevers(data).length
      ? [reportLevers(data).every((id) => near(settings[id], reportFigure(data, id) ?? Number.NaN)), nothingLeft]
      : [nothingLeft, near(settings.options, 0)],
  };
}

/** The size at rest, for the Workbench budget: three levers, the headline and two numbers, its prose and two Things to try. */
export function valueBridgeShape(data: ValueBridgeData): BenchShape {
  const levers = valueBridgeLevers(data);
  const model = valueBridgeModel(data, { cash: levers[0].opening, debt: levers[1].opening, options: levers[2].opening });
  const prose = [`${model.headline.before}${model.headline.key}${model.headline.after}`, ...model.numbers.map((n) => n.label), BRIDGE_CAPTION, ...levers.flatMap((l) => (l.caption ? [l.caption] : [])), ...(data.report ? [data.report.title, ...data.report.lines.map((l) => l.line)] : [])];
  return benchShape(levers, 1 + model.numbers.length, prose, valueBridgeTasks(data).length);
}

/** What the Tutor is told: each claim at its setting, the business value, what is left and the value a share. */
export function valueBridgeReading(data: ValueBridgeData, settings: BridgeSettings): BenchReading {
  const levers = valueBridgeLevers(data);
  const model = valueBridgeModel(data, settings);
  const value = model.value === null ? `Value: cannot be valued (${model.error})` : model.nothingLeft ? `Value: ${model.headline.key}${model.headline.after}` : `Value: ${model.headline.key}${data.block.per === "company" ? " for the owners" : " a share"}`;
  return {
    sliders: levers.map((l) => ({ label: l.label, text: l.reading(settings[l.id]) })),
    readouts: [value, ...model.numbers.map((n) => `${n.label}: ${n.text}`), ...(data.report ? [reportReadout(data.report, data.block)] : [])],
  };
}

/** The report's lines in one readout: "Amazon's 10-K for 2000: Long-term debt $2.1bn; ...". */
export function reportReadout(report: BridgeReport, block: ValuationBlock): string {
  return `${report.title}: ${report.lines.map((l) => `${l.line} ${moneyText(l.amount, block)}`).join("; ")}`;
}
