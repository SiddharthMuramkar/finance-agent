import {
  costOfCapitalProblem,
  costOfCapitalStack,
  releveredRisk,
  type CostOfCapitalInputs,
} from "@/finance/cost-of-capital-stack";
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
import type { StackStory } from "./data-schemas";
import { dateText, valueText } from "./value-levers-model";

// Cost of capital stack (spec 2026-11-12, B4; Spine Topic 7), as pure functions: the risk-free rate, the premium for shares,
// relative risk and the share of debt build the cost of capital in layers (costOfCapitalStack). The cost of debt and the tax
// rate are the Case's, from the Topic file with their source. Bound to a Valuation Case as well, it shows what a share is
// worth at that rate (the rate as the Case's cost of capital while it grows), so the Learner can see the rate matters less
// than growth and margins.

export const STACK_LEVER_IDS = [
  "riskFree",
  "premium",
  "relativeRisk",
  "debtShare",
] as const;
export type StackLeverId = (typeof STACK_LEVER_IDS)[number];
export type StackSettings = Record<StackLeverId, number>;

export type WaccStackData = {
  /** The Case's figures, which the levers open at and the cost of debt and tax rate stay at. */
  inputs: CostOfCapitalInputs;
  source: Source;
  /** The Valuation Case whose value a share the rate sets, when there is one. */
  block?: ValuationBlock;
  /** How the Topic's story leads it (Spine critics on #91): by the cost of equity and its betas, or by the share of debt. */
  story?: StackStory;
};

const leverOf = <L extends { id: StackLeverId }>(
  levers: readonly L[],
  id: StackLeverId,
): L => levers.find((l) => l.id === id)!;

/** The story's betas inside the relative-risk range, other than where it opens: the chips and the Things to try. */
function marksOf(data: WaccStackData, range: { min: number; max: number }) {
  return (data.story?.marks ?? []).filter(
    (m) =>
      m.relativeRisk >= range.min - 1e-9 &&
      m.relativeRisk <= range.max + 1e-9 &&
      Math.abs(m.relativeRisk - data.inputs.relativeRisk) > 1e-9,
  );
}

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
export function waccStackLevers(
  data: WaccStackData,
): BenchLever<StackLeverId>[] {
  const { inputs } = data;
  const riskMax = Math.max(2.5, ceilTo(inputs.relativeRisk * 1.5, 0.1));
  const debtMax = Math.max(60, ceilTo(inputs.debtShare + 20, 10));
  const riskRange = {
    min: Math.min(0.5, floorTo(inputs.relativeRisk, 0.05)),
    max: riskMax,
  };
  const marks = marksOf(data, riskRange);
  const riskChips = stopsOf(
    riskRange,
    marks.length
      ? marks.map((m) => m.relativeRisk)
      : [riskTarget(data, riskMax)],
  );
  const markLabel = (v: number) =>
    marks.find((m) => Math.abs(m.relativeRisk - v) < 1e-9)?.label;
  const levers: BenchLever<StackLeverId>[] = [
    percentLever({
      id: "riskFree",
      label: "Risk-free rate",
      min: 0,
      max: Math.max(10, Math.ceil(inputs.riskFree) + 4),
      step: 0.25,
      opening: inputs.riskFree,
    }),
    percentLever({
      id: "premium",
      label: "Premium for shares",
      min: Math.min(2, Math.floor(inputs.equityPremium)),
      max: Math.max(8, Math.ceil(inputs.equityPremium) + 3),
      step: 0.25,
      opening: inputs.equityPremium,
    }),
    {
      id: "relativeRisk",
      label: "Relative risk",
      ...riskRange,
      step: 0.05,
      opening: inputs.relativeRisk,
      chips: riskChips,
      ...(marks.length && {
        chipLabel: (v: number) =>
          markLabel(v) ? `${v.toFixed(2)}, ${markLabel(v)}` : v.toFixed(2),
      }),
      stops: stopsOf(riskRange, [inputs.relativeRisk, ...riskChips]),
      more: false,
      reading: (v) => v.toFixed(2),
      spoken: (v) =>
        `${clean(Number(v.toFixed(2)))} times the average share's risk`,
      caption: "1 is the average share",
    },
    data.story?.lead === "debt"
      ? {
          ...percentLever({
            id: "debtShare",
            label: "Share of debt",
            min: 0,
            max: debtMax,
            step: 1,
            opening: inputs.debtShare,
            chips: [0],
          }),
          chipLabel: (v: number) => (v === 0 ? "No debt" : percentText(v)),
        }
      : percentLever({
          id: "debtShare",
          label: "Share of debt",
          min: 0,
          max: debtMax,
          step: 1,
          opening: inputs.debtShare,
          chips: [debtTarget(debtMax)],
        }),
  ];
  // The cost-of-capital Topic's idea is the mix, so its lever comes first (Spine critics on #91).
  return data.story?.lead === "debt"
    ? [levers[3], ...levers.slice(0, 3)]
    : levers;
}

