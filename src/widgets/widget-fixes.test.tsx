// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetView, drawingLibrary } from "@/app/widget-view";
import { formatInrDisplay } from "@/finance/indian-format";
import { widgetProblems, widgetWarnings } from "./check";
import { chartFromProps, widgetInstructions, widgetLibrary, withoutStepNumber } from "./library";
import frozen from "./frozen.generated.json";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sliders = (rows: string) =>
  [
    'root = Widget("Rates", [row, note])',
    `row = Stack([a, b], ${rows})`,
    "$old = 4",
    "$years = 10",
    'a = Slider("rate", "Old rate", 0, 10, 0.25, $old, "percent")',
    'b = Slider("years", "Years", 1, 30, 1, $years, "years")',
    'note = TextContent("Hello")',
  ].join("\n");

const html = (code: string) => renderToStaticMarkup(<WidgetView code={code} complete />);
const tag = (markup: string, pattern: RegExp) => markup.match(new RegExp(`<[^>]*${pattern.source}[^>]*>`))?.[0] ?? "";

describe("a Slider as a container-query component", () => {
  const markup = html(sliders('"column"'));

  it("sits in a @container with a three-column row (button, range, button) and no number box at any width", () => {
    expect(markup).toContain("@container");
    expect(markup).toContain("grid-cols-[auto_minmax(0,1fr)_auto]");
    expect(markup).not.toContain("@[22rem]");
    expect(markup).not.toContain("exact value");
    expect(markup).not.toContain('title="Tap to type a value"');
  });

  it("lets the range shrink, takes the teal range-you thumb, and has round icon-button steppers", () => {
    const range = tag(markup, /type="range" aria-label="Old rate"/);
    expect(range).toContain("range-you");
    expect(range).toContain("min-w-0");
    const stepper = tag(markup, /aria-label="Increase Old rate by one step"/);
    expect(stepper).toContain("btn-icon");
    expect(stepper).toContain('data-affordance="icon"');
  });

  it("keeps its positional order, so a saved program still renders", () => {
    const part = widgetLibrary.components.Slider;
    expect(Object.keys((part.props as unknown as { shape: object }).shape)).toEqual(["name", "label", "min", "max", "step", "value", "unit", "quick"]);
  });
});

describe("Stack", () => {
  it("draws a row of Sliders as a column", () => {
    const markup = html(sliders('"row"'));
    expect(tag(markup, /data-testid="stack"/)).toContain('data-direction="column"');
    expect(tag(markup, /data-testid="stack"/)).not.toContain("wrap");
  });

  it("lets a mixed row wrap, each child at least min(100%, 15rem) wide", () => {
    const code = 'root = Widget("Two", [row])\nrow = Stack([a, b], "row")\na = Card([TextContent("One")])\nb = Card([TextContent("Two")])';
    const markup = html(code);
    expect(tag(markup, /data-testid="stack"/)).toContain('data-direction="row"');
    expect(tag(markup, /data-testid="stack"/)).toContain("flex-wrap:wrap");
    expect(markup.match(/flex:1 1 min\(100%, 15rem\)/g)).toHaveLength(2);
  });

  it("is still the kit's Stack for the model: same schema, and the note about Sliders is in the instructions", () => {
    expect(widgetInstructions()).toContain("Put Sliders one under another, never in a row.");
    expect(widgetProblems(sliders('"row"'))).toEqual([]);
  });
});

