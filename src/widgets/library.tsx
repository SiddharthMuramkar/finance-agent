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
import type { CaseData, CaseDataset } from "@/case-data/case-data";
import { AnnuityFigure, AssumptionTag, formatUsd, HistoryFigure } from "./case-data-view";

// The OpenUI component library the Tutor writes widgets with. Charts take only
// inputs to a tested Finance Calculations formula, or a Case Data reference
// ("caseId/datasetId") fetched through the server's as-of rule; no component
// accepts a series of numbers typed by the model.

const UNITS = ["percent", "years", "usd"] as const;
type Unit = (typeof UNITS)[number];

export { formatUsd };

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
          <AssumptionTag />
          {props.label}
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

type Loaded = { data: CaseData; dataset: CaseDataset } | null | undefined;

/**
 * Fetches one Case Data dataset, written "caseId/datasetId", through the server's as-of rule.
 * Undefined while loading; null when there is no such dataset (or it is withheld until the reveal).
 * Fetched on each mount, so a widget drawn after the reveal gets the full data.
 */
function useCaseDataset(reference: string | undefined): Loaded {
  const [loaded, setLoaded] = useState<Loaded>(undefined);
  useEffect(() => {
    if (!reference) return;
    const [caseId, datasetId] = reference.split("/");
    let live = true;
    fetch(`/api/case-data/${encodeURIComponent(caseId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<CaseData>) : null))
      .then(
        (data) => {
          const dataset = data?.datasets.find((d) => d.id === datasetId);
          if (live) setLoaded(data && dataset ? { data, dataset } : null);
        },
        () => live && setLoaded(null),
      );
    return () => {
      live = false;
    };
  }, [reference]);
  return reference ? loaded : null;
}

function Missing({ reference }: { reference: string }) {
  return (
    <p className="py-2 text-sm text-stone-500 dark:text-stone-400">
      No sourced data is available for {reference}. It may not exist, or it is withheld until the reveal.
    </p>
  );
}

const chartProps = z.object({
  total: z.number().describe("Advertised total: the plain sum of all payments"),
  payments: z.number(),
  growthPercent: z.number(),
  ratePercent: z.number().describe("Discount rate in percent; usually a $variable bound to a Slider"),
  compareTo: z.string().optional(),
});

function AnnuityChartView({ props }: ComponentRenderProps<z.infer<typeof chartProps>>) {
  const loaded = useCaseDataset(props.compareTo);
  // While a widget streams in, or a slider's $variable is not set yet, inputs can be missing.
  const inputs = [props.total, props.payments, props.growthPercent, props.ratePercent];
  if (!inputs.every((v) => typeof v === "number" && Number.isFinite(v))) {
    return <p className="py-6 text-sm text-stone-500 dark:text-stone-400">Drawing the chart…</p>;
  }
  return (
    <>
      <AnnuityFigure inputs={props} sourced={loaded?.dataset} />
      {loaded === null && props.compareTo && <Missing reference={props.compareTo} />}
    </>
  );
}

const AnnuityChart = defineComponent({
  name: "AnnuityChart",
  description:
    'Bars for each yearly payment of an annuity that grows at a fixed rate (first payment now) and what each is worth today, computed by the tested present value formula from these inputs. `compareTo` optionally shows a sourced Case Data figure (the latest point of a dataset) beside the present value, as a reference "caseId/datasetId".',
  props: chartProps,
  component: AnnuityChartView,
});

const historyProps = z.object({
  dataset: z.string().describe('A Case Data reference, "caseId/datasetId", from the list code sent you'),
});

function HistoryChartView({ props }: ComponentRenderProps<z.infer<typeof historyProps>>) {
  const loaded = useCaseDataset(props.dataset);
  if (!props.dataset) return null;
  if (loaded === undefined) return <p className="py-6 text-sm text-stone-500 dark:text-stone-400">Fetching sourced data…</p>;
  if (loaded === null) return <Missing reference={props.dataset} />;
  return <HistoryFigure dataset={loaded.dataset} revealed={loaded.data.revealed} asOf={loaded.data.asOf} />;
}

const HistoryChart = defineComponent({
  name: "HistoryChart",
  description:
    "A line chart of one checked Case Data dataset over its dates, with its source. It takes only the dataset's reference; the values come from the server, which withholds anything dated after the Case's as-of date until the reveal.",
  props: historyProps,
  component: HistoryChartView,
});

const Widget = defineComponent({
  name: "Widget",
  description: "The widget's frame: a short title above its controls and charts, in order.",
  props: z.object({
    title: z.string(),
    children: z.array(z.union([Slider.ref, AnnuityChart.ref, HistoryChart.ref])),
  }),
  component: ({ props, renderNode }) => (
    <section className="rounded-lg border border-stone-300 p-4 dark:border-stone-700">
      <h3 className="mb-2 font-medium">{props.title}</h3>
      {renderNode(props.children)}
    </section>
  ),
});

export const widgetLibrary = createLibrary({ components: [Widget, Slider, AnnuityChart, HistoryChart], root: "Widget" });

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
    `root = Widget("Long-term interest rates around the draw", [history])
history = HistoryChart("mega-millions-2018/treasury-30-year")`,
  ],
  additionalRules: [
    "Each openui-lang block is a complete widget: always write every statement, starting with root = Widget(...). Never write a partial patch of an earlier widget.",
    "Widgets are optional. Add one only when playing with numbers helps the current Teaching Step, and at most one per reply.",
    "Charts never take data series. Give a chart the inputs to its formula, or a Case Data reference from the list code sent you; never type historical figures you were not given.",
    "If no Case Data covers what the Learner wants to see, draw no chart for it and say plainly that the data is not available.",
    "Starting numbers you put in a Slider or chart must come from the Case material code sent you.",
    "Before the reveal step, never put a Case's outcome in a widget.",
    "After the widget, keep teaching in plain prose: the Learner sees the widget beside the conversation.",
  ],
};