/** The Things to try, with the values the Widget can reach (B7), each asking a direction, not a size (Math police, #91). */
export function waccStackTasks(data: WaccStackData): string[] {
  const levers = waccStackLevers(data);
  const risk = leverOf(levers, "relativeRisk");
  const debt = leverOf(levers, "debtShare");
  if (data.story?.lead === "debt")
    return [
      "Set the share of debt to none. Does the cost of capital move a lot or a little?",
      `Set it back to ${percentText(data.inputs.debtShare)}`,
    ];
  const marks = marksOf(data, risk);
  const what = data.block ? "value" : "rate";
  if (marks.length) {
    const [first, second] = marks.map(
      (m) => `${m.relativeRisk.toFixed(2)}, ${m.label}`,
    );
    return [
      `Move relative risk to ${first}. Does the ${what} move a lot or a little?`,
      ...(second ? [`Now move it to ${second}`] : []),
    ];
  }
  return [
    `Raise relative risk to ${riskTarget(data, risk.max).toFixed(1)}. Does the rate move a lot or a little?`,
    `Set the share of debt to ${debtTarget(debt.max)}%`,
  ];
}

/** Whether each Thing to try is reached at these settings, in the tasks' order. */
function taskConditions(
  data: WaccStackData,
  levers: readonly BenchLever<StackLeverId>[],
  settings: StackSettings,
): boolean[] {
  const risk = leverOf(levers, "relativeRisk");
  const debt = leverOf(levers, "debtShare");
  if (data.story?.lead === "debt")
    return [
      near(settings.debtShare, 0),
      near(settings.debtShare, data.inputs.debtShare),
    ];
  const marks = marksOf(data, risk);
  if (marks.length)
    return marks
      .slice(0, 2)
      .map((m) => near(settings.relativeRisk, m.relativeRisk));
  return [
    Math.abs(settings.relativeRisk - riskTarget(data, risk.max)) <=
      risk.step / 2,
    near(settings.debtShare, debtTarget(debt.max)),
  ];
}

export const STACK_CAPTION = "The rate, built up in layers";
export const EQUITY_LABEL = "Cost of equity";
export const AT_THIS_RATE_LABEL = "Value a share at this rate";
/** The risk Topic's name for the whole rate (Spine critics round 2 on #91): "cost of capital" is the next Topic's term. */
export const WHOLE_RATE_LABEL = "Whole rate, with debt";

/** Who puts in the money (Spine critics on #91): shareholders and lenders as characters, each with its Icon and share. */
export type StackFunder = {
  id: "shareholders" | "lenders";
  icon: "person" | "bank";
  text: string;
};

/** One layer of the stack: its words, where it starts and ends (percent), and its size as text. */
export type StackLayer = {
  id: "riskFree" | "premium" | "debt" | "total";
  label: string;
  from: number;
  to: number;
  text: string;
};

export type WaccStackModel = {
  total: number | null;
  headline: BenchHeadline;
  numbers: BenchNumber[];
  layers: StackLayer[];
  funders: StackFunder[];
  conditions: boolean[];
  error?: string;
};

const LAYER_LABELS = {
  riskFree: "Risk-free rate",
  premium: "Premium for this risk",
  debt: "Debt in the mix",
} as const;

/**
 * The full inputs for these settings: the levers, with the Case's cost of debt and tax rate. Relative risk is the Case's
 * beta at the Case's own share of debt, so at another share of debt it is re-levered (review 3, M03): more debt makes the
 * shares riskier, and a mix with no tax to save does not make the money cheaper.
 */
const inputsFor = (
  data: WaccStackData,
  settings: StackSettings,
): CostOfCapitalInputs => ({
  ...data.inputs,
  riskFree: settings.riskFree,
  equityPremium: settings.premium,
  debtShare: settings.debtShare,
  relativeRisk: releveredRisk(
    settings.relativeRisk,
    data.inputs.debtShare,
    settings.debtShare,
    data.inputs.taxRate,
  ),
});

