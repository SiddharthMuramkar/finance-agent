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
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod/v4";
import type { CaseData, CaseDataset } from "@/case-data/case-data";
import { calculate, CALCULATOR_IDS } from "@/finance/calculators";
import { FORMULAS, formulaById } from "@/finance/formulas";
import { Chip, IconButton, SecondaryButton } from "@/app/ui";
import { formatInrDisplay } from "@/finance/indian-format";
import { AnnuityFigure, annuityAgainstCash, AssumptionTag, formatUnit, formatUsd, HistoryFigure } from "./case-data-view";
import { InsightSettledContext } from "./insight-settled";
import { FormulaFigure, type CardValue } from "./formula-card-view";
import { useCaseLoad } from "./case-data-provider";
import { advanceReached, savedReached, walkNodes } from "./guided-tasks";
import { SavedTicksContext } from "./saved-ticks";
import { readingValue, settledValue, sliderStep, snappedValue, steppedValue, typedValue, type SliderRange } from "./slider-steps";
import { GuidedTasksFigure } from "./guided-tasks-view";
import { AreaChartPlot, BarChartPlot, LineChartPlot, type ChartProps } from "./plot/charts";
import { PlotResetContext } from "./plot/domain";
import { WIDGET_TOOL_SPECS } from "./tool-specs";
import { ICON_NAMES, WAVE1_PARTS } from "./primitives/wave1";
import { Step, WAVE2_PARTS } from "./primitives/wave2";

// The OpenUI component library the Tutor writes widgets with: OpenUI's ready-made kit (charts,
// tables, tabs, callouts) beside our own code-backed parts (Slider, Calculator, AnnuityChart,
// HistoryChart, FormulaCard, GuidedTasks). Real figures reach a widget only through our parts or
// the Widget tools (tool-specs.ts), which work them out or fetch them in the browser; typed numbers
// are only for an Illustration, whose title says so.

const UNITS = ["percent", "years", "usd", "inr"] as const;
type Unit = (typeof UNITS)[number];

export { formatUsd };

const sliderProps = z.object({
  name: z.string().describe('Field name, e.g. "rate"'),
  label: z.string(),
  min: z.number(),
  max: z.number(),
  step: z.number(),
  value: reactive(z.number()),
  unit: z.enum(UNITS),
  quick: z
    .array(z.object({ value: z.number(), note: z.string().optional() }))
    .optional()
    .describe('Optional quick buttons that set the slider to a value at once, e.g. [{value: 0}]; a note is shown after the value'),
});

/** Reset's slide back to the starting values: this many frames, this far apart (about 240 ms in all). */
const RESET_FRAMES = 6;
const RESET_FRAME_MS = 40;
const RESET_MS = RESET_FRAMES * RESET_FRAME_MS;

/** A press-and-hold repeat: the first press acts at once, and holding goes on acting every 80 ms after 400 ms. */
function useHold(act: () => boolean) {
  const latest = useRef(act);
  // After each render, so a held press always steps from what the slider shows now.
  useEffect(() => {
    latest.current = act;
  });
  const timers = useRef<{ wait?: number; every?: number }>({});
  const stop = useCallback(() => {
    window.clearTimeout(timers.current.wait);
    window.clearInterval(timers.current.every);
    timers.current = {};
  }, []);
  useEffect(() => stop, [stop]);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      stop();
      if (!latest.current()) return;
      timers.current.wait = window.setTimeout(() => {
        timers.current.every = window.setInterval(() => {
          if (!latest.current()) stop();
        }, 80);
      }, 400);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onBlur: stop,
    // A press already acted on pointer down (click detail is 1+); a key press has no pointer, so it acts here.
    onClick: (e: React.MouseEvent) => {
      if (e.detail === 0) latest.current();
    },
  };
}

/**
 * A slider with a number box and −/+ buttons, so the Learner can set an exact value. The rules for what
 * values it takes live in slider-steps.ts. The number box keeps what is being typed until Enter or leaving
 * the box, so typing 3.38 never passes through 3 and 3.3 (which could tick a Guided Task on the way).
 * It is a container-query component: the row is a grid that gives the range every pixel the buttons leave, and
 * below 22rem the number box is replaced by tapping the value in the header to type it.
 */
