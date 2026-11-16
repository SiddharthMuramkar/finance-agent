import { valuationCase, valuationCaseIds } from "@/finance/valuation-cases";
import type { ValuationBlock } from "@/finance/valuation-case";
import type { OwnCases } from "@/finance/valuation-lookup";
import { benchSettings, type BenchLever, type BenchReading, type BenchShape } from "./bench";
import { cashWaterfallFromCase, cashWaterfallLevers, cashWaterfallModel, cashWaterfallReading, cashWaterfallShape, cashWaterfallTasks, type CashWaterfallData } from "./cash-waterfall-model";
import { bridgeReportSchema, companyYearSchema, costOfCapitalFiguresSchema, decoderFiguresSchema, leasesSchema, sourceSchema } from "./data-schemas";
import { multipleDecoderLevers, multipleDecoderModel, multipleDecoderReading, multipleDecoderShape, multipleDecoderTasks, type MultipleDecoderData } from "./multiple-decoder-model";
import { terminalSeesawLevers, terminalSeesawModel, terminalSeesawReading, terminalSeesawShape, terminalSeesawTasks, type TerminalSeesawData } from "./terminal-seesaw-model";
import { valueBridgeLevers, valueBridgeModel, valueBridgeReading, valueBridgeShape, valueBridgeTasks, type ValueBridgeData } from "./value-bridge-model";
import { changedRowReadouts, rowsFrom, withRows } from "./full-sheet";
import { leverSpecs, MARKET_VARIABLE, marketFrom, settingsFrom as leverSettingsFrom, valueLeversData, valueLeversLevers, valueLeversModel, valueLeversReading, valueLeversShape, valueLeversTasks, type ValueLeversData } from "./value-levers-model";
import { waccStackLevers, waccStackModel, waccStackReading, waccStackShape, waccStackTasks, type WaccStackData } from "./wacc-stack-model";

// Every Workbench part, by name, and what the Widget check and the Tutor's reading need of it (spec 2026-11-12, B2 to B4;
// ADR 0010): its data from the part's literal props (a Valuation Case, and the Topic file's figures), its levers and the
// $variable props they are bound to, its size at rest for the Workbench budget, its Things to try, and what the Tutor is told.
// Pure: check.ts and widget-reading.ts read it, on the server and in the browser alike.

// Every method takes the Learner's Own Cases as an optional last argument: Value levers finds its Case among the course
// Cases first, then there (spec #68), so the Tutor reads a Widget on an Own Case as the page draws it.

/** A Workbench lever as the check lists it for the Tutor: the prop holding its $variable, its name and its range. */
export type WorkbenchLeverInfo = { prop: string; name: string; min: number; max: number; step: number };

export type WorkbenchEntry = {
  part: string;
  recipe: string;
  /** Why the part's literal props cannot be drawn, in words, or null when they can. */
  problem(props: Record<string, unknown>, ownCases?: OwnCases | null): string | null;
  shape(props: Record<string, unknown>, ownCases?: OwnCases | null): BenchShape | null;
  /** Its Things to try, from the props resolved at the Widget's state: Value levers names the price of the Case chosen. */
  tasks(props: Record<string, unknown>, ownCases?: OwnCases | null): string[];
  levers(props: Record<string, unknown>, ownCases?: OwnCases | null): WorkbenchLeverInfo[];
  /** What the Tutor is told, from the props resolved at the Widget's state. */
  reading(props: Record<string, unknown>, ownCases?: OwnCases | null): BenchReading | null;
  /**
   * Whether each Thing to try holds with the levers at these settings (props resolved at the Widget's state), in task
   * order; null for a task that depends on how the Learner moved rather than where the levers are ("one lever at a time").
   */
  conditions(props: Record<string, unknown>, ownCases?: OwnCases | null): (boolean | null)[];
};

type Typed<D, Id extends string> = {
  part: string;
  recipe: string;
  data(props: Record<string, unknown>, ownCases?: OwnCases | null): { data: D } | { problem: string };
  levers(data: D): BenchLever<Id>[];
  shape(data: D): BenchShape;
  tasks(data: D): string[];
  reading(data: D, settings: Record<Id, number>, props: Record<string, unknown>): BenchReading;
  conditions(data: D, settings: Record<Id, number>, props: Record<string, unknown>): (boolean | null)[];
};