/** Everything the Cost of capital stack shows for these settings. */
export function waccStackModel(
  data: WaccStackData,
  settings: StackSettings,
): WaccStackModel {
  const levers = waccStackLevers(data);
  const conditions = taskConditions(data, levers, settings);
  const inputs = inputsFor(data, settings);
  const problem =
    costOfCapitalProblem({ ...inputs, relativeRisk: settings.relativeRisk }) ??
    costOfCapitalProblem(inputs);
  if (problem)
    return {
      total: null,
      headline: { before: "No rate: ", key: "", after: problem },
      numbers: [],
      layers: [],
      funders: [],
      conditions,
      error: problem,
    };
  const stack = costOfCapitalStack(inputs);
  let at = 0;
  const layers: StackLayer[] = stack.layers.map((layer) => {
    const from = at;
    at += layer.value;
    return {
      id: layer.id,
      label: LAYER_LABELS[layer.id],
      from,
      to: at,
      text: `${layer.value < 0 ? "−" : "+"}${percentText(Math.abs(layer.value))}`,
    };
  });
  const equityLed = data.story?.lead === "equity";
  layers.push({
    id: "total",
    label: equityLed ? "Whole rate" : "Cost of capital",
    from: 0,
    to: stack.total,
    text: percentText(stack.total),
  });
  const numbers: BenchNumber[] = [
    equityLed
      ? { label: WHOLE_RATE_LABEL, text: percentText(stack.total) }
      : { label: EQUITY_LABEL, text: percentText(stack.costOfEquity) },
  ];
  if (data.block) {
    const valued = applyLevers(data.block, {
      costOfCapitalGrowing: stack.total,
    });
    const text = !valued.ok
      ? "cannot be valued"
      : valued.valuePerShare <= 0
        ? valueText(0, data.block)
        : valueText(valued.valuePerShare, data.block);
    numbers.push({
      label:
        data.block.per === "company"
          ? "Value at this rate"
          : AT_THIS_RATE_LABEL,
      text,
    });
    // The risk Topic's story asks whether any beta reaches the price (Spine critics round 1 on #91): show it beside the value.
    if (equityLed && data.block.per === "share")
      numbers.push({
        label: `Price on ${dateText(data.block.price.date)}`,
        text: valueText(data.block.price.value, data.block),
      });
  } else
    numbers.push({
      label: "After-tax cost of debt",
      text: percentText(stack.afterTaxCostOfDebt),
    });
  const funders: StackFunder[] = [
    {
      id: "shareholders",
      icon: "person",
      text: `Shareholders: ${percentText(100 - settings.debtShare)}, want ${percentText(stack.costOfEquity)}`,
    },
    {
      id: "lenders",
      icon: "bank",
      text: `Lenders: ${percentText(settings.debtShare)}, cost ${percentText(stack.afterTaxCostOfDebt)}`,
    },
  ];
  const headline = equityLed
    ? {
        before: "The cost of equity is ",
        key: percentText(stack.costOfEquity),
        after: "",
      }
    : {
        before: "The cost of capital is ",
        key: percentText(stack.total),
        after: "",
      };
  return { total: stack.total, headline, numbers, layers, funders, conditions };
}

export function waccStackShape(data: WaccStackData): BenchShape {
  const levers = waccStackLevers(data);
  const model = waccStackModel(
    data,
    Object.fromEntries(levers.map((l) => [l.id, l.opening])) as StackSettings,
  );
  const prose = [
    `${model.headline.before}${model.headline.key}${model.headline.after}`,
    ...model.numbers.map((n) => n.label),
    STACK_CAPTION,
    ...model.funders.map((f) => f.text),
    ...levers.flatMap((l) => (l.caption ? [l.caption] : [])),
  ];
  return benchShape(
    levers,
    1 + model.numbers.length,
    prose,
    waccStackTasks(data).length,
  );
}

export function waccStackReading(
  data: WaccStackData,
  settings: StackSettings,
): BenchReading {
  const levers = waccStackLevers(data);
  const model = waccStackModel(data, settings);
  const readouts =
    model.total === null
      ? [`No rate: ${model.error}`]
      : [
          `${data.story?.lead === "equity" ? EQUITY_LABEL : "Cost of capital"}: ${model.headline.key}`,
          ...model.numbers.map((n) => `${n.label}: ${n.text}`),
          `Layers: ${model.layers
            .filter((l) => l.id !== "total")
            .map((l) => `${l.label} ${l.text}`)
            .join(", ")}`,
          `Who puts in the money: ${model.funders.map((f) => f.text).join("; ")}`,
          ...(near(settings.debtShare, data.inputs.debtShare)
            ? []
            : [
                `Relative risk with this much debt: ${inputsFor(data, settings).relativeRisk.toFixed(2)} (${settings.relativeRisk.toFixed(2)} at ${percentText(data.inputs.debtShare)} of debt; more debt makes the shares riskier)`,
              ]),
          `Cost of debt ${percentText(data.inputs.costOfDebt)} before tax, tax rate ${percentText(data.inputs.taxRate)} (sourced: ${data.source.title})`,
        ];
  return {
    sliders: levers.map((l) => ({
      label: l.label,
      text: l.reading(settings[l.id]),
    })),
    readouts,
  };
}