function SliderView({ props }: ComponentRenderProps<z.infer<typeof sliderProps>>) {
  const field = useStateField(props.name, props.value);
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // After Enter or Escape in the typed-value box the box goes away: hand focus to the value button (not after a blur).
  const valueButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      valueButton.current?.focus();
    }
  }, [editing]);
  const value = Number(field.value ?? props.min);
  const set = (next: number) => field.setValue(settledValue(next, props));
  const commit = () => {
    if (draft !== null) {
      const typed = typedValue(draft, props);
      if (typed !== null) field.setValue(typed);
    }
    setDraft(null);
    setEditing(false);
  };
  // One step; false once the slider is at its end, which also ends a hold.
  const step = (dir: 1 | -1) => () => {
    const next = steppedValue(value, dir, props);
    if (next === value) return false;
    field.setValue(next);
    return true;
  };
  const down = useHold(step(-1));
  const up = useHold(step(1));
  const reading = formatUnit(readingValue(value), props.unit);
  const typing = {
    type: "number" as const,
    inputMode: "decimal" as const,
    min: props.min,
    max: props.max,
    step: "any",
    value: draft ?? String(readingValue(value)),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        refocus.current = true;
        commit();
      }
      if (e.key === "Escape") {
        refocus.current = true;
        setDraft(null);
        setEditing(false);
      }
    },
  };
  return (
    <div className="@container min-w-0 py-2" data-testid="slider">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0">
          <AssumptionTag />
          {props.label}
        </span>{" "}
        {editing ? (
          <input
            {...typing}
            autoFocus
            aria-label={`${props.label}, type a value`}
            className="w-24 shrink-0 rounded border border-[var(--border)] bg-[var(--field)] px-1.5 py-0.5 text-right text-sm tabular-nums @[22rem]:hidden"
          />
        ) : (
          <>
            <output className="hidden shrink-0 font-medium tabular-nums @[22rem]:inline">{reading}</output>
            <button
              ref={valueButton}
              type="button"
              title="Tap to type a value"
              onClick={() => setEditing(true)}
              className="min-h-6 shrink-0 rounded font-medium tabular-nums underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] @[22rem]:hidden"
            >
              {reading}
            </button>
          </>
        )}
      </div>
      <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 @[22rem]:grid-cols-[auto_minmax(0,1fr)_auto_5rem]">
        <IconButton
          label={`Decrease ${props.label} by one step`}
          disabled={value <= props.min}
          {...down}
          className="border border-[var(--border)] text-base leading-none text-[var(--ink)]"
        >
          −
        </IconButton>
        <input
          type="range"
          aria-label={props.label}
          min={props.min}
          max={props.max}
          step={sliderStep(props)}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
          className="range-you min-w-0 w-full"
        />
        <IconButton
          label={`Increase ${props.label} by one step`}
          disabled={value >= props.max}
          {...up}
          className="border border-[var(--border)] text-base leading-none text-[var(--ink)]"
        >
          +
        </IconButton>
        <input
          {...typing}
          aria-label={`${props.label}, exact value`}
          className="hidden w-20 shrink-0 rounded border border-[var(--border)] bg-[var(--field)] px-1.5 py-0.5 text-right text-sm tabular-nums @[22rem]:block"
        />
      </div>
      {!!props.quick?.length && (
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Quick values for ${props.label}`}>
          {props.quick.map((q) => (
            // No data-state: that attribute marks a Guided Task's state for the scripts and tests that read the page.
            <Chip key={`${q.value} ${q.note ?? ""}`} data-state={undefined} onClick={() => field.setValue(settledValue(q.value, props))} className="tabular-nums">
              {quickLabel(q, props.unit)}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

/** A quick button's words: its value in the slider's unit, then its note: "3.33% (30-yr Treasury, 24 Oct 2018)". */
function quickLabel(q: { value: number; note?: string }, unit: Unit): string {
  return q.note ? `${formatUnit(q.value, unit)} (${q.note})` : formatUnit(q.value, unit);
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
  firstYear: z.number().optional().describe("The calendar year of the first payment: the chart then labels payments by year on a $ millions axis"),
});

/**
 * The annuity chart. Against a sourced cash figure, once the Topic's Insight is settled (InsightSettledContext), it
 * adds code's verdict line and the break-even line: the latter when the rate is within 0.02 points of it, or on
 * Show me, offered once the Learner has tried a rate other than the one the chart opened at. Before the Insight
 * neither shows, so the Learner finds the idea first.
 */
function AnnuityChartView({ props }: ComponentRenderProps<z.infer<typeof chartProps>>) {
  const loaded = useCaseDataset(props.compareTo);
  const settled = useContext(InsightSettledContext);
  const rate = props.ratePercent;
  const ready = [props.total, props.payments, props.growthPercent, rate].every((v) => typeof v === "number" && Number.isFinite(v));
  // The rate the chart first drew at, so moving away from it counts as a try.
  const [opened, setOpened] = useState<number | null>(null);
  const [tried, setTried] = useState(false);
  const [askedToShow, setAskedToShow] = useState(false);
  if (ready && opened === null) setOpened(rate);
  if (ready && opened !== null && rate !== opened && !tried) setTried(true);
  // While a widget streams in, or a slider's $variable is not set yet, inputs can be missing.
  if (!ready) return <p className="py-6 text-sm text-[var(--muted)]">Drawing the chart…</p>;
  const cash = loaded?.dataset.unit === "USD" ? loaded.dataset.points.at(-1)?.value : undefined;
  const against = settled && cash !== undefined ? annuityAgainstCash(props, cash) : null;
  const breakEven = !!against?.breakEven && (against.near || askedToShow);
  return (
    <>
      <AnnuityFigure inputs={props} sourced={loaded?.dataset} firstYear={props.firstYear} compare={{ verdict: !!against, breakEven }} />
      {against?.breakEven != null && !breakEven && tried && (
        <SecondaryButton onClick={() => setAskedToShow(true)} title="Show the rate at which the annuity and the cash are worth the same">
          Show me
        </SecondaryButton>
      )}
      {loaded === null && props.compareTo && <Missing reference={props.compareTo} />}
    </>
  );
}

const AnnuityChart = defineComponent({
  name: "AnnuityChart",
  description:
    'Bars for each yearly payment of a growing annuity (first payment now) and what each is worth today, by the tested present value formula. `compareTo` optionally shows a sourced Case Data figure "caseId/datasetId" (its latest point) beside the present value.',
  props: chartProps,
  component: AnnuityChartView,
});

const historyProps = z.object({
  dataset: z.string().describe('A Case Data reference, "caseId/datasetId", from the list code sent you'),
  scale: z
    .enum(["linear", "log"])
    .optional()
    .describe('"log" opens the chart on a log axis, which shows steady growth as a straight line; a Log scale switch is always offered'),
});

function HistoryChartView({ props }: ComponentRenderProps<z.infer<typeof historyProps>>) {
  const loaded = useCaseDataset(props.dataset);
  if (!props.dataset) return null;
  if (loaded === undefined) return <p className="py-6 text-sm text-[var(--muted)]">Fetching sourced data…</p>;
  if (loaded === null) return <Missing reference={props.dataset} />;
  return <HistoryFigure dataset={loaded.dataset} revealed={loaded.data.revealed} asOf={loaded.data.asOf} scale={props.scale} />;
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
      <p data-kind="worked-out" className="text-sm">
        <span className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-[var(--muted)]">Worked out</span>
        <span aria-hidden="true"> · </span>
        <span className="font-medium">{result.title}</span>
      </p>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        {result.results.map((r) => {
          // Rupees: no paise from ₹1,000 up, and lakh or crore first from one lakh, with the whole figure on hover.
          const rupees = r.kind === "money" && r.text.startsWith("₹") ? formatInrDisplay(r.value) : null;
          return (
            <div key={r.label} className="contents">
              <dt className="text-[var(--muted)]">{r.label}</dt>
              <dd className="text-right font-medium tabular-nums" title={rupees?.title}>
                {rupees?.text ?? r.text}
              </dd>
            </div>
          );
        })}
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
    "A Formula Card: a named formula from our formula registry with every symbol named in plain words and its unit, the numbers filled in live, and the result worked out by the tested calculator behind it. Every symbol must be given exactly once, under `inputs` (the Learner's assumptions, each a $variable bound to a Slider), `sourced` (Case Data references) or `fixed` (fixed numbers).",
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
  // While Reset slides the sliders home, the numbers passed on the way tick nothing.
  const paused = useContext(TicksPausedContext);
  const held = Math.max(reached, fromSaved);
  const now = paused ? held : advanceReached(held, tasks.map((t) => t.done));
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
    "Guided Tasks under a widget: practice steps that tick themselves, in order, when the Learner's sliders reach the state each GuidedTask describes. Never marked or saved.",
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

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPart = (v: unknown, name?: string): v is { typeName: string; props: Record<string, unknown> } =>
  isRecord(v) && typeof v.typeName === "string" && isRecord(v.props) && (name === undefined || v.typeName === name);

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

const STACK_GAPS: Record<string, string> = {
  none: "0",
  xs: "var(--openui-space-xs)",
  s: "var(--openui-space-s)",
  m: "var(--openui-space-m)",
  l: "var(--openui-space-l)",
  xl: "var(--openui-space-xl)",
  "2xl": "var(--openui-space-2xl)",
};
const STACK_ALIGN: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
};
const STACK_JUSTIFY: Record<string, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly",
};

/**
 * The kit's Stack, repaired for narrow panels: a row whose every child is a Slider is drawn as a column (a Slider
 * needs the whole width), and any other row wraps, each child at least min(100%, 15rem) wide, so nothing is pushed
 * past the panel. Columns are drawn as the kit draws them.
 */
function StackView({ props, renderNode }: ComponentRenderProps) {
  const children = asList(props.children);
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const row = props.direction === "row";
  const sliders = children.length > 0 && children.every((c) => isPart(c, "Slider"));
  const wrapped = row && !sliders;
  const justify = (props.wrap || wrapped) && props.justify === "between" ? "start" : props.justify;
  return (
    <div
      data-testid="stack"
      data-direction={wrapped ? "row" : "column"}
      style={{
        display: "flex",
        flexDirection: wrapped ? "row" : "column",
        gap: STACK_GAPS[text(props.gap) || "m"] ?? STACK_GAPS.m,
        alignItems: STACK_ALIGN[text(props.align)],
        justifyContent: STACK_JUSTIFY[text(justify)],
        flexWrap: props.wrap || wrapped ? "wrap" : undefined,
        minWidth: 0,
      }}
    >
      {wrapped
        ? children.map((child, i) => (
            <div key={i} style={{ flex: "1 1 min(100%, 15rem)", minWidth: 0 }}>
              {renderNode(child)}
            </div>
          ))
        : renderNode(props.children)}
    </div>
  );
}

const kitStack = openuiLibrary.components.Stack;
const Stack = defineComponent({
  name: "Stack",
  props: kitStack.props,
  description: kitStack.description,
  component: StackView,
});

/** A Steps title without the number the model wrote into it ("1. Bad times arrive"): Steps number themselves. */
export function withoutStepNumber(title: unknown): unknown {
  return typeof title === "string" ? title.replace(/^\s*\d+[.)]\s+/, "") : title;
}

const kitSteps = openuiLibrary.components.Steps;

/** The kit's Steps, drawn by the kit, with the numbers the model wrote into step titles taken out. */
function StepsView(render: ComponentRenderProps) {
  const Kit = kitSteps.component;
  const items = asList(render.props.items).map((item) =>
    isPart(item)
      ? {
          ...item,
          props: { ...item.props, title: withoutStepNumber(item.props.title) },
        }
      : item,
  );
  return <Kit {...render} props={{ ...render.props, items }} />;
}

const Steps = defineComponent({
  name: "Steps",
  props: kitSteps.props,
  description: kitSteps.description,
  component: StepsView,
});

/**
 * The kit's chart as the plot kit draws it. OpenUI hands a chart its labels, then Series elements (or, from a
 * Query, rows of [label, value, value...] with the column names as labels); this turns either into the plot's
 * series. Null while a streaming chart has no labels or series yet.
 */
export function chartFromProps(props: Record<string, unknown>): ChartProps | null {
  const names = asList(props.labels).map(String);
  const given = asList(props.series);
  if (!names.length || !given.length) return null;
  let labels = names;
  let series: ChartProps["series"];
  if (Array.isArray(given[0])) {
    const rows = given as unknown[][];
    labels = rows.map((cells) => String(cells[0] ?? ""));
    series = names.slice(1).map((category, at) => ({
      category,
      values: rows.map((cells) => Number(cells[at + 1]) || 0),
    }));
  } else {
    series = given
      .filter((s): s is { props: Record<string, unknown> } => isRecord(s) && isRecord(s.props))
      .map((s) => ({
        category: String(s.props.category ?? ""),
        values: asList(s.props.values).map((v) => Number(v) || 0),
      }));
  }
  if (!series.length) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    labels,
    series,
    variant: typeof props.variant === "string" ? props.variant : undefined,
    xLabel: typeof props.xLabel === "string" ? props.xLabel : undefined,
    yLabel: typeof props.yLabel === "string" ? props.yLabel : undefined,
    unit: typeof props.unit === "string" ? props.unit : undefined,
    yMin: num(props.yMin),
    yMax: num(props.yMax),
  };
}

const chartExtras = {
  unit: z.enum(["inr", "usd", "percent"]).optional().describe("The unit of the values, for axis ticks and tooltips; read from the y-axis label when left out"),
  yMin: z.number().optional().describe("The value axis never ends inside yMin to yMax"),
  yMax: z.number().optional(),
};

function overrideChart(name: "AreaChart" | "LineChart" | "BarChart", Plot: (props: ChartProps) => ReactNode, extra: z.ZodRawShape = {}, description?: string) {
  const kitChart = openuiLibrary.components[name];
  const base = kitChart.props as unknown as z.ZodObject;
  return defineComponent({
    name,
    props: base.extend({ ...extra, ...chartExtras }),
    description: description ?? kitChart.description,
    component: ({ props }: ComponentRenderProps) => {
      const chart = chartFromProps(props);
      return chart ? Plot(chart) : null;
    },
  });
}

/** The kit's three axis charts, drawn by the plot kit: sticky value axes, round ticks, units, and areas that never stack. */
const AreaChart = overrideChart(
  "AreaChart",
  (p) => <AreaChartPlot {...p} />,
  { variant: z.enum(["linear", "natural", "step", "stacked"]).optional() },
  'Filled first series with the others as lines, over one axis. Series overlap and never stack unless variant is "stacked".',
);
const LineChart = overrideChart("LineChart", (p) => <LineChartPlot {...p} />);
const BarChart = overrideChart("BarChart", (p) => <BarChartPlot {...p} />);

/** Our parts the kit's containers list as their content; Stack already takes any part. */
const OUR_PARTS = [AnnuityChart, HistoryChart, Calculator, FormulaCard, GuidedTasks];

/**
 * The v2 parts' descriptions as the widget instructions print them: shorter than the parts' own (which restate the
 * signature the instructions already print), so the instructions grow by at most a tenth (UX audit §7.3).
 */
const BRIEF: Record<string, string> = {
  Stat: 'One number, formatted for its unit (inr in lakh and crore). tone "you" marks the Learner\'s assumption, "src" a sourced figure.',
  Verdict: "The sentence a comparison ends in; it rewrites itself as test changes.",
  QuickCheck: "Tap to answer: 2 to 4 options; answer is the right index from 0 (-1: a poll); why shows after the pick; picked is a $variable (-1 until picked).",
  Predict: "Lock in a guess, then reveal actual (from a tool result or Case Data; while withheld, it waits until revealsAt).",
  Versus: 'Two options on one shared scale, with the winner and the margin. better: "higher" (default) or "lower".',
  Breakeven:
    'Hunt for the flip point: rows, a calculate_range Query\'s rows over what the Slider bound to control sets, cross target there. marker: a sourced number or "caseId/datasetId".',
  MoneyStack: "A calculator's total (sip, emi, future_value, fixed_deposit, recurring_deposit, ppf) drawn as notes, coloured by what you put in and what it earned.",
  Waffle: "A 10 x 10 grid for percent, percentage points and basis points; compareTo outlines the other percent; zoom opens one square (100 basis points).",
  Pictogram: `The thing itself, count times (count may be fractional; compareTo shows the earlier count as outlines). object: ${ICON_NAMES.join(", ")}.`,
  DrawTheLine: 'The Learner draws where a Case Data series went next (eight slices after its as-of date), then sees the record. drawn: a $variable, set as $drawn = [].',
  PriceTag: "The price of one thing rising with the years; ratePercent and years: Slider $variables.",
  ShrinkingNote: "A note whose printed value stays while its buying power shrinks; ratePercent and years: Slider $variables.",
  TimeTravel: "Present value as a journey: one coin from year maxYears to today, or with payments a row of coins (an annuity) brought to today.",
  StepThrough: "A worked example or a cause-and-effect chain, one Step at a time with Back and Next.",
  Rank: "Put 2 to 8 items in order, then check; correctOrder lists item indexes from low end to high; one reason per item.",
  Waterfall: "A start, each change (costs negative) and the total bar, added up by code.",
  RateMove: 'A rate move on a number line, with points, bp and percent of the old rate by code; "practice" asks for the bp first.',
};

/** A v2 part with its brief description (defineComponent's result is a plain object, so a copy is the same part). */
function briefly<T extends { name: string; description: string }>(part: T): T {
  const description = BRIEF[part.name];
  return description ? { ...part, description } : part;
}

/**
 * The Widget language v2 parts (UX audit §7.3), appended after our first parts and never renamed: Saved Sessions
 * and Notes may hold programs that use them. Step is StepThrough's child, like GuidedTask under GuidedTasks.
 */
const NEW_PARTS = [...WAVE1_PARTS, ...WAVE2_PARTS].map(briefly);

/**
 * OpenUI's kit with our parts in its containers. Our Slider replaces the kit's (same name), so every slider
 * keeps its "Your assumption" tag and saved settings. Made once, at module scope: parsers are cached per library.
 */
const kit = openuiLibrary.extend({
  components: {
    remove: DROPPED_KIT_PARTS,
    override: [Slider, Stack, Steps, AreaChart, LineChart, BarChart],
    add: [
      ...[...OUR_PARTS, ...NEW_PARTS].map((component) => ({ component, slots: ["Card.children", "TabItem.content", "AccordionItem.content"] })),
      GuidedTask,
      Step,
    ],
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
  ...NEW_PARTS.map((c) => c.name),
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
    const known = typeof declared === "number" && Number.isFinite(declared);
    start.current = snappedValue(known ? declared : current, slider);
    // Only the declared default is moved onto a step: a value restored from Widget state may be one the Learner typed.
    const onStep = snappedValue(current, slider);
    if (onStep !== current && (!known || current === declared)) field.setValue(onStep);
  });
  const frames = useRef<number[]>([]);
  const cancel = () => {
    frames.current.forEach((id) => window.clearTimeout(id));
    frames.current = [];
  };
  useEffect(() => cancel, []);
  useEffect(() => {
    // Back to the start in a few quick frames, so the Learner sees the slider travel; at once for reduced motion.
    resets.set(slider.target, () => {
      const to = start.current;
      if (to === null) return;
      cancel();
      const from = Number(current);
      const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!Number.isFinite(from) || from === to || still) {
        field.setValue(to);
        return;
      }
      for (let i = 1; i <= RESET_FRAMES; i++) {
        const eased = 1 - (1 - i / RESET_FRAMES) ** 2;
        frames.current.push(window.setTimeout(() => field.setValue(i === RESET_FRAMES ? to : snappedValue(from + (to - from) * eased, slider)), i * RESET_FRAME_MS));
      }
    });
    return () => {
      resets.delete(slider.target);
    };
  });
  return null;
}

/** True while Reset slides the sliders back: Guided Tasks do not tick on the numbers passed on the way. */
export const TicksPausedContext = createContext(false);

/** Top-level parts that are the Widget's controls: a Slider, or a Stack of nothing but Sliders. */
function isControl(part: unknown): boolean {
  if (isPart(part, "Slider")) return true;
  if (!isPart(part, "Stack")) return false;
  const inside = asList(part.props.children);
  return inside.length > 0 && inside.every((c) => isPart(c, "Slider"));
}

/** Most sliders the control bar holds: with more, the bar would cover the answer it sits above. */
const MAX_STICKY_SLIDERS = 2;

function WidgetFrame({ props, renderNode }: ComponentRenderProps<{ title: string; children: unknown }>) {
  const bordered = useContext(WidgetBorderContext);
  const sliders = widgetSliders(props.children);
  const [resets] = useState(() => new Map<string, () => void>());
  // Reset restarts the plots' value axes once the sliders are home, so the axes do not keep the numbers passed on the way.
  const [resetCount, setResetCount] = useState(0);
  const [paused, setPaused] = useState(false);
  const settle = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(settle.current), []);
  const reset = () => {
    setPaused(true);
    resets.forEach((back) => back());
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      setResetCount((n) => n + 1);
      setPaused(false);
    }, RESET_MS + 60);
  };
  // The top-level sliders form a control bar that stays in view while the answer under it scrolls.
  const parts = asList(props.children);
  const controls = parts.filter(isControl);
  const stuck = controls.length > 0 && widgetSliders(controls).length <= MAX_STICKY_SLIDERS;
  const rest = stuck ? parts.filter((part) => !isControl(part)) : parts;
  return (
    <section className={bordered ? "min-w-0 rounded-lg border border-[var(--border)] p-4" : "min-w-0"}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="min-w-0 font-medium">{props.title}</h3>
        {sliders.length > 0 && (
          <IconButton label="Put every slider back to its starting value" onClick={reset} data-testid="widget-reset" className="shrink-0">
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.07" />
              <path d="M2.5 2.5v3h3" />
            </svg>
            <span className="sr-only">Reset</span>
          </IconButton>
        )}
      </div>
      {sliders.map((slider) => (
        <SliderStart key={slider.target} slider={slider} resets={resets} />
      ))}
      <PlotResetContext.Provider value={resetCount}>
        <TicksPausedContext.Provider value={paused}>
          {stuck && (
            <div data-testid="widget-controls" className="sticky top-0 z-10 mb-2 border-b border-[var(--hairline)] bg-[var(--bg)]">
              {renderNode(controls)}
            </div>
          )}
          {renderNode(rest)}
        </TicksPausedContext.Provider>
      </PlotResetContext.Provider>
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
      '- Widget(question, [controls, answer, visual, tasks]). The title is a question the Learner answers by using it ("At what rate does the cash option win?"). With made-up numbers it starts "Illustration:", then the question.',
      '- One primary control; any other goes in Accordion "More settings". Put Sliders one under another, never in a row. Lay parts out with Stack, never an outer Card.',
      "- Right after the controls comes the answer: Verdict for a comparison, Stat for one number. Then one visual (Tabs only for the same numbers as chart and table).",
      "- At rest: at most 3 numbers, 1 visual, 25 words of text, one TextCallout, and no number another part already shows.",
    ],
  },
  {
    name: "Answers",
    components: ["Stat", "Verdict"],
    notes: ["- Show a number with Stat, never by joining it into text with +."],
  },
  {
    name: "Guess, check, compare, order",
    components: ["Predict", "DrawTheLine", "QuickCheck", "Versus", "Breakeven", "Rank"],
    notes: [
      '- Before an answer the Learner could guess, ask for the guess with Predict. Check understanding with 1 to 3 QuickChecks and a Stat score, never with Select. A "find where it flips" task is a Breakeven, not a GuidedTask.',
    ],
  },
  {
    name: "Things to count",
    components: ["MoneyStack", "Pictogram", "Waffle", "RateMove", "PriceTag", "ShrinkingNote", "TimeTravel", "Waterfall"],
  },
  {
    name: "Our parts: numbers from code",
    components: ["Slider", "Calculator", "AnnuityChart", "HistoryChart", "FormulaCard", "GuidedTasks", "GuidedTask"],
    notes: ["- These work out or fetch their own numbers: give them inputs, a formula ID or a Case Data reference, never a result."],
  },
  {
    name: "Layout",
    components: ["Stack", "Tabs", "TabItem", "Accordion", "AccordionItem", "StepThrough", "Step", "Steps", "StepsItem", "Separator"],
    notes: [
      '- Tabs: Tabs([TabItem("chart", "Chart", [chart]), TabItem("table", "Table", [table])]), with the controls above them so one slider moves both views.',
      "- Steps only lists stages in words, and numbers itself: don't number titles.",
    ],
  },
  {
    name: "Content",
    components: ["Card", "CardHeader", "TextContent", "Callout", "TextCallout", "InlineHeader"],
    notes: ["- Card groups parts, for example two Cards side by side in a row Stack."],
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
      "- Prefer the parts above to a chart. Chart labels are strings: a tool result's rows.label or rows.date, never rows.x; values come from rows.value or another number column, plucked with dot access: LineChart(d.rows.date, [Series(\"Close\", d.rows.value)]).",
      "- Never use PieChart or RadarChart: a Waffle shows a share. Areas never stack; for a total and the part you paid in, use MoneyStack.",
    ],
  },
  {
    name: "Controls",
    components: ["FormControl", "Label", "Select", "SelectItem", "SwitchGroup", "SwitchItem", "Chips", "ChipItem"],
    notes: [
      '- A number the Learner sets is a Slider (a guess is a Predict). Select, SwitchGroup and Chips choose between named options: a Select\'s $variable holds text, so compare it ($view == "real") rather than pass it to a tool as a number.',
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
    `root = Widget("What is the annuity worth today at your rate?", [rate, chart, steps])
$rate = 3
rate = Slider("rate", "Discount rate", 0, 10, 0.01, $rate, "percent")
chart = AnnuityChart(1537000000, 30, 5, $rate, "mega-millions-2018/cash-option")
steps = GuidedTasks([zero])
zero = GuidedTask("Set the rate to 0%", $rate == 0)`,
    `root = Widget("How much of a SIP is growth?", [years, pile, steps])
$years = 20
years = Slider("years", "Years you keep investing", 1, 30, 1, $years, "years")
pile = MoneyStack("sip", {monthly: 1000, ratePercent: 10, years: $years}, "inr", "₹1,000 a month at 10% a year")
steps = GuidedTasks([ten])
ten = GuidedTask("Cut it to 10 years and watch the growth shrink", $years == 10)`,
    `root = Widget("What is a payment in five years worth today?", [rate, card, steps])
$rate = 5
rate = Slider("rate", "Discount rate", 0, 15, 0.01, $rate, "percent")
card = FormulaCard("present-value", {ratePercent: $rate}, {amount: "mega-millions-2018/cash-option"}, {years: 5})
steps = GuidedTasks([ten])
ten = GuidedTask("Set the rate to 10%", $rate == 10)`,
    `root = Widget("Which is worth more today?", [q])
$q = -1
q = QuickCheck("Which is worth more today?", ["₹1,000 in 5 years", "₹1,000 in 10 years", "The same"], 0, "Sooner money is discounted for fewer years.", $q)`,
  ],
  toolExamples: [
    `root = Widget("How did the Sensex reach its milestones?", [tabs])
sensex = Query("case_data", {dataset: "sensex-1992/sensex-close"}, {rows: []})
tabs = Tabs([chartTab, tableTab])
chartTab = TabItem("chart", "Chart", [line])
tableTab = TabItem("table", "Table", [table])
line = LineChart(sensex.rows.date, [Series("Sensex close", sensex.rows.value)], "linear", "Date", "Index points")
table = Table([Col("Date", sensex.rows.date), Col("Close", sensex.rows.text)])`,
    `root = Widget("What does 1 lakh grow to at your rate?", [rate, value, steps])
$rate = 8
rate = Slider("ratePercent", "Yearly return", 1, 15, 0.01, $rate, "percent")
r = Query("calculate", {calculator: "future_value", inputs: {amount: 100000, ratePercent: $rate, years: 20}}, {rows: []})
value = Stat("After 20 years", @First(r.rows.value), "inr", "At your rate", "you")
steps = GuidedTasks([twelve])
twelve = GuidedTask("Set the return to 12%", $rate == 12)`,
    `root = Widget("At what rate does the cash option win?", [rate, find])
$rate = 3
rate = Slider("rate", "Discount rate", 0, 10, 0.01, $rate, "percent")
cash = Query("case_data", {dataset: "mega-millions-2018/cash-option"}, {rows: []})
curve = Query("calculate_range", {calculator: "growing_annuity_present_value", inputs: {total: 1537000000, payments: 30, growthPercent: 5, ratePercent: 3}, vary: "ratePercent", from: 0, to: 10, step: 0.1}, {rows: []})
find = Breakeven("Find the rate where the winner flips", curve.rows, @First(cash.rows.value), $rate, 0.05)`,
    `root = Widget("Annuity or cash: which is worth more today?", [rate, verdict, duel, steps])
$rate = 3
rate = Slider("rate", "Discount rate", 0, 10, 0.01, $rate, "percent")
schedule = Query("annuity_schedule", {total: 1537000000, payments: 30, growthPercent: 5, ratePercent: $rate}, {rows: []})
cash = Query("case_data", {dataset: "mega-millions-2018/cash-option"}, {rows: []})
verdict = Verdict(schedule.presentValue > @First(cash.rows.value), "At this rate the annuity is worth more today.", "At this rate the cash is worth more today.")
duel = Versus("Annuity, valued today", schedule.presentValue, "Cash, paid today", @First(cash.rows.value), "usd")
steps = GuidedTasks([eight])
eight = GuidedTask("Set the rate to 8%", $rate == 8)`,
    `root = Widget("Illustration: do two shops steady your income?", [bars, swing])
bars = BarChart(["Rainy year", "Sunny year"], [Series("One shop", [80, 20]), Series("Two shops", [55, 45])], "grouped", "Year", "Income in ₹ thousand")
swing = Stat("Swing with both shops", (55 - 45) * 1000, "inr", "Rainy year minus sunny year")`,
  ],
  additionalRules: [
    "Widgets are how this Workspace shows things. Build one whenever a picture, a chart, a table or something to play with makes the idea clearer, which is most Teaching Steps. When the Learner asks for a chart, graph, diagram, table, comparison, picture or anything to see, always build one in that reply. At most one widget per reply.",
    "Archetypes: Grow, growth over time (MoneyStack, PriceTag, ShrinkingNote, TimeTravel); Compare, two options (Versus, Verdict, Breakeven); Convert, percent or basis points (Waffle), what money buys (Pictogram); Chain, cause and effect (StepThrough); Predict, a Case's history (Predict, DrawTheLine); Rank; Check (QuickCheck); Formula. Don't repeat the last archetype code lists unless asked.",
    "Each openui-lang block is a complete widget: always write every statement, starting with root = Widget(...). Never write a partial patch of an earlier widget.",
    'Real numbers come from code. Historical figures reach a widget only through Query("case_data", {dataset: "caseId/datasetId"}, {rows: []}) or HistoryChart, with references from the Case Data list code sent you. Finance results come only from Query("calculate" | "calculate_range" | "annuity_schedule", …), Calculator, AnnuityChart, FormulaCard or our parts that run a calculator. Never type a historical figure or a computed result into a widget.',
    'Made-up teaching examples are the exception. You may type their numbers into a chart or table when the example is plainly hypothetical: start the Widget\'s title with "Illustration:". Before the reveal they must never match the Case\'s real outcome. For their arithmetic, write the expression (e.g. (5.5 - 5) * 100) and let the widget compute it; never type a result you worked out.',
    "Bind Sliders to $variables and pass them into Query arguments, so moving a slider recomputes the chart in the browser with no model call.",
    "Use only numbers a Widget can show. Every number you ask the Learner to try, in your prose or in a Guided Task, lies between that slider's min and max and on one of its steps (a percent slider: 0.01 steps). Never ask for a number the Widget cannot reach.",
    "Charts: for every chart with axes, give it an x-axis and a y-axis label, in plain words with the unit.",
    "Updating a Widget: code's context lists the open Widgets by title. To change an open Widget, write it again in full under exactly the same title: code replaces it in its tab. Draw a new Widget only for a new idea, never a near-copy under a new title, and never draw the same Case Data as an open Widget.",
    "Widgets only read: never use Mutation() or @Run.",
    "Formulas: show a named formula only as a FormulaCard, and only one the Course Navigator message lists under the Topic's formulas. Describe any other formula in words, and never type a formula with symbols such as (1 + r)^n. Give every symbol of the card exactly once: a Learner's assumption under inputs (a $variable bound to a Slider in the same widget), a Case Data figure under sourced, or a fixed number under fixed. A FormulaCard's result comes from code; never type it.",
    "Guided Tasks: Every Widget with a Slider has GuidedTasks, last, with 1 to 3 tasks, unless a Breakeven, Predict or QuickCheck is its discovery. Each GuidedTask's condition reads a $variable bound to a Slider in the same widget, is false at the slider's starting value, and changes what the Learner sees; the last is a discovery, never a condition most slider positions satisfy. Practice only: never ask the Learner to type a task's answer, and never treat a ticked task as an answer to a Check.",
    'Code may add "Widget notes" about your last widget: follow them in your next widget, and never redraw one only for them.',
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
