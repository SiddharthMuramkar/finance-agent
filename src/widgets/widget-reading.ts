import { evaluate } from "@openuidev/lang-core";
import { calculate } from "@/finance/calculators";
import { formulaById, formulaCurrency } from "@/finance/formulas";
import { rateChangeReadouts } from "@/finance/rate-change";
import { annuityPaymentCount } from "@/finance/present-value";
import { formatUnit, formatUsd, formatValue } from "./case-data-view";
import { widgetNodes, widgetParts, widgetTaskTexts } from "./check";
import type { ParsedNode } from "./guided-tasks";
import { declaredSettings } from "./settings";
import { readingValue } from "./slider-steps";
import type { SavedWidget } from "./widget-state";

// What the Tutor sees of a Widget (spec #119, "Widgets › What the Tutor sees"): its sliders at the values the
// Learner has set, its Guided Tasks and which are ticked, and the key readouts of our own parts (annuity chart,
// calculators, Formula Cards) worked out by code with the same tested calculators the Widget draws with, so the
// Tutor never does the maths itself. Pure: Widget code, saved state and the Case Data allowed now in; text out.

/** Opens the text block of the Widget context in a Learner's message; the thread never draws it. */
export const WIDGETS_PREFIX = "Widgets by code:";

/** The latest point of a Case Data dataset, as the Widget reads it for a "caseId/datasetId" reference. */
export type SourcedFigure = { label: string; value: number; unit: string; date: string };
/** The figure a Case Data reference reads now (under the as-of rule), or undefined when there is none. */
export type SourcedLookup = (reference: string) => SourcedFigure | undefined;

export type WidgetReading = {
  title: string;
  /** The Topic's explore Widget, shown by code. */
  explore: boolean;
  /** Each slider: its label and the value the Learner has set, as the Widget prints it. */
  sliders: { label: string; text: string }[];
  /** Each Guided Task, in order, and whether it is ticked. */
  tasks: { text: string; ticked: boolean }[];
  /** The key readouts of our own parts, worked out by code: "Worth today at 3.38%: $877.4 million". */
  readouts: string[];
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A parsed prop with each expression in it worked out by OpenUI's own evaluator at the Widget's state, as the browser does. */
function resolve(raw: unknown, state: Record<string, number>): unknown {
  if (raw === null || typeof raw !== "object") return raw;
  if (Array.isArray(raw)) return raw.map((v) => resolve(v, state));
  const value = raw as Record<string, unknown>;
  if (typeof value.k === "string") return evaluate(value as never, { getState: (name) => state[name], resolveRef: () => undefined });
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, state)]));
}

/** A record of finite numbers, or undefined when any of its values is not one. */
function numbers(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  return entries.every(([, v]) => typeof v === "number" && Number.isFinite(v)) ? (Object.fromEntries(entries) as Record<string, number>) : undefined;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A slider's value as the Widget prints it beside its label (the Slider's own readout). */
const sliderText = (value: number, unit: unknown) => formatUnit(readingValue(value), typeof unit === "string" ? unit : undefined);

const sourcedLine = (figure: SourcedFigure) => `${figure.label}: ${formatValue(figure.value, figure.unit)} (sourced, ${figure.date})`;

/** The readouts of one of our parts, worked out by the tested calculator it draws with; none for any other part. */
function partReadouts(node: ParsedNode, state: Record<string, number>, lookup: SourcedLookup): string[] {
  const props = resolve(node.props, state) as Record<string, unknown>;
  if (node.typeName === "AnnuityChart") {
    const { total, payments, growthPercent, ratePercent, compareTo } = props;
    if (![total, payments, growthPercent, ratePercent].every(finite)) return [];
    const inputs = { total, payments: annuityPaymentCount(payments as number), growthPercent, ratePercent };
    const run = calculate("growing_annuity_present_value", inputs, "usd");
    if (!run.ok) return [];
    const value = (label: string) => run.results.find((r) => r.label === label)?.value;
    const figure = typeof compareTo === "string" ? lookup(compareTo) : undefined;
    return [
      `Sum of payments: ${formatUsd(total as number)}`,
      `Worth today at ${ratePercent}%: ${formatUsd(value("Present value")!)}`,
      ...(figure ? [sourcedLine(figure)] : []),
    ];
  }
  if (node.typeName === "Calculator") {
    const inputs = numbers(props.inputs);
    const currency = props.currency === "inr" || props.currency === "usd" ? props.currency : undefined;
    if (typeof props.calculator !== "string" || !inputs) return [];
    const run = calculate(props.calculator, inputs, currency);
    return run.ok ? [`${run.title}: ${run.results.map((r) => `${r.label} ${r.text}`).join("; ")}`] : [];
  }
  if (node.typeName === "FormulaCard") {
    const formula = typeof props.formula === "string" ? formulaById(props.formula) : undefined;
    const sourced = isRecord(props.sourced) ? props.sourced : {};
    const figures = Object.entries(sourced).map(([key, ref]) => [key, typeof ref === "string" ? lookup(ref)?.value : undefined] as const);
    const values = numbers({ ...(isRecord(props.fixed) ? props.fixed : {}), ...(isRecord(props.inputs) ? props.inputs : {}), ...Object.fromEntries(figures) });
    if (!formula || !values || !formula.symbols.every((s) => finite(values[s.key]))) return [];
    const run = calculate(formula.calculator, values, formulaCurrency(formula));
    if (!run.ok) return [];
    const outputs = [...formula.derived, formula.result].flatMap((o) => {
      const result = run.results.find((r) => r.label === o.resultLabel);
      return result ? [`${o.name} ${result.text}`] : [];
    });
    return [`${formula.title}: ${outputs.join("; ")}`];
  }
  return [];
}