describe("the kit's charts", () => {
  it("are registered over OpenUI's with its positional signature and optional unit, yMin and yMax after it", () => {
    for (const name of ["AreaChart", "LineChart", "BarChart"]) {
      const keys = Object.keys((widgetLibrary.components[name].props as unknown as { shape: object }).shape);
      expect(keys.slice(0, 6), name).toEqual(["labels", "series", "variant", "xLabel", "yLabel", "height"]);
      expect(keys.slice(6), name).toEqual(["unit", "yMin", "yMax"]);
    }
  });

  it("draw with the plot kit: an area chart's series overlap, with round rupee ticks", () => {
    const code =
      'root = Widget("Illustration: a SIP", [chart])\nchart = AreaChart(["5", "10", "20"], [Series("Value", [100000, 250000, 765697]), Series("Put in", [60000, 120000, 240000])], "natural", "Years", "Rupees")';
    const markup = html(code);
    expect(markup).toContain('data-testid="plot-chart"');
    expect(markup.match(/data-testid="plot-area"/g)).toHaveLength(1);
    expect(markup).toContain("₹8 L");
    expect(markup).not.toMatch(/\d(K|M)\b/);
  });

  it("turn a Query's rows and OpenUI's Series elements into the plot's series", () => {
    expect(chartFromProps({ labels: ["Year", "A", "B"], series: [["1", 1, 2], ["2", 3, "4"]] })).toMatchObject({
      labels: ["1", "2"],
      series: [{ category: "A", values: [1, 3] }, { category: "B", values: [2, 4] }],
    });
    expect(chartFromProps({ labels: ["x"], series: [{ type: "element", props: { category: "S", values: [5] } }], unit: "inr", yMax: 10 })).toMatchObject({ unit: "inr", yMax: 10 });
    expect(chartFromProps({ labels: [], series: [] })).toBeNull();
  });
});

describe("Steps", () => {
  it("number themselves: a number the model wrote into a title is taken out", () => {
    expect(withoutStepNumber("1. Bad times arrive")).toBe("Bad times arrive");
    expect(withoutStepNumber(" 12) Prices rise")).toBe("Prices rise");
    expect(withoutStepNumber("2024 was a year")).toBe("2024 was a year");
    const code = 'root = Widget("Gold", [steps])\nsteps = Steps([StepsItem("1. Bad times arrive", "Fear."), StepsItem("2) Gold rises", "Demand.")])';
    const markup = html(code);
    expect(markup).toContain("Bad times arrive");
    expect(markup).not.toContain("1. Bad");
    expect(markup).not.toContain("2) Gold");
  });
});

describe("the sticky control bar", () => {
  const widget = (n: number) =>
    [
      `root = Widget("Rates", [${Array.from({ length: n }, (_, i) => `s${i}`).join(", ")}, note])`,
      ...Array.from({ length: n }, (_, i) => `$v${i} = 1`),
      ...Array.from({ length: n }, (_, i) => `s${i} = Slider("v${i}", "Value ${i}", 0, 10, 1, $v${i}, "years")`),
      'note = TextContent("Answer")',
    ].join("\n");

  it("holds one or two top-level Sliders, ahead of the answer", () => {
    const markup = html(widget(2));
    expect(markup).toContain('data-testid="widget-controls"');
    expect(tag(markup, /data-testid="widget-controls"/)).toContain("sticky");
    expect(markup.indexOf("Value 1")).toBeLessThan(markup.indexOf("Answer"));
  });

  it("is left out when there are more Sliders than a bar can hold", () => {
    expect(html(widget(3))).not.toContain('data-testid="widget-controls"');
  });
});

describe("rupees in a Widget", () => {
  it("shows no paise from ₹1,000, and a lakh or crore reading with the whole figure in a title", () => {
    expect(formatInrDisplay(999.5)).toEqual({ text: "₹999.50" });
    expect(formatInrDisplay(4000)).toEqual({ text: "₹4,000" });
    expect(formatInrDisplay(43391.16)).toEqual({ text: "₹43,391" });
    expect(formatInrDisplay(975656.53)).toEqual({ text: "₹9.76 lakh", title: "₹9,75,657" });
    expect(formatInrDisplay(12_345_678)).toEqual({ text: "₹1.23 crore", title: "₹1,23,45,678" });
    expect(formatInrDisplay(-250000)).toEqual({ text: "-₹2.5 lakh", title: "-₹2,50,000" });
  });
});

