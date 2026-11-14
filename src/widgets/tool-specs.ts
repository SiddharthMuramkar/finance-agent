import type { ToolSpec } from "@openuidev/lang-core";
import { z } from "zod/v4";

// The Widget tools: small pieces of our code a widget calls in the browser with
// Query("tool", {...}, {rows: []}) to get real numbers, so a chart's values come from
// tested formulas or checked Case Data, never from the model. Moving a slider bound
// to a Query argument runs the tool again, with no model call. No React here: the
// server's widget check reads the names and argument schemas too.

export const WIDGET_TOOL_NAMES = ["case_data", "calculate", "calculate_range", "annuity_schedule"] as const;
export type WidgetToolName = (typeof WIDGET_TOOL_NAMES)[number];

export function isWidgetToolName(name: unknown): name is WidgetToolName {
  return typeof name === "string" && (WIDGET_TOOL_NAMES as readonly string[]).includes(name);
}

/** A Case Data reference, "caseId/datasetId", as the Course Navigator lists them. */
export const CASE_DATA_REFERENCE = /^[a-z0-9-]+\/[a-z0-9-]+$/;

const reference = z.string().regex(CASE_DATA_REFERENCE, 'a Case Data reference, "caseId/datasetId"');
const currency = z.enum(["usd", "inr"]).optional();
const inputs = z.record(z.string(), z.number());

/** Each tool's arguments. The browser checks them before running a tool; the server checks the literal ones in a finished widget. */
export const WIDGET_TOOL_ARGS = {
  case_data: z.object({ dataset: reference }),
  calculate: z.object({ calculator: z.string(), inputs, currency }),
  calculate_range: z.object({
    calculator: z.string(),
    inputs,
    vary: z.string(),
    from: z.number(),
    to: z.number(),
    step: z.number().positive(),
    output: z.string().optional(),
    currency,
  }),
  annuity_schedule: z.object({ total: z.number(), payments: z.number(), growthPercent: z.number(), ratePercent: z.number() }),
} satisfies Record<WidgetToolName, z.ZodType>;

/** Most points one calculate_range call returns. */
export const MAX_RANGE_POINTS = 200;

// What each tool returns. Every field in rows is a plain identifier, so a widget plucks a column
// with `result.rows.value`; chart category labels must be strings (`rows.label`, `rows.date`).
// A tool never throws: on bad arguments it returns empty rows and `error` in plain words.

export type CaseDataRow = { date: string; value: number; text: string };
export type CaseDataResult = {
  rows: CaseDataRow[];
  label: string;
  unit: string;
  source: string;
  sourceUrl: string;
  asOf: string;
  revealed: boolean;
  error?: string;
};

export type CalculateRow = { label: string; value: number; text: string };
export type CalculateResult = { rows: CalculateRow[]; title: string; error?: string };

export type RangeRow = { x: number; label: string; value: number; text: string };
export type CalculateRangeResult = { rows: RangeRow[]; output: string; outputs: string[]; error?: string };

export type AnnuityScheduleRow = { year: number; label: string; payment: number; presentValue: number };
export type AnnuityScheduleResult = { rows: AnnuityScheduleRow[]; presentValue: number; presentValueText: string; error?: string };

export type WidgetToolResults = {
  case_data: CaseDataResult;
  calculate: CalculateResult;
  calculate_range: CalculateRangeResult;
  annuity_schedule: AnnuityScheduleResult;
};

/** Each tool's result with no data: what a widget draws before the tool answers, or after an error. */
export const EMPTY_RESULTS: WidgetToolResults = {
  case_data: { rows: [], label: "", unit: "", source: "", sourceUrl: "", asOf: "", revealed: false },
  calculate: { rows: [], title: "" },
  calculate_range: { rows: [], output: "", outputs: [] },
  annuity_schedule: { rows: [], presentValue: 0, presentValueText: "" },
};

/** A tool's argument schema as JSON Schema for the instructions, without the noisy "$schema" line. */
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void $schema;
  return rest;
}

