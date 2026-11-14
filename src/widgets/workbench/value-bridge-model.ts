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

export type ValueBridgeData = { block: ValuationBlock; leases?: BridgeLeases };

/** The business value the engine gives the Case's own story, before cash, debt and options; null when it cannot be valued. */
export function bridgeBusinessValue(block: ValuationBlock): number | null {
  const valued = valueCase(block);
  return valued.ok ? valued.businessValue : null;
}

/** The Things to try (B7: each can be reached on any Case, since debt and leases go up to the business value and options down to nothing). */
export function valueBridgeTasks(data: ValueBridgeData): string[] {
  return [data.leases ? "Raise debt and leases until shareholders get nothing" : "Raise debt until shareholders get nothing", `Set the options to ${moneyText(0, data.block)}. What does a share gain?`];
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
  const lever = (id: BridgeLeverId, label: string, opening: number, chips: number[] = [], caption?: string): BenchLever<BridgeLeverId> => {
    const range = { min: 0, max: top };
    return {
      id,
      label,
      ...range,
      step,
      opening,
      chips: stopsOf(range, chips),
      stops: stopsOf(range, [opening, ...chips]),
      more: false,
      reading: (v) => moneyText(v, block),
      spoken: (v) => moneySpoken(v, block),
      ...(caption ? { caption } : {}),
    };
  };
  return [
    lever("cash", "Cash", block.cash),
    lever("debt", leases ? "Debt and leases" : "Debt", debtOpening, [], leases ? `Includes ${leases.label}: ${moneyText(leases.amount, block)}` : undefined),
    lever("options", "Options", block.options, [0]),
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
    conditions: [nothingLeft, near(settings.options, 0)],
  };
}

/** The size at rest, for the Workbench budget: three levers, the headline and two numbers, its prose and two Things to try. */
export function valueBridgeShape(data: ValueBridgeData): BenchShape {
  const levers = valueBridgeLevers(data);
  const model = valueBridgeModel(data, { cash: levers[0].opening, debt: levers[1].opening, options: levers[2].opening });
  const prose = [`${model.headline.before}${model.headline.key}${model.headline.after}`, ...model.numbers.map((n) => n.label), BRIDGE_CAPTION, ...levers.flatMap((l) => (l.caption ? [l.caption] : []))];
  return benchShape(levers, 1 + model.numbers.length, prose, valueBridgeTasks(data).length);
}

/** What the Tutor is told: each claim at its setting, the business value, what is left and the value a share. */
export function valueBridgeReading(data: ValueBridgeData, settings: BridgeSettings): BenchReading {
  const levers = valueBridgeLevers(data);
  const model = valueBridgeModel(data, settings);
  const value = model.value === null ? `Value: cannot be valued (${model.error})` : model.nothingLeft ? `Value: ${model.headline.key}${model.headline.after}` : `Value: ${model.headline.key}${data.block.per === "company" ? " for the owners" : " a share"}`;
  return {
    sliders: levers.map((l) => ({ label: l.label, text: l.reading(settings[l.id]) })),
    readouts: [value, ...model.numbers.map((n) => `${n.label}: ${n.text}`)],
  };
}