/** A typed entry with its data parsed once per call, erased to what the check needs. */
function entry<D, Id extends string>(spec: Typed<D, Id>): WorkbenchEntry {
  const data = (props: Record<string, unknown>, ownCases?: OwnCases | null) => {
    const parsed = spec.data(props, ownCases);
    return "data" in parsed ? parsed.data : null;
  };
  return {
    part: spec.part,
    recipe: spec.recipe,
    problem: (props, ownCases) => {
      const parsed = spec.data(props, ownCases);
      return "problem" in parsed ? parsed.problem : null;
    },
    shape: (props, ownCases) => {
      const d = data(props, ownCases);
      return d === null ? null : spec.shape(d);
    },
    tasks: (props, ownCases) => {
      const d = data(props, ownCases);
      return d === null ? [] : spec.tasks(d);
    },
    levers: (props, ownCases) => {
      const d = data(props, ownCases);
      if (d === null) return [];
      return spec.levers(d).map((l) => ({ prop: l.id, name: l.title && l.title !== l.label ? `${l.title}: ${l.label.toLowerCase()}` : l.label, min: l.min, max: l.max, step: l.step }));
    },
    reading: (props, ownCases) => {
      const d = data(props, ownCases);
      return d === null ? null : spec.reading(d, benchSettings(props as Partial<Record<Id, unknown>>, spec.levers(d)), props);
    },
    conditions: (props, ownCases) => {
      const d = data(props, ownCases);
      return d === null ? [] : spec.conditions(d, benchSettings(props as Partial<Record<Id, unknown>>, spec.levers(d)), props);
    },
  };
}

/** The Valuation Case a part names, or a sentence naming the Cases there are. */
function caseOf(id: unknown): { block: ValuationBlock } | { problem: string } {
  const block = typeof id === "string" ? valuationCase(id) : null;
  if (block) return { block };
  return { problem: `${typeof id === "string" ? `"${id}"` : "This part"} is not a Valuation Case. Cases: ${valuationCaseIds().join(", ")}.` };
}

/** A zod issue list as one line. */
const issues = (error: { issues: { path: PropertyKey[]; message: string }[] }) => error.issues.map((i) => `${i.path.map(String).join(".") || "value"}: ${i.message}`).join("; ");

const valueLevers = entry<ValueLeversData, string>({
  part: "ValueLevers",
  recipe: "value_levers",
  data: (props, ownCases) => valueLeversData(props, ownCases),
  levers: (data) => valueLeversLevers(data),
  shape: (data) => valueLeversShape(data.block, data.mode),
  tasks: (data) => valueLeversTasks(data.block),
  // The Full sheet's changed rows (#104) are valued with the Levers, and the Tutor is told each one, so it and the screen agree.
  reading: (data, _settings, props) => {
    const rows = rowsFrom(props, data.block);
    const reading = valueLeversReading({ ...data, block: withRows(data.block, rows) }, props);
    return { ...reading, readouts: [...reading.readouts, ...changedRowReadouts(data.block, rows)] };
  },
  conditions: (data, _settings, props) => {
    const specs = leverSpecs(data.block, data.mode);
    const model = valueLeversModel(withRows(data.block, rowsFrom(props, data.block)), specs, leverSettingsFrom(props, specs), data.mode, marketFrom(props[MARKET_VARIABLE], data.mode));
    return [null, model.nearPrice];
  },
});

/** A ValueBridge part's data: its Valuation Case and any leases counted as debt. */
export function valueBridgeData(props: Record<string, unknown>): { data: ValueBridgeData } | { problem: string } {
  const found = caseOf(props.caseId);
  if ("problem" in found) return found;
  const data: ValueBridgeData = { block: found.block };
  if (props.leases !== undefined && props.leases !== null) {
    const leases = leasesSchema.safeParse(props.leases);
    if (!leases.success) return { problem: `leases: ${issues(leases.error)}` };
    data.leases = { amount: leases.data.amount, label: leases.data.label };
  }
  if (props.report !== undefined && props.report !== null) {
    const report = bridgeReportSchema.safeParse(props.report);
    if (!report.success) return { problem: `report: ${issues(report.error)}` };
    data.report = { title: report.data.title, lines: report.data.lines };
  }
  return { data };
}

const valueBridge = entry<ValueBridgeData, string>({
  part: "ValueBridge",
  recipe: "value_bridge",
  data: valueBridgeData,
  levers: valueBridgeLevers,
  shape: valueBridgeShape,
  tasks: valueBridgeTasks,
  reading: (data, settings) => valueBridgeReading(data, settings as Parameters<typeof valueBridgeReading>[1]),
  conditions: (data, settings) => valueBridgeModel(data, settings as Parameters<typeof valueBridgeModel>[1]).conditions,
});

/** A TerminalSeesaw part's data: its Valuation Case. */
export function terminalSeesawData(props: Record<string, unknown>): { data: TerminalSeesawData } | { problem: string } {
  const found = caseOf(props.caseId);
  return "problem" in found ? found : { data: { block: found.block } };
}