const string = { type: "string" };
const number = { type: "number" };
const rowsOf = (properties: Record<string, unknown>) => ({
  type: "array",
  items: { type: "object", properties, required: Object.keys(properties) },
});
const result = (properties: Record<string, unknown>) => ({
  type: "object",
  properties: { ...properties, error: { type: "string", description: "Set, with empty rows, when the tool could not run" } },
  required: Object.keys(properties),
});

/** The tools as the widget instructions describe them to the Tutor. */
export const WIDGET_TOOL_SPECS: ToolSpec[] = [
  {
    name: "case_data",
    description:
      'One checked Case Data dataset, fetched through the server\'s as-of rule (nothing dated after the Case\'s as-of date before the reveal). Use only references from the Case Data list code sent you, or reference/<id> from the reference list. One row per point: date, value, and text (the value written in its unit). Example: d = Query("case_data", {dataset: "mega-millions-2018/treasury-30-year"}, {rows: []}), then LineChart(d.rows.date, [Series("30-year yield", d.rows.value)]) or Table([Col("Date", d.rows.date), Col("Yield", d.rows.text)]).',
    inputSchema: jsonSchema(WIDGET_TOOL_ARGS.case_data),
    outputSchema: result({
      rows: rowsOf({ date: string, value: number, text: { type: "string", description: "The value formatted in its unit" } }),
      label: string,
      unit: string,
      source: string,
      sourceUrl: string,
      asOf: string,
      revealed: { type: "boolean" },
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "calculate",
    description:
      'One of our tested finance calculators: the same calculators, input names and answers as your own calculate tool, worked out inside the widget so its inputs can be $variables bound to Sliders. Inputs are numbers only, so npv, irr and dcf, which take a list of cash flows, cannot run in a widget, here or in calculate_range. One row per result line: label, value, and text (the value written out). Example: r = Query("calculate", {calculator: "emi", inputs: {principal: 5000000, ratePercent: $rate, years: 20}}, {rows: []}), then Table([Col("Result", r.rows.label), Col("Amount", r.rows.text)]).',
    inputSchema: jsonSchema(WIDGET_TOOL_ARGS.calculate),
    outputSchema: result({ rows: rowsOf({ label: string, value: number, text: string }), title: string }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "calculate_range",
    description: `A calculator run across a range of one of its inputs (vary), from \`from\` to \`to\` by \`step\` (at most ${MAX_RANGE_POINTS} points). One row per point: x (the input's number), label (x as text for the chart's axis, such as "8.5%" or "10 y"), value and text (the chosen result as a number and written out). output picks that result by its label, the first result if left out. Example: g = Query("calculate_range", {calculator: "future_value", inputs: {amount: 100000, ratePercent: $rate, years: 1}, vary: "years", from: 1, to: 30, step: 1}, {rows: []}), then AreaChart(g.rows.label, [Series("Future value", g.rows.value)]).`,
    inputSchema: jsonSchema(WIDGET_TOOL_ARGS.calculate_range),
    outputSchema: result({
      rows: rowsOf({ x: number, label: string, value: number, text: string }),
      output: string,
      outputs: { type: "array", items: string },
    }),
    annotations: { readOnlyHint: true },
  },
  {
    name: "annuity_schedule",
    description:
      'An annuity that grows at a fixed rate (first payment now), by the tested present value formula. One row per yearly payment: year, label (such as "Year 1"), payment, and presentValue (what that payment is worth today); presentValue and presentValueText give all the payments together. Example: s = Query("annuity_schedule", {total: 1537000000, payments: 30, growthPercent: 5, ratePercent: $rate}, {rows: []}), then BarChart(s.rows.label, [Series("Payment", s.rows.payment), Series("Worth today", s.rows.presentValue)]).',
    inputSchema: jsonSchema(WIDGET_TOOL_ARGS.annuity_schedule),
    outputSchema: result({
      rows: rowsOf({ year: number, label: string, payment: number, presentValue: number }),
      presentValue: number,
      presentValueText: string,
    }),
    annotations: { readOnlyHint: true },
  },
];
