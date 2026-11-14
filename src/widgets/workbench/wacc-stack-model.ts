import { costOfCapitalProblem, costOfCapitalStack, type CostOfCapitalInputs } from "@/finance/cost-of-capital-stack";
import { applyLevers, type ValuationBlock } from "@/finance/valuation-case";
import {
  benchShape,
  ceilTo,
  clean,
  floorTo,
  near,
  onStep,
  percentLever,
  percentText,
  stopsOf,
  type BenchHeadline,
  type BenchLever,
  type BenchNumber,
  type BenchReading,
  type BenchShape,
  type Source,
} from "./bench";
import { valueText } from "./value-levers-model";

// Cost of capital stack (spec 2026-11-12, B4; Spine Topic 7), as pure functions: the risk-free rate, the premium for shares,
// relative risk and the share of debt build the cost of capital in layers (costOfCapitalStack). The cost of debt and the tax
// rate are the Case's, from the Topic file with their source. Bound to a Valuation Case as well, it shows what a share is
// worth at that rate (the rate as the Case's cost of capital while it grows), so the Learner can see the rate matters less
// than growth and margins.

export const STACK_LEVER_IDS = ["riskFree", "premium", "relativeRisk", "debtShare"] as const;
export type StackLeverId = (typeof STACK_LEVER_IDS)[number];
export type StackSettings = Record<StackLeverId, number>;

export type WaccStackData = {
  /** The Case's figures, which the levers open at and the cost of debt and tax rate stay at. */
  inputs: CostOfCapitalInputs;
  source: Source;
  /** The Valuation Case whose value a share the rate sets, when there is one. */
  block?: ValuationBlock;
};

/** Relative risk the first Thing to try names: a quarter more than the Case's, to a tenth, inside the range. */
function riskTarget(data: WaccStackData, max: number): number {
  return Math.min(max, onStep(data.inputs.relativeRisk * 1.25, 0.1));
}

/** The share of debt the second Thing to try names: 30%, or half the range when that is above it. */
function debtTarget(max: number): number {
  return Math.min(30, onStep(max / 2, 5));
}

/**
 * The levers, ranges worked out from the Case's figures: the risk-free rate from 0% to 10% (or 4 points above the Case's)
 * by 0.25; the premium for shares from 2% to 8% by 0.25; relative risk from 0.5 to 2.5 by 0.05; the share of debt from 0%
 * to 60% by 1. Each opens at the Case's figure, which is a stop (Amazon's 1.2% of debt is off the 1% steps).
 */
export function waccStackLevers(data: WaccStackData): BenchLever<StackLeverId>[] {
  const { inputs } = data;
  const riskMax = Math.max(2.5, ceilTo(inputs.relativeRisk * 1.5, 0.1));
  const debtMax = Math.max(60, ceilTo(inputs.debtShare + 20, 10));
  const riskRange = { min: Math.min(0.5, floorTo(inputs.relativeRisk, 0.05)), max: riskMax };
  const riskChips = stopsOf(riskRange, [riskTarget(data, riskMax)]);
  return [
    percentLever({ id: "riskFree", label: "Risk-free rate", min: 0, max: Math.max(10, Math.ceil(inputs.riskFree) + 4), step: 0.25, opening: inputs.riskFree }),
    percentLever({ id: "premium", label: "Premium for shares", min: Math.min(2, Math.floor(inputs.equityPremium)), max: Math.max(8, Math.ceil(inputs.equityPremium) + 3), step: 0.25, opening: inputs.equityPremium }),
    {
      id: "relativeRisk",
      label: "Relative risk",
      ...riskRange,
      step: 0.05,
      opening: inputs.relativeRisk,
      chips: riskChips,
      stops: stopsOf(riskRange, [inputs.relativeRisk, ...riskChips]),
      more: false,
      reading: (v) => v.toFixed(2),
      spoken: (v) => `${clean(Number(v.toFixed(2)))} times the average share's risk`,
      caption: "1 is the average share",
    },
    percentLever({ id: "debtShare", label: "Share of debt", min: 0, max: debtMax, step: 1, opening: inputs.debtShare, chips: [debtTarget(debtMax)] }),
  ];
}

/** The Things to try, with the values the Widget can reach (B7). */
export function waccStackTasks(data: WaccStackData): string[] {
  const [, , risk, debt] = waccStackLevers(data);
  return [`Raise relative risk to ${riskTarget(data, risk.max).toFixed(1)}. How far does the rate move?`, `Set the share of debt to ${debtTarget(debt.max)}%`];
}

