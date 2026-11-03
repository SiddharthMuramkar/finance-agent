"use client";

import {
  createLibrary,
  defineComponent,
  reactive,
  useIsStreaming,
  useStateField,
  type ComponentGroup,
  type ComponentRenderProps,
  type PromptOptions,
} from "@openuidev/react-lang";
// The package root, not "/genui-lib": that entry bundles its own theme context, so GenuiTheme's
// colours would never reach its charts.
import { openuiLibrary } from "@openuidev/react-ui";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { z } from "zod/v4";
import type { CaseData, CaseDataset } from "@/case-data/case-data";
import { calculate, CALCULATOR_IDS, formatMoney } from "@/finance/calculators";
import { FORMULAS, formulaById } from "@/finance/formulas";
import { AnnuityFigure, AssumptionTag, formatUsd, HistoryFigure } from "./case-data-view";
import { FormulaFigure, type CardValue } from "./formula-card-view";
import { useCaseLoad } from "./case-data-provider";
import { advanceReached, savedReached, walkNodes } from "./guided-tasks";
import { SavedTicksContext } from "./saved-ticks";
import { readingValue, settledValue, sliderStep, snappedValue, steppedValue, typedValue, type SliderRange } from "./slider-steps";
import { GuidedTasksFigure } from "./guided-tasks-view";
import { WIDGET_TOOL_SPECS } from "./tool-specs";

// The OpenUI component library the Tutor writes widgets with: OpenUI's ready-made kit (charts,
// tables, tabs, callouts) beside our own code-backed parts (Slider, Calculator, AnnuityChart,
// HistoryChart, FormulaCard, GuidedTasks). Real figures reach a widget only through our parts or
// the Widget tools (tool-specs.ts), which work them out or fetch them in the browser; typed numbers
// are only for an Illustration, whose title says so.

const UNITS = ["percent", "years", "usd", "inr"] as const;
type Unit = (typeof UNITS)[number];

export { formatUsd };

