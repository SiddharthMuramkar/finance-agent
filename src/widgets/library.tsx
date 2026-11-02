"use client";

import {
  createLibrary,
  defineComponent,
  reactive,
  useStateField,
  type ComponentRenderProps,
} from "@openuidev/react-lang";
import { useEffect, useState } from "react";
import { z } from "zod/v4";
import type { CaseFigure } from "@/course/case-data";
import { annuitySchedule } from "@/finance/present-value";

// The OpenUI component library the Tutor writes widgets with. Charts take only
// inputs to a tested Finance Calculations formula, or a Case Data reference;
// no component accepts a series of numbers typed by the model.

const UNITS = ["percent", "years", "usd"] as const;
type Unit = (typeof UNITS)[number];

/** Short money format: $1.54 billion, $877.8 million. */
export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(abs >= 1e10 ? 1 : 3)} billion`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)} million`;
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function formatUnit(value: number, unit: Unit) {
  if (unit === "percent") return `${value}%`;
  if (unit === "years") return `${value} years`;
  return formatUsd(value);
}

const sliderProps = z.object({
  name: z.string().describe('Field name, e.g. "rate"'),
  label: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number(),
  value: reactive(z.number()),
  unit: z.enum(UNITS),
});

function SliderView({ props }: ComponentRenderProps<z.infer<typeof sliderProps>>) {
  const field = useStateField(props.name, props.value);
  const value = Number(field.value ?? props.min);
  return (
    <label className="block py-2">
      <span className="flex items-baseline justify-between text-sm">
        <span>
          {props.label} <span className="text-xs text-stone-500 dark:text-stone-400">(your assumption)</span>
        </span>
        <output className="font-medium tabular-nums">{formatUnit(value, props.unit)}</output>
      </span>
      <input
        type="range"
        aria-label={props.label}
        min={props.min}
        max={props.max}
        step={props.step}
        value={value}
        onChange={(e) => field.setValue(Number(e.target.value))}
        className="mt-2 w-full accent-teal-700 dark:accent-teal-400"
      />
    </label>
  );
}

const Slider = defineComponent({
  name: "Slider",
  description:
    "A labelled slider for one of the Learner's assumptions. Bind `value` to a $variable so charts that read it redraw at once, with no model call.",
  props: sliderProps,
  component: SliderView,
});

const figureCache = new Map<string, Promise<CaseFigure[]>>();

/** Fetches a Case's sourced figures through the server's hindsight rule. */
function useCaseFigure(reference: string | undefined): CaseFigure | null | undefined {
  const [figure, setFigure] = useState<CaseFigure | null | undefined>(undefined);
  useEffect(() => {
    if (!reference) return;
    const [caseId, figureId] = reference.split("/");
    let request = figureCache.get(caseId);
    if (!request) {
      request = fetch(`/api/case-data/${encodeURIComponent(caseId)}`).then((r) => (r.ok ? r.json() : []));
      figureCache.set(caseId, request);
    }
    let live = true;
    request.then(
      (figures) => live && setFigure(figures.find((f) => f.id === figureId) ?? null),
      () => live && setFigure(null),
    );
    return () => {
      live = false;
    };
  }, [reference]);
  return reference ? figure : null;
}

const chartProps = z.object({
  total: z.number().describe("Advertised total: the plain sum of all payments"),
  payments: z.number(),
  growthPercent: z.number(),
  ratePercent: z.number().describe("Discount rate in percent; usually a $variable bound to a Slider"),
  compareTo: z.string().optional(),
});

