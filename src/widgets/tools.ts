import { z } from "zod/v4";
import type { CaseData } from "@/case-data/case-data";
import { calculate, CALCULATOR_IDS, CALCULATORS } from "@/finance/calculators";
import { annuitySchedule } from "@/finance/present-value";
import { formatUsd } from "./case-data-view";
import { EMPTY_RESULTS, MAX_RANGE_POINTS, WIDGET_TOOL_ARGS, type RangeRow, type WidgetToolName, type WidgetToolResults } from "./tool-specs";

// The Widget tools as the browser runs them. A widget's Query("tool", {...}, {rows: []}) calls one
// with its arguments, $variables already filled in, and draws the rows it answers; moving a slider
// bound to an argument calls it again, with no model call. Every number comes from the tested
// Finance Calculations or from Case Data under the server's as-of rule. A tool never throws: a
// problem comes back as empty rows and `error` in plain words that name the fix, and onError hears it.

export type WidgetToolOptions = {
  /** Hears each tool error in plain words, so the widget can say why a chart stayed empty. */
  onError?: (tool: WidgetToolName, message: string) => void;
  /** Fetches one Case's data; defaults to the browser fetch of /api/case-data. Tests pass a fake. */
  fetchCaseData?: (caseId: string) => Promise<CaseData | null>;
};

/** The Widget tools as the OpenUI Renderer's toolProvider: one async function per tool, by name. */
export type WidgetToolProvider = { [K in WidgetToolName]: (args: Record<string, unknown>) => Promise<WidgetToolResults[K]> };