describe("the frozen instructions", () => {
  // Widget language v2 (16 new parts) moved the budget to the whole Tutor prompt: under 10% (widgets.test.ts).
  it("grow by less than 15% over the 33,662 characters they had before the Widget language v2", () => {
    // Plus the five story parts of ticket E2a (about 1,650 characters) and the four of E2b (about 1,000), allowed on purpose.
    expect(frozen.instructions.length).toBeLessThan(33662 * 1.15 + 1_700 + 1_000);
  });

  it("keep the library's drawing copy and its schema the same parts", () => {
    expect(Object.keys(drawingLibrary.components).sort()).toEqual(Object.keys(widgetLibrary.components).sort());
  });
});

describe("a Guided Task that most of the range ticks", () => {
  const widget = (condition: string) =>
    ['root = Widget("Rate", [rate, tasks])', "$rate = 3", 'rate = Slider("rate", "Rate", 0, 10, 0.1, $rate, "percent")', "tasks = GuidedTasks([t])", `t = GuidedTask("Find it", ${condition})`].join("\n");

  it("gets a warning, and no error", () => {
    const code = widget("$rate > 1 && $rate < 8");
    expect(widgetProblems(code)).toEqual([]);
    expect(widgetWarnings(code)).toHaveLength(1);
    expect(widgetWarnings(code)[0]).toContain("not a discovery task");
  });

  it("is not warned about for a narrow target", () => {
    expect(widgetWarnings(widget("$rate >= 3.3 && $rate <= 3.4"))).toEqual([]);
    expect(widgetWarnings(widget("$rate == 0"))).toEqual([]);
  });
});

describe("Reset and the steppers, in a browser", () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  const code = [
    'root = Widget("Rate", [rate, tasks])',
    "$rate = 5",
    'rate = Slider("rate", "Rate", 0, 10, 1, $rate, "years", [{value: 9}, {value: 1}])',
    "tasks = GuidedTasks([t])",
    't = GuidedTask("Reach 3", $rate == 3)',
  ].join("\n");
  const range = () => host.querySelector<HTMLInputElement>('input[type="range"]')!;
  const draw = () => act(async () => root.render(<WidgetView code={code} complete />));
  const press = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const pointer = (el: Element, type: string) => act(async () => void el.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 })));
  const tasks = () => [...host.querySelectorAll("li[data-state]")].map((li) => li.getAttribute("data-state"));

  it("repeats a step while a stepper is held down, and stops when it is let go", async () => {
    await draw();
    await act(async () => vi.advanceTimersByTime(10));
    const plus = press("Increase Rate by one step");
    await pointer(plus, "pointerdown");
    expect(range().value).toBe("6");
    await act(async () => vi.advanceTimersByTime(400));
    for (let i = 0; i < 2; i++) await act(async () => vi.advanceTimersByTime(80));
    expect(Number(range().value)).toBeGreaterThanOrEqual(8);
    await pointer(plus, "pointerup");
    const held = range().value;
    await act(async () => vi.advanceTimersByTime(1000));
    expect(range().value).toBe(held);
  });

  it("steps once for a key press on a stepper", async () => {
    await draw();
    await act(async () => vi.advanceTimersByTime(10));
    await act(async () => press("Decrease Rate by one step").click());
    expect(range().value).toBe("4");
  });

  it("slides the sliders back to their start, and ticks no task on the numbers it passes", async () => {
    await draw();
    await act(async () => vi.advanceTimersByTime(10));
    // The Learner jumps to 1 with a quick button; Reset then slides 1 -> 5 and passes the task's 3 on the way.
    await act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent === "1 years")!.click());
    expect(range().value).toBe("1");
    expect(tasks()).toEqual(["current"]);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="widget-reset"]')!.click());
    // Mid-slide it is on its way, not yet home.
    await act(async () => vi.advanceTimersByTime(80));
    expect(range().value).not.toBe("5");
    await act(async () => vi.advanceTimersByTime(400));
    expect(range().value).toBe("5");
    expect(tasks()).toEqual(["current"]);
  });
});