const terminalSeesaw = entry<TerminalSeesawData, string>({
  part: "TerminalSeesaw",
  recipe: "terminal_seesaw",
  data: terminalSeesawData,
  levers: terminalSeesawLevers,
  shape: terminalSeesawShape,
  tasks: terminalSeesawTasks,
  reading: (data, settings) => terminalSeesawReading(data, settings as Parameters<typeof terminalSeesawReading>[1]),
  conditions: (data, settings) => terminalSeesawModel(data, settings as Parameters<typeof terminalSeesawModel>[1]).conditions,
});

/** A WaccStack part's data: the Case's figures with their source, and the Valuation Case whose value it sets, if any. */
export function waccStackData(props: Record<string, unknown>): { data: WaccStackData } | { problem: string } {
  const figures = costOfCapitalFiguresSchema.safeParse(props.figures);
  if (!figures.success) return { problem: `figures: ${issues(figures.error)}` };
  const source = sourceSchema.safeParse(props.source);
  if (!source.success) return { problem: `source: ${issues(source.error)}` };
  if (props.caseId === undefined || props.caseId === null) return { data: { inputs: figures.data, source: source.data } };
  const found = caseOf(props.caseId);
  return "problem" in found ? found : { data: { inputs: figures.data, source: source.data, block: found.block } };
}

const waccStack = entry<WaccStackData, string>({
  part: "WaccStack",
  recipe: "wacc_stack",
  data: waccStackData,
  levers: waccStackLevers,
  shape: waccStackShape,
  tasks: waccStackTasks,
  reading: (data, settings) => waccStackReading(data, settings as Parameters<typeof waccStackReading>[1]),
  conditions: (data, settings) => waccStackModel(data, settings as Parameters<typeof waccStackModel>[1]).conditions,
});

/** The Cash waterfall's year: a Valuation Case's base year, or a company's from the Topic file. */
export function cashWaterfallData(base: unknown): { data: CashWaterfallData } | { problem: string } {
  const record = typeof base === "object" && base !== null ? (base as Record<string, unknown>) : {};
  if (record.caseId !== undefined) {
    const found = caseOf(record.caseId);
    return "problem" in found ? found : { data: cashWaterfallFromCase(found.block) };
  }
  const company = companyYearSchema.safeParse(record.company);
  if (!company.success) return { problem: `base: a Valuation Case ({caseId}) or a company ({company}) is needed; ${issues(company.error)}` };
  const c = company.data;
  return { data: { money: { currency: c.currency, unit: c.unit }, lastRevenue: c.revenue, taxPercent: c.taxPercent, lossesCarried: c.lossesCarried ?? 0, opening: c.opening } };
}

const cashWaterfall = entry<CashWaterfallData, string>({
  part: "CashWaterfall",
  recipe: "cash_waterfall",
  data: (props) => cashWaterfallData(props.base),
  levers: cashWaterfallLevers,
  shape: cashWaterfallShape,
  tasks: () => cashWaterfallTasks(),
  reading: (data, settings) => cashWaterfallReading(data, settings as Parameters<typeof cashWaterfallReading>[1]),
  conditions: (data, settings) => cashWaterfallModel(data, settings as Parameters<typeof cashWaterfallModel>[1]).conditions,
});

/** A MultipleDecoder part's data: the company's and its peers' multiples, the figures held still, and where the levers open. */
export function multipleDecoderData(props: Record<string, unknown>): { data: MultipleDecoderData } | { problem: string } {
  const figures = decoderFiguresSchema.safeParse({ subject: props.subject, peers: props.peers, assumptions: props.assumptions, opening: props.opening });
  return figures.success ? { data: figures.data } : { problem: issues(figures.error) };
}

const multipleDecoder = entry<MultipleDecoderData, string>({
  part: "MultipleDecoder",
  recipe: "multiple_decoder",
  data: multipleDecoderData,
  levers: multipleDecoderLevers,
  shape: multipleDecoderShape,
  tasks: multipleDecoderTasks,
  reading: (data, settings) => multipleDecoderReading(data, settings as Parameters<typeof multipleDecoderReading>[1]),
  conditions: (data, settings) => multipleDecoderModel(data, settings as Parameters<typeof multipleDecoderModel>[1]).conditions,
});

/** Every Workbench part by name. */
export const WORKBENCH_ENTRIES: Record<string, WorkbenchEntry> = Object.fromEntries(
  [valueLevers, valueBridge, terminalSeesaw, waccStack, cashWaterfall, multipleDecoder].map((e) => [e.part, e]),
);

/** The Workbench entry of a part, or undefined for any other part. */
export function workbenchEntry(typeName: string): WorkbenchEntry | undefined {
  return Object.hasOwn(WORKBENCH_ENTRIES, typeName) ? WORKBENCH_ENTRIES[typeName] : undefined;
}