type Calculator = (typeof CALCULATORS)[number];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A number written as text, as a Select's or Chips' value always is ("20"), read as that number; OpenUI's own arithmetic reads text the same way. */
function readNumber(value: unknown): unknown {
  if (typeof value !== "string" || value.trim() === "") return value;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

/** The arguments with numbers written as text read as numbers, in the fields that take a number and in `inputs`. */
function withNumbers(args: unknown, shape: Record<string, z.ZodType>): unknown {
  if (!isRecord(args)) return args;
  const out = { ...args };
  for (const [key, schema] of Object.entries(shape)) {
    if (schema instanceof z.ZodNumber && key in out) out[key] = readNumber(out[key]);
  }
  if ("inputs" in shape && isRecord(out.inputs)) out.inputs = Object.fromEntries(Object.entries(out.inputs).map(([key, value]) => [key, readNumber(value)]));
  return out;
}

/** What a tool takes, read from its schema: "calculator, inputs, currency?". */
function takes(tool: WidgetToolName): string {
  return Object.entries(WIDGET_TOOL_ARGS[tool].shape)
    .map(([key, schema]) => ((schema as z.ZodType).safeParse(undefined).success ? `${key}?` : key))
    .join(", ");
}

/** A tool's argument problems in plain words (the first three), then what the tool takes. */
function argumentProblem(tool: WidgetToolName, error: z.ZodError): string {
  const problems = error.issues.map((issue) => {
    const at = issue.path.map(String).join(".");
    if (at === "step" && issue.code === "too_small") return "step must be more than 0, so use a bigger step";
    return at ? `${at}: ${issue.message}` : issue.message;
  });
  const more = problems.length > 3 ? `; and ${problems.length - 3} more` : "";
  return `${tool}: ${problems.slice(0, 3).join("; ")}${more}. It takes {${takes(tool)}}.`;
}

/**
 * The calculator with this id and its input names, or what is wrong: an unknown id, or an input it
 * does not take. The calculator would silently drop that input, so a slider bound to it would move
 * nothing and the chart would not show the assumption it claims to.
 */
function findCalculator(id: string, inputs: Record<string, number>): { calculator: Calculator; names: string[] } | { error: string } {
  const calculator = CALCULATORS.find((c) => c.id === id);
  if (!calculator) return { error: `Unknown calculator "${id}". Available: ${CALCULATOR_IDS.join(", ")}.` };
  const names = calculator.inputs instanceof z.ZodObject ? Object.keys(calculator.inputs.shape) : [];
  const extra = Object.keys(inputs).filter((key) => !names.includes(key));
  if (extra.length) return { error: `${id} has no input${extra.length > 1 ? "s" : ""} named ${extra.join(", ")}. Its inputs are: ${names.join(", ")}.` };
  return { calculator, names };
}

/**
 * A point's text on a chart's axis, from the name of the input that varies: a rate or percent reads
 * "8.5%", a number of years "10 y", anything else a plain number ("5,000,000"). Only names ending in
 * "years" read as years: perYear counts compoundings and yearlyDeposit is money.
 */
function axisLabel(name: string, x: number): string {
  if (/percent|rate/i.test(name)) return `${x}%`;
  if (/years$/i.test(name)) return `${x} y`;
  return x.toLocaleString("en-US");
}

/** The Widget tools for one widget: create them once for each widget drawn. */
export function createWidgetTools(options: WidgetToolOptions = {}): WidgetToolProvider {
  /** Tells onError, then answers the tool's empty result with the message. */
  function fail<K extends WidgetToolName>(tool: K, message: string): WidgetToolResults[K] {
    try {
      options.onError?.(tool, message);
    } catch {
      // A listener's own fault must not turn into a thrown tool.
    }
    return { ...structuredClone(EMPTY_RESULTS[tool]), error: message };
  }

  /** The tool's answer when something unexpected threw. */
  function crashed<K extends WidgetToolName>(tool: K, error: unknown): WidgetToolResults[K] {
    return fail(tool, `${tool} could not run: ${error instanceof Error ? error.message : String(error)}`);
  }

  const notBuilt =
    <K extends WidgetToolName>(tool: K) =>
    async (): Promise<WidgetToolResults[K]> =>
      fail(tool, "Not built yet");

  return {
    case_data: notBuilt("case_data"),

    async calculate(args) {
      try {
        const schema = WIDGET_TOOL_ARGS.calculate;
        const parsed = schema.safeParse(withNumbers(args, schema.shape));
        if (!parsed.success) return fail("calculate", argumentProblem("calculate", parsed.error));
        const { calculator: id, inputs, currency } = parsed.data;
        const found = findCalculator(id, inputs);
        if ("error" in found) return fail("calculate", found.error);
        const result = calculate(id, inputs, currency);
        if (!result.ok) return fail("calculate", result.error);
        return { rows: result.results.map(({ label, value, text }) => ({ label, value, text })), title: result.title };
      } catch (error) {
        return crashed("calculate", error);
      }
    },

    async calculate_range(args) {
      try {
        const schema = WIDGET_TOOL_ARGS.calculate_range;
        const parsed = schema.safeParse(withNumbers(args, schema.shape));
        if (!parsed.success) return fail("calculate_range", argumentProblem("calculate_range", parsed.error));
        const { calculator: id, inputs, vary, from, to, step, output, currency } = parsed.data;
        const found = findCalculator(id, inputs);
        if ("error" in found) return fail("calculate_range", found.error);
        if (!found.names.includes(vary)) return fail("calculate_range", `vary must be one of ${id}'s inputs: ${found.names.join(", ")}.`);
        if (to < from) return fail("calculate_range", `to (${to}) is below from (${from}): put the smaller number in from.`);
        // Inclusive of `to`, allowing for rounding in a fractional step (0 to 1 by 0.1 is 11 points).
        const count = Math.floor((to - from) / step + 1e-9) + 1;
        if (!(count <= MAX_RANGE_POINTS)) return fail("calculate_range", `From ${from} to ${to} by ${step} is more than ${MAX_RANGE_POINTS} points, so use a bigger step.`);

        const rows: RangeRow[] = [];
        let outputs: string[] | undefined;
        let chosen: string | undefined;
        let firstError: string | undefined;
        for (let i = 0; i < count; i++) {
          const x = Number((from + i * step).toFixed(10));
          const result = calculate(id, { ...inputs, [vary]: x }, currency);
          if (!result.ok) {
            firstError ??= result.error;
            continue;
          }
          if (!outputs) {
            outputs = result.results.map((r) => r.label);
            chosen = output === undefined ? outputs[0] : outputs.find((label) => label.toLowerCase() === output.toLowerCase());
            if (chosen === undefined) return fail("calculate_range", `output must be one of ${id}'s results: ${outputs.join(", ")}.`);
          }
          // A point with no finite answer (no doubling time at 0%) would break the chart's scale, so it is left out.
          const answer = result.results.find((r) => r.label === chosen);
          if (!answer || !Number.isFinite(answer.value)) {
            firstError ??= `${found.calculator.title} gives no finite answer at ${vary} ${x}.`;
            continue;
          }
          rows.push({ x, label: axisLabel(vary, x), value: answer.value, text: answer.text });
        }
        if (!rows.length || !outputs || chosen === undefined) return fail("calculate_range", firstError ?? `${id} gave no answer from ${from} to ${to}.`);
        return { rows, output: chosen, outputs };
      } catch (error) {
        return crashed("calculate_range", error);
      }
    },

    async annuity_schedule(args) {
      try {
        const schema = WIDGET_TOOL_ARGS.annuity_schedule;
        const parsed = schema.safeParse(withNumbers(args, schema.shape));
        if (!parsed.success) return fail("annuity_schedule", argumentProblem("annuity_schedule", parsed.error));
        // 1 to 60 yearly payments, as the AnnuityChart draws them.
        const payments = Math.max(1, Math.min(60, Math.round(parsed.data.payments)));
        const schedule = annuitySchedule({ ...parsed.data, payments });
        const values = [schedule.presentValue, ...schedule.rows.flatMap((r) => [r.payment, r.presentValue])];
        if (!values.every(Number.isFinite)) return fail("annuity_schedule", "These inputs give no finite schedule: keep ratePercent and growthPercent above -100.");
        return {
          // year counts from now, as the formula discounts it (the first payment is paid today); the label counts payments from 1.
          rows: schedule.rows.map((r) => ({ year: r.year, label: `Year ${r.year + 1}`, payment: r.payment, presentValue: r.presentValue })),
          presentValue: schedule.presentValue,
          presentValueText: formatUsd(schedule.presentValue),
        };
      } catch (error) {
        return crashed("annuity_schedule", error);
      }
    },
  };
}