/** The two sliders ($variables) whose rate change a written-ahead Widget says three ways (Percent). */
export type RateChangeSliders = { old: string; new: string };

/**
 * What a Widget shows now: its sliders at the saved values (else the ones its code starts at), its Guided Tasks
 * with the saved ticks, and our parts' readouts worked out from those values. A written-ahead Widget that says a rate
 * change (`rateChange`) gets those readouts from the tested rateChange too. Null when the code does not draw.
 */
export function readWidget(code: string, saved: SavedWidget | undefined, lookup: SourcedLookup, explore = false, rateChange?: RateChangeSliders): WidgetReading | null {
  const nodes = widgetNodes(code);
  const title = widgetParts(code).title?.trim();
  if (!nodes.length || !title) return null;
  const state = { ...declaredSettings(code), ...saved?.values };
  const sliders = nodes.flatMap((n) => {
    const value = resolve(n.props.value, state);
    return n.typeName === "Slider" && finite(value) && typeof n.props.label === "string" ? [{ label: n.props.label, text: sliderText(value, n.props.unit) }] : [];
  });
  const ticked = new Set(saved?.ticked ?? []);
  const tasks = widgetTaskTexts(code).map((text) => ({ text, ticked: ticked.has(text) }));
  const [before, after] = rateChange ? [state[rateChange.old], state[rateChange.new]] : [];
  const changed = finite(before) && finite(after) ? rateChangeReadouts(before, after) : [];
  return { title, explore, sliders, tasks, readouts: [...nodes.flatMap((n) => partReadouts(n, state, lookup)), ...changed] };
}

/** True when the Widget has Guided Tasks and every one of them is ticked. */
export function allTasksTicked(code: string, ticked: readonly string[]): boolean {
  const texts = widgetTaskTexts(code);
  const done = new Set(ticked);
  return texts.length > 0 && texts.every((t) => done.has(t));
}

/** One open Widget as the Tutor is told of it. */
function readingLines(r: WidgetReading): string[] {
  const done = r.tasks.filter((t) => t.ticked).length;
  return [
    `- "${r.title}"${r.explore ? " (the Topic's explore Widget)" : ""}`,
    ...(r.sliders.length ? [`  Sliders: ${r.sliders.map((s) => `${s.label}: ${s.text}`).join("; ")}`] : []),
    ...(r.tasks.length ? [`  Guided Tasks (optional play, never set as work; ${done} of ${r.tasks.length} ticked): ${r.tasks.map((t) => `[${t.ticked ? "x" : " "}] ${t.text}`).join("; ")}`] : []),
    ...(r.readouts.length ? [`  Readouts (worked out by code): ${r.readouts.join("; ")}`] : []),
  ];
}

/**
 * The Widget context a Learner's message carries: the open Widgets as they stand when it was sent. Stored with that
 * message, so later requests replay it unchanged. Null when no Widget is open.
 */
export function widgetsBlock(readings: readonly WidgetReading[]): string | null {
  if (!readings.length) return null;
  return [
    `${WIDGETS_PREFIX} the Learner's open Widgets as they stood when this message was sent. Read values and readouts from here; never work them out yourself.`,
    ...readings.flatMap(readingLines),
  ].join("\n");
}

/** "Interest rate" → "the interest rate"; a label that starts with an acronym ("EMI tenure") keeps its capitals. */
const theLabel = (label: string) => `the ${/^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label}`;

/**
 * What the Learner found, written by code from the Widget's values and readouts for "Tell the Tutor what I found":
 * e.g. "I set the interest rate (discount rate) to 3.38%. Worth today at 3.38%: $877.4 million; Cash option: …".
 */
export function foundText(reading: WidgetReading): string {
  const set = reading.sliders.length ? `I set ${reading.sliders.map((s) => `${theLabel(s.label)} to ${s.text}`).join(" and ")}.` : `I did every task in "${reading.title}".`;
  return reading.readouts.length ? `${set} ${reading.readouts.join("; ")}.` : set;
}