function formatUnit(value: number, unit: Unit) {
  if (unit === "percent") return `${value}%`;
  if (unit === "years") return `${value} years`;
  if (unit === "inr") return formatMoney(value, "inr");
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

const stepButton =
  "h-7 w-7 shrink-0 rounded border border-[var(--border)] text-sm leading-none hover:bg-[var(--field)] disabled:opacity-40";

/**
 * A slider with a number box and −/+ buttons, so the Learner can set an exact value. The rules for what
 * values it takes live in slider-steps.ts. The number box keeps what is being typed until Enter or leaving
 * the box, so typing 3.38 never passes through 3 and 3.3 (which could tick a Guided Task on the way).
 */
function SliderView({ props }: ComponentRenderProps<z.infer<typeof sliderProps>>) {
  const field = useStateField(props.name, props.value);
  const [draft, setDraft] = useState<string | null>(null);
  const value = Number(field.value ?? props.min);
  const set = (next: number) => field.setValue(settledValue(next, props));
  const commit = () => {
    if (draft === null) return;
    const typed = typedValue(draft, props);
    if (typed !== null) field.setValue(typed);
    setDraft(null);
  };
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>
          <AssumptionTag />
          {props.label}
        </span>{" "}
        <output className="font-medium tabular-nums">{formatUnit(readingValue(value), props.unit)}</output>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${props.label} by one step`}
          disabled={value <= props.min}
          onClick={() => field.setValue(steppedValue(value, -1, props))}
          className={stepButton}
        >
          −
        </button>
        <input
          type="range"
          aria-label={props.label}
          min={props.min}
          max={props.max}
          step={sliderStep(props)}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[var(--you)]"
        />
        <button
          type="button"
          aria-label={`Increase ${props.label} by one step`}
          disabled={value >= props.max}
          onClick={() => field.setValue(steppedValue(value, 1, props))}
          className={stepButton}
        >
          +
        </button>
        <input
          type="number"
          inputMode="decimal"
          aria-label={`${props.label}, exact value`}
          min={props.min}
          max={props.max}
          step="any"
          value={draft ?? String(readingValue(value))}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          className="w-20 shrink-0 rounded border border-[var(--border)] bg-[var(--field)] px-1.5 py-0.5 text-right text-sm tabular-nums"
        />
      </div>
    </div>
  );
}

const Slider = defineComponent({
  name: "Slider",
  description:
    "A labelled slider for one of the Learner's assumptions. Bind `value` to a $variable so charts that read it redraw at once, with no model call. In Slider(name, label, min, max, step, value, unit) the Learner can set any number from min to max, on steps of `step` counted from min; the starting value sits on a step. A percent slider always moves in 0.01 steps, whatever step is written, so write 0.01 as a rate's step.",
  props: sliderProps,
  component: SliderView,
});

type Loaded = { data: CaseData; dataset: CaseDataset } | null | undefined;

/**
 * Fetches one Case Data dataset, written "caseId/datasetId", through the server's as-of rule.
 * Undefined while loading; null when there is no such dataset (or it is withheld until the reveal).
 * Read through the page's shared Case Data cache: one request per Case, made afresh after each Tutor turn.
 */
function useCaseDataset(reference: string | undefined): Loaded {
  const loadCase = useCaseLoad();
  const [loaded, setLoaded] = useState<Loaded>(undefined);
  useEffect(() => {
    if (!reference) return;
    const [caseId, datasetId] = reference.split("/");
    let live = true;
    void loadCase(caseId).then((data) => {
      const dataset = data?.datasets.find((d) => d.id === datasetId);
      if (live) setLoaded(data && dataset ? { data, dataset } : null);
    });
    return () => {
      live = false;
    };
  }, [reference, loadCase]);
  return reference ? loaded : null;
}

function Missing({ reference }: { reference: string }) {
  return (
    <p className="py-2 text-sm text-[var(--muted)]">
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
    return <p className="py-6 text-sm text-[var(--muted)]">Drawing the chart…</p>;
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
  if (loaded === undefined) return <p className="py-6 text-sm text-[var(--muted)]">Fetching sourced data…</p>;
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

const calculatorProps = z.object({
  calculator: z.string().describe(`One of: ${CALCULATOR_IDS.join(", ")}`),
  inputs: z.record(z.string(), z.number()).describe("The calculator's inputs by name, e.g. {principal: $amount, ratePercent: $rate, years: 20}; use $variables bound to Sliders for what the Learner may change"),
  currency: z.enum(["usd", "inr"]).optional(),
});

function CalculatorView({ props }: ComponentRenderProps<z.infer<typeof calculatorProps>>) {
  const inputs = props.inputs ?? {};
  // While a widget streams in, or a slider's $variable is not set yet, inputs can be missing or not numbers.
  if (Object.values(inputs).some((v) => typeof v !== "number" || !Number.isFinite(v))) {
    return <p className="py-6 text-sm text-[var(--muted)]">Working it out…</p>;
  }
  const result = calculate(props.calculator, inputs, props.currency);
  if (!result.ok) {
    return (
      <p role="status" className="py-2 text-sm text-[var(--muted)]">
        This calculator could not run: {result.error}
      </p>
    );
  }
  return (
    <div className="py-2" data-testid="calculator">
      <p data-kind="assumption" className="rounded-md border-l-4 border-[var(--you-line)] bg-[var(--you-tint)] p-2 text-sm">
        <AssumptionTag />
        {result.title}
      </p>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        {result.results.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-[var(--muted)]">{r.label}</dt>
            <dd className="text-right font-medium tabular-nums">{r.text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const Calculator = defineComponent({
  name: "Calculator",
  description:
    "The answer from one of our tested finance calculators (loans, SIP, PPF, deposits, bonds, dividend models), computed from these inputs by the same code as the calculate tool, in rupees with lakh and crore or dollars. Inputs may be $variables bound to Sliders, whose names must match the calculator's input names. Inputs are numbers only, so npv, irr and dcf, which take a list of cash flows, cannot run here.",
  props: calculatorProps,
  component: CalculatorView,
});

const formulaCardProps = z.object({
  formula: z.string().describe(`A formula ID from the list code sent you; one of: ${FORMULAS.map((f) => f.id).join(", ")}`),
  inputs: z
    .record(z.string(), z.number())
    .describe("The Learner's assumptions by symbol key, each a $variable bound to a Slider in this widget, e.g. {ratePercent: $rate}"),
  sourced: z
    .record(z.string(), z.string())
    .describe('Symbols taken from Case Data by symbol key, each a reference "caseId/datasetId" (its latest point is used), e.g. {amount: "mega-millions-2018/cash-option"}; {} for none'),
  fixed: z.record(z.string(), z.number()).describe("Symbols held at a fixed number by symbol key, e.g. {years: 5}; {} for none"),
});

type SourcedValues = Record<string, CardValue | null> | undefined;

/**
 * Fetches the latest point of each sourced dataset ("caseId/datasetId") through the server's as-of rule.
 * Undefined while loading; a key is null when its dataset is missing or withheld until the reveal.
 */
function useSourcedValues(refs: Record<string, string>): SourcedValues {
  const loadCase = useCaseLoad();
  const wanted = JSON.stringify(refs);
  const [loaded, setLoaded] = useState<{ wanted: string; values: Record<string, CardValue | null> } | undefined>(undefined);
  useEffect(() => {
    const entries = Object.entries(JSON.parse(wanted) as Record<string, string>);
    if (!entries.length) return;
    let live = true;
    const caseIds = [...new Set(entries.map(([, ref]) => ref.split("/")[0]))];
    void Promise.all(caseIds.map((caseId) => loadCase(caseId))).then((cases) => {
      if (!live) return;
      const values = Object.fromEntries(
        entries.map(([key, ref]): [string, CardValue | null] => {
          const [caseId, datasetId] = ref.split("/");
          const dataset = cases[caseIds.indexOf(caseId)]?.datasets.find((d) => d.id === datasetId);
          const point = dataset?.points.at(-1);
          if (!dataset || !point) return [key, null];
          return [key, { value: point.value, from: "sourced", credit: { source: dataset.source, sourceUrl: dataset.sourceUrl, date: point.date } }];
        }),
      );
      setLoaded({ wanted, values });
    });
    return () => {
      live = false;
    };
  }, [wanted, loadCase]);
  return Object.keys(refs).length === 0 ? {} : loaded?.wanted === wanted ? loaded.values : undefined;
}

function FormulaCardView({ props }: ComponentRenderProps<z.infer<typeof formulaCardProps>>) {
  const formula = formulaById(props.formula);
  const sourced = useSourcedValues(props.sourced ?? {});
  if (!formula) return <p className="py-2 text-sm text-[var(--muted)]">No formula called {props.formula} is available.</p>;
  const values: Record<string, CardValue> = {};
  for (const [key, value] of Object.entries(props.fixed ?? {})) values[key] = { value, from: "fixed" };
  for (const [key, value] of Object.entries(props.inputs ?? {})) values[key] = { value, from: "assumption" };
  for (const [key, value] of Object.entries(sourced ?? {})) if (value) values[key] = value;
  // While a widget streams in, a slider's $variable is not set yet, or sourced data is still arriving, values can be missing.
  const complete = formula.symbols.every((s) => typeof values[s.key]?.value === "number" && Number.isFinite(values[s.key].value));
  if (sourced === undefined || !complete) {
    const withheld = sourced && Object.entries(sourced).find(([, v]) => v === null);
    return (
      <p className="py-6 text-sm text-[var(--muted)]">
        {withheld ? `No sourced data is available for ${props.sourced[withheld[0]]}. It may not exist, or it is withheld until the reveal.` : "Working it out…"}
      </p>
    );
  }
  return <FormulaFigure formula={formula} values={values} />;
}

const FormulaCard = defineComponent({
  name: "FormulaCard",
  description:
    "A Formula Card: a named formula from our formula registry with every symbol named in plain words and its unit, the numbers filled in live, and the result worked out by the tested calculator behind it. Every symbol must be given exactly once, under `inputs` (the Learner's assumptions, each a $variable bound to a Slider), `sourced` (Case Data references) or `fixed` (fixed numbers). Never type a formula as text: show it with this card.",
  props: formulaCardProps,
  component: FormulaCardView,
});

const guidedTaskProps = z.object({
  text: z.string().describe('The instruction, e.g. "Set the rate to 0%"'),
  done: z
    .boolean()
    .describe("A condition that reads a $variable bound to a Slider in this widget, e.g. $rate == 0 or $rate >= 3 && $rate <= 4; the task ticks itself when it holds"),
});

const GuidedTask = defineComponent({
  name: "GuidedTask",
  description: "One Guided Task: a short instruction and the condition that completes it. Use it only inside GuidedTasks.",
  props: guidedTaskProps,
  component: () => null,
});

const guidedTasksProps = z.object({
  tasks: z.array(GuidedTask.ref).describe("The tasks in the order the Learner should do them"),
});

function GuidedTasksView({ props }: ComponentRenderProps<z.infer<typeof guidedTasksProps>>) {
  const tasks = (Array.isArray(props.tasks) ? props.tasks : []).map((t) => {
    const p = (t as { props?: { text?: unknown; done?: unknown } } | null)?.props;
    return { text: typeof p?.text === "string" ? p.text : "", done: p?.done === true };
  });
  const texts = tasks.map((t) => t.text);
  // Ticks saved with the Session (Widget state) come back on a reload or a tab switch.
  const saved = useContext(SavedTicksContext);
  const fromSaved = savedReached(texts, saved?.ticked ?? []);
  // Ticks stick: the count only grows, so moving a slider away again never unticks a task.
  const [reached, setReached] = useState(fromSaved);
  const now = advanceReached(Math.max(reached, fromSaved), tasks.map((t) => t.done));
  if (now !== reached) setReached(now);
  const doneKey = texts.slice(0, now).join("\n");
  const onTicked = saved?.onTicked;
  const unsaved = now > fromSaved;
  useEffect(() => {
    if (onTicked && unsaved && doneKey) onTicked(doneKey.split("\n"));
  }, [onTicked, unsaved, doneKey]);
  return <GuidedTasksFigure tasks={texts} reached={now} />;
}

const GuidedTasks = defineComponent({
  name: "GuidedTasks",
  description:
    "Guided Tasks under a widget: small practice steps (to do, current, done) that tick themselves, in order, when the Learner's sliders reach the state each GuidedTask describes. Practice only: never marked or saved.",
  props: guidedTasksProps,
  component: GuidedTasksView,
});

/**
 * Kit parts the Tutor may not use: images (it could invent links), code and markdown blocks (they show
 * typed formulas, which ADR 0002 forbids), forms, inputs, buttons, modals, carousels and the card building
 * blocks. They go in one call: removing one at a time throws while a parent still names it. Icon stays,
 * as the only type a ChipItem's icon takes.
 */
const DROPPED_KIT_PARTS = [
  "Image",
  "ImageBlock",
  "ImageGallery",
  "CodeBlock",
  "MarkDownRenderer",
  "EditableTable",
  "Form",
  "Input",
  "TextArea",
  "DatePicker",
  "CheckBoxGroup",
  "CheckBoxItem",
  "RadioGroup",
  "RadioItem",
  "OptionCard",
  "OptionCards",
  "Button",
  "Buttons",
  "IconButton",
  "Carousel",
  "Modal",
  "ListBlock",
  "ListItem",
  "Text",
  "BoldText",
  "IconText",
  "ImageText",
  "ImageTextLarge",
  "MetricIndicatorInline",
  "MetricIndicatorWithStrikethrough",
  "SnippetCardItem",
  "SnippetCardBlock",
  "OverviewCardItem",
  "OverviewCardBlock",
  "ContextCardItem",
  "ContextCardBlock",
  "CompositeCardItem",
  "CompositeCardBlock",
  "VisualCardItem",
  "VisualCardBlock",
];

/** Our parts the kit's containers list as their content; Stack already takes any part. */
const OUR_PARTS = [AnnuityChart, HistoryChart, Calculator, FormulaCard, GuidedTasks];

/**
 * OpenUI's kit with our parts in its containers. Our Slider replaces the kit's (same name), so every slider
 * keeps its "Your assumption" tag and saved settings. Made once, at module scope: parsers are cached per library.
 */
const kit = openuiLibrary.extend({
  components: {
    remove: DROPPED_KIT_PARTS,
    override: [Slider],
    add: [...OUR_PARTS.map((component) => ({ component, slots: ["Card.children", "TabItem.content", "AccordionItem.content"] })), GuidedTask],
  },
});

/** A part of the composed kit by name, as the kit rebuilt it; throws on a name it does not have. */
function kitPart(name: string) {
  const part = kit.components[name];
  if (!part) throw new Error(`The widget library has no part called ${name}.`);
  return part;
}

/** What a Widget holds directly: our parts, then the kit's. Sub-parts (TabItem, Series, Col, SelectItem…) go inside these. */
const WIDGET_PARTS = [
  ...["Slider", ...OUR_PARTS.map((c) => c.name)],
  ...["Stack", "Tabs", "Accordion", "Steps", "Separator"],
  ...["Card", "CardHeader", "TextContent", "Callout", "TextCallout", "InlineHeader"],
  "Table",
  ...["LineChart", "AreaChart", "BarChart", "HorizontalBarChart", "RadarChart", "PieChart", "RadialChart", "SingleStackedBarChart", "ScatterChart"],
  ...["FormControl", "Label", "Select", "SwitchGroup", "Chips"],
  ...["Tag", "TagBlock", "EntityList"],
];

const Widget = defineComponent({
  name: "Widget",
  description: 'The widget\'s frame: a short title above its parts, in order. The title of a widget drawn from made-up numbers starts with "Illustration:".',
  props: z.object({
    title: z.string(),
    children: z.array(z.union(WIDGET_PARTS.map((name) => kitPart(name).ref))),
  }),
  component: WidgetFrame,
});

/** False inside a card that already draws the frame (the Widget panel), so the Widget adds no second border. */
export const WidgetBorderContext = createContext(true);

/**
 * The starting numbers the Widget's code declares (`$rate = 5`), by `$variable`: what Reset goes back to, even when
 * the Widget opened at values saved with the Session. Empty where it is not given; Reset then uses the first value.
 */
export const StartingValuesContext = createContext<Record<string, number>>({});

type SliderNode = SliderRange & { name: string; value: unknown; target: string };

/** The Widget's sliders at any depth (in a Stack, a Card or a tab not showing), one per bound $variable. */
function widgetSliders(children: unknown): SliderNode[] {
  const byTarget = new Map<string, SliderNode>();
  for (const node of walkNodes(children)) {
    if (node.typeName !== "Slider") continue;
    const { name, value, min, max, step, unit } = node.props;
    const target = (value as { target?: unknown } | null)?.target;
    if (typeof target !== "string" || typeof name !== "string") continue;
    if (typeof min !== "number" || typeof max !== "number" || typeof step !== "number") continue;
    if (!byTarget.has(target)) byTarget.set(target, { name, value, min, max, step, unit: typeof unit === "string" ? unit : undefined, target });
  }
  return [...byTarget.values()];
}

/**
 * Remembers one slider's starting value once the finished Widget sets it, moved onto a step, and offers a
 * way back to it for Reset. The starting value is the one the code declares, so a Widget that opened at its saved
 * Widget state still resets to it. Drawn by the frame rather than the slider, so a slider in a tab not showing
 * still resets.
 */
function SliderStart({ slider, resets }: { slider: SliderNode; resets: Map<string, () => void> }) {
  const field = useStateField(slider.name, slider.value);
  const streaming = useIsStreaming();
  const declared = useContext(StartingValuesContext)[slider.target];
  const start = useRef<number | null>(null);
  const current = field.value;
  useEffect(() => {
    if (streaming || start.current !== null || typeof current !== "number" || !Number.isFinite(current)) return;
    start.current = snappedValue(typeof declared === "number" && Number.isFinite(declared) ? declared : current, slider);
    const onStep = snappedValue(current, slider);
    if (onStep !== current) field.setValue(onStep);
  });
  useEffect(() => {
    resets.set(slider.target, () => {
      if (start.current !== null) field.setValue(start.current);
    });
    return () => {
      resets.delete(slider.target);
    };
  });
  return null;
}

function WidgetFrame({ props, renderNode }: ComponentRenderProps<{ title: string; children: unknown }>) {
  const bordered = useContext(WidgetBorderContext);
  const sliders = widgetSliders(props.children);
  const [resets] = useState(() => new Map<string, () => void>());
  return (
    <section className={bordered ? "rounded-lg border border-[var(--border)] p-4" : ""}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="font-medium">{props.title}</h3>
        {sliders.length > 0 && (
          <button
            type="button"
            title="Put every slider back to its starting value"
            onClick={() => resets.forEach((reset) => reset())}
            className="shrink-0 rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--field)]"
          >
            Reset
          </button>
        )}
      </div>
      {sliders.map((slider) => (
        <SliderStart key={slider.target} slider={slider} resets={resets} />
      ))}
      {renderNode(props.children)}
    </section>
  );
}

/**
 * How the widget instructions group the parts, with our own notes (not the kit's, which teach forms,
 * modals and writes). Every part of the library is in one group, so none is listed under "Other".
 */
export const WIDGET_COMPONENT_GROUPS: ComponentGroup[] = [
  {
    name: "Widget",
    components: ["Widget"],
    notes: [
      '- Widget("Title", [parts]) is the root of every widget. The panel already frames it, so lay its parts out with Stack (Stack([a, b], "row") puts two side by side), never with an outer Card.',
    ],
  },
  {
    name: "Our parts: numbers from code",
    components: ["Slider", "Calculator", "AnnuityChart", "HistoryChart", "FormulaCard", "GuidedTasks", "GuidedTask"],
    notes: ["- These work out or fetch their own numbers: give them inputs, a formula ID or a Case Data reference, never a result."],
  },
  {
    name: "Layout",
    components: ["Stack", "Tabs", "TabItem", "Accordion", "AccordionItem", "Steps", "StepsItem", "Separator"],
    notes: [
      '- Use Tabs for two views of the same numbers, such as a chart and a table: Tabs([TabItem("chart", "Chart", [chart]), TabItem("table", "Table", [table])]). Keep Sliders above the Tabs, so one slider moves both views.',
      "- Steps lists the stages of a method in words; it works nothing out.",
    ],
  },
  {
    name: "Content",
    components: ["Card", "CardHeader", "TextContent", "Callout", "TextCallout", "InlineHeader"],
    notes: [
      "- Card groups parts inside the Widget, for example two Cards side by side in a row Stack.",
      "- Keep text short. A number in TextContent or a Callout comes from a tool result (r.rows.text) or an expression the widget works out, such as (5.5 - 5) * 100.",
    ],
  },
  {
    name: "Tables",
    components: ["Table", "Col"],
    notes: ['- Table is column by column: Table([Col("Year", s.rows.label), Col("Payment", s.rows.payment, "number")]). A tool result\'s rows.text holds each number written in its unit.'],
  },
  {
    name: "Charts",
    components: ["LineChart", "AreaChart", "BarChart", "HorizontalBarChart", "RadarChart", "Series", "PieChart", "RadialChart", "SingleStackedBarChart", "Slice", "ScatterChart", "ScatterSeries", "Point"],
    notes: [
      "- Chart labels must be strings: use a tool result's rows.label or rows.date, never rows.x. The values come from rows.value, or another number column such as rows.payment.",
      '- Pluck a column from a tool result with dot access: d.rows.value is every row\'s value, as in LineChart(d.rows.date, [Series("Close", d.rows.value)]).',
      "- Line and area charts show change over time or across a range; bar charts compare a few cases; PieChart shows only the shares of one whole.",
    ],
  },
  {
    name: "Controls",
    components: ["FormControl", "Label", "Select", "SelectItem", "SwitchGroup", "SwitchItem", "Chips", "ChipItem"],
    notes: [
      '- A number the Learner changes is always a Slider. Select, SwitchGroup and Chips choose between named options: a Select\'s $variable holds text, so compare it ($view == "real") rather than pass it to a tool as a number.',
    ],
  },
  {
    name: "Data display",
    components: ["Tag", "TagBlock", "EntityList", "Icon"],
  },
];

export const widgetLibrary = createLibrary({ root: "Widget", componentGroups: WIDGET_COMPONENT_GROUPS, components: [Widget, ...Object.values(kit.components)] });

/**
 * Options for the widget instructions frozen into the Tutor's instructions. With tools set, OpenUI prints
 * both `examples` (our parts) and `toolExamples` (widgets whose numbers come from the Widget tools).
 */
export const WIDGET_PROMPT_OPTIONS = {
  preamble:
    "Widgets: you can put one interactive widget beside the conversation by writing it in openui-lang, a small UI language, inside a fenced block. Everything outside the fence is your ordinary prose to the Learner.",
  inlineMode: true,
  tools: WIDGET_TOOL_SPECS,
  toolCalls: true,
  bindings: true,
  builtinFunctions: true,
  examples: [
    `root = Widget("What the annuity is worth today", [rate, chart, steps])
$rate = 3
rate = Slider("rate", "Discount rate", 0, 10, 0.01, $rate, "percent")
chart = AnnuityChart(1537000000, 30, 5, $rate, "mega-millions-2018/cash-option")
steps = GuidedTasks([zero])
zero = GuidedTask("Set the rate to 0%", $rate == 0)`,
    `root = Widget("Long-term interest rates around the draw", [history])
history = HistoryChart("mega-millions-2018/treasury-30-year")`,
    `root = Widget("What a home loan costs", [amount, rate, calc, steps])
$amount = 5000000
$rate = 8.5
amount = Slider("principal", "Loan amount", 500000, 20000000, 100000, $amount, "inr")
rate = Slider("ratePercent", "Interest rate", 5, 14, 0.01, $rate, "percent")
calc = Calculator("emi", {principal: $amount, ratePercent: $rate, years: 20})
steps = GuidedTasks([double])
double = GuidedTask("Double the loan to 1 crore", $amount == 10000000)`,
    `root = Widget("What a payment in five years is worth today", [rate, card, steps])
$rate = 5
rate = Slider("rate", "Discount rate", 0, 15, 0.01, $rate, "percent")
card = FormulaCard("present-value", {ratePercent: $rate}, {amount: "mega-millions-2018/cash-option"}, {years: 5})
steps = GuidedTasks([ten])
ten = GuidedTask("Set the rate to 10%", $rate == 10)`,
    `root = Widget("What a home loan costs at different rates", [rate, calc, steps])
$rate = 8.5
rate = Slider("ratePercent", "Interest rate", 5, 14, 0.01, $rate, "percent")
calc = Calculator("emi", {principal: 5000000, ratePercent: $rate, years: 20})
steps = GuidedTasks([low, high])
low = GuidedTask("Set the rate to 6%", $rate == 6)
high = GuidedTask("Now set it to 12%", $rate == 12)`,
  ],
  toolExamples: [
    `root = Widget("The Sensex at its milestones", [tabs])
sensex = Query("case_data", {dataset: "sensex-1992/sensex-close"}, {rows: []})
tabs = Tabs([chartTab, tableTab])
chartTab = TabItem("chart", "Chart", [line])
tableTab = TabItem("table", "Table", [table])
line = LineChart(sensex.rows.date, [Series("Sensex close", sensex.rows.value)], "linear", "Date", "Index points")
table = Table([Col("Date", sensex.rows.date), Col("Close", sensex.rows.text)])`,
    `root = Widget("How 1 lakh grows at your rate", [rate, growth, steps])
$rate = 8
rate = Slider("ratePercent", "Yearly return", 1, 15, 0.01, $rate, "percent")
values = Query("calculate_range", {calculator: "future_value", inputs: {amount: 100000, ratePercent: $rate, years: 1}, vary: "years", from: 1, to: 30, step: 1, currency: "inr"}, {rows: []})
growth = AreaChart(values.rows.label, [Series("Value of 1 lakh", values.rows.value)], "natural", "Years", "Rupees")
steps = GuidedTasks([twelve])
twelve = GuidedTask("Set the return to 12%", $rate == 12)`,
    `root = Widget("A 50 lakh home loan, by its length", [rate, line, table, steps])
$rate = 8.5
rate = Slider("ratePercent", "Interest rate", 5, 14, 0.01, $rate, "percent")
byLength = Query("calculate_range", {calculator: "emi", inputs: {principal: 5000000, ratePercent: $rate, years: 20}, vary: "years", from: 5, to: 30, step: 5, output: "Monthly instalment"}, {rows: []})
today = Query("calculate", {calculator: "emi", inputs: {principal: 5000000, ratePercent: $rate, years: 20}}, {rows: []})
line = LineChart(byLength.rows.label, [Series("Monthly instalment", byLength.rows.value)], "linear", "Loan length", "Rupees a month")
table = Table([Col("Over 20 years", today.rows.label), Col("Amount", today.rows.text)])
steps = GuidedTasks([ten])
ten = GuidedTask("Set the rate to 10%", $rate == 10)`,
    `root = Widget("Each payment, and what it is worth today", [rate, bars, total, steps])
$rate = 3
rate = Slider("rate", "Discount rate", 0, 10, 0.01, $rate, "percent")
schedule = Query("annuity_schedule", {total: 1537000000, payments: 30, growthPercent: 5, ratePercent: $rate}, {rows: []})
bars = BarChart(schedule.rows.label, [Series("Payment", schedule.rows.payment), Series("Worth today", schedule.rows.presentValue)], "grouped", "Payment", "Dollars")
total = TextContent("Worth today, all 30 payments together: " + schedule.presentValueText, "large-heavy")
steps = GuidedTasks([zero])
zero = GuidedTask("Set the rate to 0%", $rate == 0)`,
    `root = Widget("Illustration: a rate moving from 5% to 5.5%", [bars, note])
bars = BarChart(["Before", "After"], [Series("Rate in percent", [5, 5.5])], "grouped", "When", "Percent")
note = TextContent("It rose by " + (5.5 - 5) + " percentage points, which is " + (5.5 - 5) * 100 + " basis points. As a share of the old rate, it rose " + (5.5 - 5) / 5 * 100 + "%.")`,
  ],
  additionalRules: [
    "Widgets are how this Workspace shows things. Build one whenever a picture, a chart, a table or something to play with makes the idea clearer, which is most Teaching Steps. When the Learner asks for a chart, graph, diagram, table, comparison, picture or anything to see, always build one in that reply. At most one widget per reply, so make it rich: a slider or two, a chart, and a small table or callout, inside one Widget.",
    "Each openui-lang block is a complete widget: always write every statement, starting with root = Widget(...). Never write a partial patch of an earlier widget.",
    'Real numbers come from code. Historical figures reach a widget only through Query("case_data", {dataset: "caseId/datasetId"}, {rows: []}) or HistoryChart, with references from the Case Data list code sent you. Finance results come only from Query("calculate" | "calculate_range" | "annuity_schedule", …), Calculator, AnnuityChart or FormulaCard. Never type a historical figure or a computed result into a widget.',
    'Made-up teaching examples are the exception. You may type their numbers into a chart or table when the example is plainly hypothetical: start the Widget\'s title with "Illustration:". Before the reveal they must never match the Case\'s real outcome. For their arithmetic, write the expression (e.g. (5.5 - 5) * 100) and let the widget compute it; never type a result you worked out.',
    "Bind Sliders to $variables and pass them into Query arguments, so moving a slider recomputes the chart in the browser with no model call.",
    "Use only numbers a Widget can show. Every number you ask the Learner to try, in your prose or in a Guided Task, lies between that slider's min and max and on one of its steps (a percent slider: 0.01 steps). Never ask for a number the Widget cannot reach.",
    "Charts: give every LineChart, AreaChart, BarChart, HorizontalBarChart and ScatterChart its axis labels: give it an x-axis and a y-axis label, in plain words with the unit.",
    "Updating a Widget: code's context lists the open Widgets by title. To change an open Widget, write it again in full under exactly the same title: code replaces it in its tab. Draw a new Widget only for a new idea, never a near-copy under a new title, and never draw the same Case Data as an open Widget.",
    "Widgets only read: never use Mutation() or @Run.",
    "Use a Calculator, or a chart from calculate_range, for any other sum the Learner should play with. Its numbers come from our tested formulas; never work the answer out yourself or type results.",
    "Formulas: show a named formula only as a FormulaCard, and only one the Course Navigator message lists under the Topic's formulas. Describe any other formula in words, and never type a formula with symbols such as (1 + r)^n. Give every symbol of the card exactly once: a Learner's assumption under inputs (a $variable bound to a Slider in the same widget), a Case Data figure under sourced, or a fixed number under fixed. A FormulaCard's result comes from code; never type it.",
    "Guided Tasks: Every Widget with a Slider has GuidedTasks, with at least one task. GuidedTasks goes last in a widget's list, under the controls. Each GuidedTask's second argument is a condition that reads a $variable bound to a Slider in the same widget, and that is false at the slider's starting value. Practice only: never ask the Learner to type a task's answer, and never treat a ticked task as an answer to a Check.",
    "If no Case Data covers what the Learner wants, say plainly that the data is not available here, and still show what code can compute, or a clearly labelled Illustration of the idea.",
    "Starting numbers you put in a Slider or chart must come from the Case material code sent you.",
    "Before the reveal step, never put a Case's outcome in a widget.",
    "After the widget, keep teaching in plain prose: the Learner sees the widget beside the conversation.",
  ],
} satisfies PromptOptions;

/**
 * Sections of OpenUI's generic prompt that contradict the Workspace, each cut up to the next heading of its
 * level or higher: answering a question with text only (here a picture often answers it best), writing with
 * Mutation (widgets only read), Forms (not in the library), and its data workflow (call a tool first, then
 * type its results as Query defaults).
 */
export const OPENUI_SECTIONS_CUT = ["### 2. Text-only response", "## Mutation — Write Operations", "## Forms", "## Data Workflow"];

/**
 * Exact text of OpenUI's generic prompt that contradicts the Workspace, with what replaces it ("" cuts it):
 * code only when asked to change the UI, patches of changed lines, text-only answers, refresh Buttons, a
 * binding rule that is wrong for our Slider, a tools line that offers writes, "realistic mock data" where
 * no tool fits, forms for input, and a last check that every filter feeds a Query (a Slider that feeds a
 * Calculator or an AnnuityChart needs none, and the check could make the Tutor add one it does not need).
 */
export const OPENUI_TEXT_REPLACED: readonly (readonly [openui: string, ours: string])[] = [
  ["You can respond in two ways:", "Your reply is prose, and it can hold one widget:"],
  ["### 1. Code response (when the user wants to CREATE or CHANGE the UI)", "### A widget in a reply"],
  ["\n- When the user asks for changes, output ONLY the changed/new statements in a fenced block", ""],
  ["\n- When the user asks a question, respond with text only — NO code. The dashboard stays unchanged.", ""],
  ['\n- Manual refresh: `Button("Refresh", Action([@Run(query1), @Run(query2)]), "secondary")` — re-fetches the listed queries', ""],
  ["\n- Refresh all queries: create Action with @Run for each query", ""],
  ["\n- $variables must be bound to a Select/Input component via the value argument (last positional arg) to be interactive", ""],
  [
    "Use these with Query() for read operations or Mutation() for write operations. The LLM decides which is appropriate based on the tool's purpose.",
    "These Widget tools are our code, run in the browser when a widget's Query(...) needs them, and again whenever a $variable in its arguments changes. Use them only inside a widget: they are not tools you call yourself, even where a name matches one of yours (calculate).",
  ],
  [" If the user asks for functionality that doesn't match any available tool, use realistic mock data instead of fabricating a tool call.", ""],
  ["forms for input, etc.", "sliders for numbers the Learner changes, etc."],
  [
    "5. Every visible filter $binding appears in at least one Query args object.",
    "5. Every Slider's $variable feeds a part or a Query's arguments, so moving the slider changes the widget.",
  ],
];

/** Fails the freeze loudly when OpenUI no longer writes a passage we cut, instead of silently keeping the rest. */
function missing(passage: string): Error {
  return new Error(`OpenUI's prompt no longer contains ${JSON.stringify(passage.trim())}. Review the cuts in widgetInstructions().`);
}

/** Cuts the section under `heading` (a line that starts with it) up to the next heading of the same level or higher. */
function cutSection(prompt: string, heading: string): string {
  const start = prompt.indexOf(`\n${heading}`);
  if (start < 0) throw missing(heading);
  const level = heading.match(/^#+/)?.[0].length ?? 1;
  const next = prompt.slice(start + 1).search(new RegExp(`\\n#{1,${level}} `));
  return prompt.slice(0, start) + (next < 0 ? "" : prompt.slice(start + 1 + next));
}

/** OpenUI's prompt with the passages that contradict the Workspace cut or replaced; throws if one is gone. */
export function withoutContradictions(prompt: string): string {
  let text = OPENUI_SECTIONS_CUT.reduce(cutSection, prompt);
  for (const [openui, ours] of OPENUI_TEXT_REPLACED) {
    if (!text.includes(openui)) throw missing(openui);
    text = text.replace(openui, () => ours);
  }
  return text;
}

/**
 * The widget instructions frozen into the Tutor's instructions (`npm run widgets:freeze`): OpenUI's prompt
 * for this library and these options, without its generic advice that contradicts the Workspace.
 */
export function widgetInstructions(): string {
  return withoutContradictions(widgetLibrary.prompt(WIDGET_PROMPT_OPTIONS));
}
