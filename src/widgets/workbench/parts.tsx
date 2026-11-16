"use client";

import { defineComponent, reactive, useStateField, type ComponentRenderProps } from "@openuidev/react-lang";
import { useContext, useMemo, type ReactNode } from "react";
import { z } from "zod/v4";
import { SavedTicksContext } from "../saved-ticks";
import { benchSettings, type BenchLever } from "./bench";
import { cashWaterfallLevers } from "./cash-waterfall-model";
import { CashWaterfallView } from "./cash-waterfall-view";
import { multipleDecoderLevers } from "./multiple-decoder-model";
import { MultipleDecoderView } from "./multiple-decoder-view";
import { cashWaterfallData, multipleDecoderData, terminalSeesawData, valueBridgeData, waccStackData } from "./registry";
import { terminalSeesawLevers } from "./terminal-seesaw-model";
import { TerminalSeesawView } from "./terminal-seesaw-view";
import { valueBridgeLevers } from "./value-bridge-model";
import { ValueBridgeView } from "./value-bridge-view";
import { waccStackLevers } from "./wacc-stack-model";
import { WaccStackView } from "./wacc-stack-view";

// The five Workbench parts that follow Value levers (spec 2026-11-12, B4; ADR 0010), in the Widget library so their recipes
// can draw them and the Study Workspace keeps their work like any Widget's: each lever is a $variable the program declares
// (saved, restored, told to the Tutor), the Things to try are saved ticks, and the Topic file's figures arrive as literal
// props, parsed by the same functions the Widget check uses (registry.ts). Only a recipe draws them: widgetRuleProblems holds
// a Workbench part to standing alone.

// reactive() wraps the schema last: zod's .describe() returns a copy, and a copy outside reactive() is no longer bound to
// its $variable, so a lever's setting would stay out of Widget state.
const lever = (what: string) => reactive(z.number().describe(`${what}, a $variable`));
/** A figure from the Topic file, checked by code (registry.ts), not by the part's schema, so the instructions stay short. */
const figures = (what: string) => z.any().describe(what);
/** Every Workbench part's description: the Workbench group's note says the rest. */
export const DRAWN_BY_CODE = (recipe: string) => `Drawn by code: show_widget recipe ${recipe}.`;

type Field = { value: unknown; setValue: (value: number) => void };

/** A part's levers from its Widget state fields, and how to write a whole new set back. */
function useLevers<Id extends string>(fields: Record<Id, Field>, levers: readonly BenchLever<Id>[]) {
  const values = Object.fromEntries(Object.entries<Field>(fields).map(([id, f]) => [id, f.value])) as Partial<Record<Id, unknown>>;
  const settings = benchSettings(values, levers);
  const set = (next: Record<Id, number>) => {
    for (const [id, field] of Object.entries<Field>(fields)) if (next[id as Id] !== field.value) field.setValue(next[id as Id]);
  };
  return { settings, set };
}

/** The literal props a part's data comes from, as one key, so the data is parsed once per change. */
const keyOf = (props: Record<string, unknown>, names: readonly string[]) => JSON.stringify(names.map((n) => props[n] ?? null));