function AnnuityChartView({ props }: ComponentRenderProps<z.infer<typeof chartProps>>) {
  const figure = useCaseFigure(props.compareTo);
  // While a widget streams in, or a slider's $variable is not set yet, inputs can be missing.
  const inputs = [props.total, props.payments, props.growthPercent, props.ratePercent];
  if (!inputs.every((v) => typeof v === "number" && Number.isFinite(v))) {
    return <p className="py-6 text-sm text-stone-500 dark:text-stone-400">Drawing the chart…</p>;
  }
  const payments = Math.max(1, Math.min(60, Math.round(props.payments)));
  const { rows, presentValue } = annuitySchedule({ ...props, payments });
  const maxPayment = Math.max(...rows.map((r) => r.payment));
  const w = 600;
  const h = 180;
  const bar = w / rows.length;
  const y = (v: number) => h - (v / maxPayment) * (h - 10);
  return (
    <figure className="py-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Annuity payments and their present value"
        className="w-full"
      >
        {rows.map((r) => (
          <g key={r.year}>
            <rect
              x={r.year * bar + 1}
              y={y(r.payment)}
              width={bar - 2}
              height={h - y(r.payment)}
              className="fill-stone-300 dark:fill-stone-700"
            />
            <rect
              data-testid="pv-bar"
              x={r.year * bar + 1}
              y={y(r.presentValue)}
              width={bar - 2}
              height={h - y(r.presentValue)}
              className="fill-teal-700 transition-all duration-150 dark:fill-teal-400"
            />
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 space-y-1 text-sm">
        <p className="flex flex-wrap gap-x-4 text-xs text-stone-500 dark:text-stone-400">
          <span>
            <span className="mr-1 inline-block size-2 bg-stone-300 dark:bg-stone-700" />
            Payment in its year
          </span>
          <span>
            <span className="mr-1 inline-block size-2 bg-teal-700 dark:bg-teal-400" />
            Worth today at {props.ratePercent}%
          </span>
        </p>
        <p>
          Sum of payments: <span className="tabular-nums">{formatUsd(props.total)}</span>
        </p>
        <p>
          Present value at {props.ratePercent}% (your assumption):{" "}
          <strong data-testid="pv-total" className="tabular-nums">
            {formatUsd(presentValue)}
          </strong>
        </p>
        {figure && (
          <>
            <p>
              {figure.label}: <strong className="tabular-nums">{formatUsd(figure.value)}</strong>{" "}
              <span className="text-xs text-stone-500 dark:text-stone-400">
                (sourced: {figure.source}, {figure.date})
              </span>
            </p>
            {/* Today's value of the payments beside the sourced figure, on one scale. */}
            <svg viewBox="0 0 600 44" role="img" aria-label={`Present value compared with ${figure.label}`} className="w-full">
              {[
                { v: presentValue, y: 2, cls: "fill-teal-700 dark:fill-teal-400", testId: "pv-compare-bar" },
                { v: figure.value, y: 24, cls: "fill-amber-600 dark:fill-amber-400", testId: "sourced-bar" },
              ].map((b) => (
                <rect
                  key={b.testId}
                  data-testid={b.testId}
                  x={0}
                  y={b.y}
                  height={18}
                  width={(600 * b.v) / Math.max(props.total, figure.value)}
                  className={`${b.cls} transition-all duration-150`}
                />
              ))}
            </svg>
          </>
        )}
        {figure === null && props.compareTo && (
          <p className="text-xs text-stone-500 dark:text-stone-400">
            No sourced figure is available for this comparison.
          </p>
        )}
      </figcaption>
    </figure>
  );
}

const AnnuityChart = defineComponent({
  name: "AnnuityChart",
  description:
    'Bars for each yearly payment of an annuity that grows at a fixed rate (first payment now) and what each is worth today, computed by the tested present value formula from these inputs. `compareTo` optionally draws a sourced Case Data figure as a bar beside the present value, written "caseId/figureId".',
  props: chartProps,
  component: AnnuityChartView,
});

const Widget = defineComponent({
  name: "Widget",
  description: "The widget's frame: a short title above its controls and charts, in order.",
  props: z.object({
    title: z.string(),
    children: z.array(z.union([Slider.ref, AnnuityChart.ref])),
  }),
  component: ({ props, renderNode }) => (
    <section className="rounded-lg border border-stone-300 p-4 dark:border-stone-700">
      <h3 className="mb-2 font-medium">{props.title}</h3>
      {renderNode(props.children)}
    </section>
  ),
});

export const widgetLibrary = createLibrary({ components: [Widget, Slider, AnnuityChart], root: "Widget" });

/** Options for the widget instructions frozen into the Tutor's instructions. */
export const WIDGET_PROMPT_OPTIONS = {
  preamble:
    "Widgets: you can put one interactive widget beside the conversation by writing it in openui-lang, a small UI language, inside a fenced block. Everything outside the fence is your ordinary prose to the Learner.",
  inlineMode: true,
  bindings: true,
  builtinFunctions: false,
  examples: [
    `root = Widget("What the annuity is worth today", [rate, chart])
$rate = 3
rate = Slider("rate", "Discount rate", 0, 10, 0.25, $rate, "percent")
chart = AnnuityChart(1537000000, 30, 5, $rate, "mega-millions-2018/cash-option")`,
  ],
  additionalRules: [
    "Each openui-lang block is a complete widget: always write every statement, starting with root = Widget(...). Never write a partial patch of an earlier widget.",
    "Widgets are optional. Add one only when playing with numbers helps the current Teaching Step, and at most one per reply.",
    "Charts never take data series. Give a chart the inputs to its formula, or a Case Data reference; never type historical figures you were not given.",
    "Starting numbers you put in a Slider or chart must come from the Case material code sent you.",
    "Before the reveal step, never put a Case's outcome in a widget.",
    "After the widget, keep teaching in plain prose: the Learner sees the widget beside the conversation.",
  ],
};