export const STACK_CAPTION = "The rate, built up in layers";
export const EQUITY_LABEL = "Cost of equity";
export const AT_THIS_RATE_LABEL = "Value a share at this rate";

/** One layer of the stack: its words, where it starts and ends (percent), and its size as text. */
export type StackLayer = { id: "riskFree" | "premium" | "debt" | "total"; label: string; from: number; to: number; text: string };

export type WaccStackModel = {
  total: number | null;
  headline: BenchHeadline;
  numbers: BenchNumber[];
  layers: StackLayer[];
  conditions: boolean[];
  error?: string;
};

const LAYER_LABELS = { riskFree: "Risk-free rate", premium: "Premium for this risk", debt: "Debt in the mix" } as const;

/** The full inputs for these settings: the levers, with the Case's cost of debt and tax rate. */
const inputsFor = (data: WaccStackData, settings: StackSettings): CostOfCapitalInputs => ({ ...data.inputs, ...settings });

/** Everything the Cost of capital stack shows for these settings. */
export function waccStackModel(data: WaccStackData, settings: StackSettings): WaccStackModel {
  const levers = waccStackLevers(data);
  const [, , risk, debt] = levers;
  const conditions = [Math.abs(settings.relativeRisk - riskTarget(data, risk.max)) <= risk.step / 2, near(settings.debtShare, debtTarget(debt.max))];
  const inputs = inputsFor(data, settings);
  const problem = costOfCapitalProblem(inputs);
  if (problem) return { total: null, headline: { before: "No rate: ", key: "", after: problem }, numbers: [], layers: [], conditions, error: problem };
  const stack = costOfCapitalStack(inputs);
  let at = 0;
  const layers: StackLayer[] = stack.layers.map((layer) => {
    const from = at;
    at += layer.value;
    return { id: layer.id, label: LAYER_LABELS[layer.id], from, to: at, text: `${layer.value < 0 ? "−" : "+"}${percentText(Math.abs(layer.value))}` };
  });
  layers.push({ id: "total", label: "Cost of capital", from: 0, to: stack.total, text: percentText(stack.total) });
  const numbers: BenchNumber[] = [{ label: EQUITY_LABEL, text: percentText(stack.costOfEquity) }];
  if (data.block) {
    const valued = applyLevers(data.block, { costOfCapitalGrowing: stack.total });
    const text = !valued.ok ? "cannot be valued" : valued.valuePerShare <= 0 ? valueText(0, data.block) : valueText(valued.valuePerShare, data.block);
    numbers.push({ label: data.block.per === "company" ? "Value at this rate" : AT_THIS_RATE_LABEL, text });
  } else numbers.push({ label: "After-tax cost of debt", text: percentText(stack.afterTaxCostOfDebt) });
  return { total: stack.total, headline: { before: "The cost of capital is ", key: percentText(stack.total), after: "" }, numbers, layers, conditions };
}

export function waccStackShape(data: WaccStackData): BenchShape {
  const levers = waccStackLevers(data);
  const model = waccStackModel(data, Object.fromEntries(levers.map((l) => [l.id, l.opening])) as StackSettings);
  const prose = [`${model.headline.before}${model.headline.key}${model.headline.after}`, ...model.numbers.map((n) => n.label), STACK_CAPTION, ...levers.flatMap((l) => (l.caption ? [l.caption] : []))];
  return benchShape(levers, 1 + model.numbers.length, prose, waccStackTasks(data).length);
}

export function waccStackReading(data: WaccStackData, settings: StackSettings): BenchReading {
  const levers = waccStackLevers(data);
  const model = waccStackModel(data, settings);
  const readouts =
    model.total === null
      ? [`No rate: ${model.error}`]
      : [
          `Cost of capital: ${model.headline.key}`,
          ...model.numbers.map((n) => `${n.label}: ${n.text}`),
          `Layers: ${model.layers.filter((l) => l.id !== "total").map((l) => `${l.label} ${l.text}`).join(", ")}`,
          `Cost of debt ${percentText(data.inputs.costOfDebt)} before tax, tax rate ${percentText(data.inputs.taxRate)} (sourced: ${data.source.title})`,
        ];
  return { sliders: levers.map((l) => ({ label: l.label, text: l.reading(settings[l.id]) })), readouts };
}