function Unavailable({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-[var(--muted)]">{children}</p>;
}

// ——— Value bridge ———

export const valueBridgeProps = z.object({
  caseId: z.string().describe("A Valuation Case id, such as amazon-dcf-2000"),
  cash: lever("Cash, in the Case's unit"),
  debt: lever("Debt and leases"),
  options: lever("Options"),
  leases: figures("Leases counted as debt, {amount, label, source}, or null").optional(),
  report: figures("A report's lines beside the bridge, {title, lines, source}, or null").optional(),
});

function ValueBridgePart({ props }: ComponentRenderProps<z.infer<typeof valueBridgeProps>>) {
  const fields = { cash: useStateField("cash", props.cash), debt: useStateField("debt", props.debt), options: useStateField("options", props.options) };
  const saved = useContext(SavedTicksContext);
  const key = keyOf(props, ["caseId", "leases", "report"]);
  const parsed = useMemo(() => {
    const [caseId, leases, report] = JSON.parse(key) as unknown[];
    return valueBridgeData({ caseId, leases, report });
  }, [key]);
  const levers = useMemo(() => ("data" in parsed ? valueBridgeLevers(parsed.data) : []), [parsed]);
  const { settings, set } = useLevers(fields, levers);
  if (!("data" in parsed)) return <Unavailable>{parsed.problem}</Unavailable>;
  return <ValueBridgeView data={parsed.data} levers={settings} onLeversChange={set} ticked={saved?.ticked} onTicked={saved?.onTicked} />;
}

export const ValueBridge = defineComponent({ name: "ValueBridge", description: DRAWN_BY_CODE("value_bridge"), props: valueBridgeProps, component: ValueBridgePart });

// ——— Terminal seesaw ———

export const terminalSeesawProps = z.object({
  caseId: z.string().describe("A Valuation Case id"),
  growthAfter: lever("Growth after year 10, in percent"),
  costAfter: lever("Cost of capital after year 10, in percent"),
});

function TerminalSeesawPart({ props }: ComponentRenderProps<z.infer<typeof terminalSeesawProps>>) {
  const fields = { growthAfter: useStateField("growthAfter", props.growthAfter), costAfter: useStateField("costAfter", props.costAfter) };
  const saved = useContext(SavedTicksContext);
  const parsed = useMemo(() => terminalSeesawData({ caseId: props.caseId }), [props.caseId]);
  const levers = useMemo(() => ("data" in parsed ? terminalSeesawLevers(parsed.data) : []), [parsed]);
  const { settings, set } = useLevers(fields, levers);
  if (!("data" in parsed)) return <Unavailable>{parsed.problem}</Unavailable>;
  return <TerminalSeesawView data={parsed.data} levers={settings} onLeversChange={set} ticked={saved?.ticked} onTicked={saved?.onTicked} />;
}

export const TerminalSeesaw = defineComponent({ name: "TerminalSeesaw", description: DRAWN_BY_CODE("terminal_seesaw"), props: terminalSeesawProps, component: TerminalSeesawPart });

// ——— Cost of capital stack ———

export const waccStackProps = z.object({
  figures: figures("The Case's figures in percent: {riskFree, equityPremium, relativeRisk, debtShare, costOfDebt, taxRate}"),
  source: figures("Where they come from: {title, url}"),
  riskFree: lever("Risk-free rate, in percent"),
  premium: lever("Premium for shares, in percent"),
  relativeRisk: lever("Relative risk (beta)"),
  debtShare: lever("Share of debt, in percent"),
  caseId: z.string().nullish().describe("The Valuation Case whose value a share the rate sets, if any"),
  readings: z.array(z.string()).nullish().describe("Market readings shown beside the levers, by id"),
});

function WaccStackPart({ props }: ComponentRenderProps<z.infer<typeof waccStackProps>>) {
  const fields = {
    riskFree: useStateField("riskFree", props.riskFree),
    premium: useStateField("premium", props.premium),
    relativeRisk: useStateField("relativeRisk", props.relativeRisk),
    debtShare: useStateField("debtShare", props.debtShare),
  };
  const saved = useContext(SavedTicksContext);
  const key = keyOf(props, ["figures", "source", "caseId"]);
  const parsed = useMemo(() => {
    const [f, s, c] = JSON.parse(key) as unknown[];
    return waccStackData({ figures: f, source: s, caseId: c });
  }, [key]);
  const levers = useMemo(() => ("data" in parsed ? waccStackLevers(parsed.data) : []), [parsed]);
  const { settings, set } = useLevers(fields, levers);
  if (!("data" in parsed)) return <Unavailable>{parsed.problem}</Unavailable>;
  return <WaccStackView data={parsed.data} levers={settings} onLeversChange={set} ticked={saved?.ticked} onTicked={saved?.onTicked} readings={props.readings ?? []} />;
}

export const WaccStack = defineComponent({ name: "WaccStack", description: DRAWN_BY_CODE("wacc_stack"), props: waccStackProps, component: WaccStackPart });

// ——— Cash waterfall ———

export const cashWaterfallProps = z.object({
  base: figures("The year's figures: {caseId} for a Valuation Case, or {company} with its revenue, tax, openings and source"),
  growth: lever("Revenue growth next year, in percent"),
  margin: lever("Operating margin, in percent"),
  salesToCapital: lever("Sales for each dollar invested"),
});

function CashWaterfallPart({ props }: ComponentRenderProps<z.infer<typeof cashWaterfallProps>>) {
  const fields = { growth: useStateField("growth", props.growth), margin: useStateField("margin", props.margin), salesToCapital: useStateField("salesToCapital", props.salesToCapital) };
  const saved = useContext(SavedTicksContext);
  const key = keyOf(props, ["base"]);
  const parsed = useMemo(() => cashWaterfallData((JSON.parse(key) as unknown[])[0]), [key]);
  const levers = useMemo(() => ("data" in parsed ? cashWaterfallLevers(parsed.data) : []), [parsed]);
  const { settings, set } = useLevers(fields, levers);
  if (!("data" in parsed)) return <Unavailable>{parsed.problem}</Unavailable>;
  return <CashWaterfallView data={parsed.data} levers={settings} onLeversChange={set} ticked={saved?.ticked} onTicked={saved?.onTicked} />;
}

export const CashWaterfall = defineComponent({ name: "CashWaterfall", description: DRAWN_BY_CODE("cash_waterfall"), props: cashWaterfallProps, component: CashWaterfallPart });

// ——— Multiple decoder ———

export const multipleDecoderProps = z.object({
  subject: figures("The company and its multiple of revenue: {name, multiple, source}, with an optional icon and note"),
  peers: figures("One to three peers, each {name, multiple, source, icon?, note?}"),
  assumptions: figures("What stays still: {taxPercent, salesToCapital, growthAfterPercent}"),
  opening: figures("Where the levers open: {growth, risk, margin}"),
  growth: lever("Revenue growth in years 1 to 5, in percent"),
  risk: lever("Cost of capital, in percent"),
  margin: lever("Operating margin, in percent"),
});

function MultipleDecoderPart({ props }: ComponentRenderProps<z.infer<typeof multipleDecoderProps>>) {
  const fields = { growth: useStateField("growth", props.growth), risk: useStateField("risk", props.risk), margin: useStateField("margin", props.margin) };
  const saved = useContext(SavedTicksContext);
  const key = keyOf(props, ["subject", "peers", "assumptions", "opening"]);
  const parsed = useMemo(() => {
    const [subject, peers, assumptions, opening] = JSON.parse(key) as unknown[];
    return multipleDecoderData({ subject, peers, assumptions, opening });
  }, [key]);
  const levers = useMemo(() => ("data" in parsed ? multipleDecoderLevers(parsed.data) : []), [parsed]);
  const { settings, set } = useLevers(fields, levers);
  if (!("data" in parsed)) return <Unavailable>{parsed.problem}</Unavailable>;
  return <MultipleDecoderView data={parsed.data} levers={settings} onLeversChange={set} ticked={saved?.ticked} onTicked={saved?.onTicked} />;
}

export const MultipleDecoder = defineComponent({ name: "MultipleDecoder", description: DRAWN_BY_CODE("multiple_decoder"), props: multipleDecoderProps, component: MultipleDecoderPart });

/** The five, in the order the spec lists them (B4). */
export const BENCH_PARTS = [ValueBridge, TerminalSeesaw, WaccStack, CashWaterfall, MultipleDecoder];
