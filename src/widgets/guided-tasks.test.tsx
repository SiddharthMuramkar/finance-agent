import { createParser, createStore, evaluate, evaluateRoot, type LibraryJSONSchema } from "@openuidev/lang-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WidgetView } from "@/app/widget-view";
import { writtenAheadCheck } from "@/course/written-ahead-check";
import { annuityBreakEven } from "@/finance/present-value";
import { presentValueOnly } from "@/test/present-value-map";
import { widgetParts, widgetProblems, widgetTaskTexts } from "./check";
import frozen from "./frozen.generated.json";
import { advanceReached, guidedTaskProblems, parsedSliders, parsedTasks, taskStates, walkNodes } from "./guided-tasks";
import { GuidedTasksFigure } from "./guided-tasks-view";
import { WIDGET_PROMPT_OPTIONS, widgetLibrary } from "./library";

/** Present value's annuity Widget as written in its Topic file (before any reveal). */
const annuityCode = () => presentValueOnly().topic("present-value")!.widgets.find((w) => w.id === "annuity-worth-today")!.code;

const parser = createParser(frozen.schema as unknown as LibraryJSONSchema, "Widget");

const widget = (...tasks: string[]) =>
  [
    'root = Widget("Rates", [rate, steps])',
    "$rate = 5",
    'rate = Slider("rate", "Interest rate", 0, 10, 0.25, $rate, "percent")',
    `steps = GuidedTasks([${tasks.map((_, i) => `t${i}`).join(", ")}])`,
    ...tasks.map((condition, i) => `t${i} = GuidedTask("Task ${i + 1}", ${condition})`),
  ].join("\n");

/** What the Widget does as the Learner drags the slider: the conditions the browser evaluates at each position. */
function play(code: string, positions: number[]) {
  const root = parser.parse(code).root!;
  const tasks = parsedTasks(root.props.children);
  let reached = 0;
  return positions.map((rate) => {
    const conditions = tasks.map((t) => evaluate(t.condition as never, { getState: () => rate, resolveRef: () => undefined }) === true);
    reached = advanceReached(reached, conditions);
    return reached;
  });
}

describe("Guided Tasks tick in order and never untick", () => {
  it("only the first task not done can tick, and the next is looked at straight away", () => {
    expect(advanceReached(0, [false, true, true])).toBe(0);
    expect(advanceReached(0, [true, false, true])).toBe(1);
    expect(advanceReached(0, [true, true, true])).toBe(3);
    expect(advanceReached(1, [false, true, false])).toBe(2);
  });

  it("a task that has ticked stays ticked when its condition stops holding", () => {
    expect(advanceReached(2, [false, false, false])).toBe(2);
    expect(advanceReached(3, [])).toBe(3);
  });

  it("states are done, then one current, then to do", () => {
    expect(taskStates(4, 0)).toEqual(["current", "todo", "todo", "todo"]);
    expect(taskStates(4, 2)).toEqual(["done", "done", "current", "todo"]);
    expect(taskStates(4, 4)).toEqual(["done", "done", "done", "done"]);
  });

  it("follows a Learner dragging the slider: 8% before 0% and 2% does not tick the 8% task, and moving away keeps the ticks", () => {
    const code = widget("$rate == 0", "$rate == 2", "$rate == 8");
    expect(play(code, [5, 8, 5, 0, 5, 2, 8, 1, 5])).toEqual([0, 0, 0, 1, 1, 2, 3, 3, 3]);
  });
});

describe("the stepper", () => {
  const html = renderToStaticMarkup(<GuidedTasksFigure tasks={["Set 0%", "Set 2%", "Set 8%"]} reached={1} />);
  const item = (n: number) => html.split("<li")[n];

  it("shows each task as done, current or to do, in order", () => {
    expect(item(1)).toContain('data-state="done"');
    expect(item(2)).toContain('data-state="current"');
    expect(item(3)).toContain('data-state="todo"');
  });

  // #533: a light list of things to try, not homework: no status words, no numbered steps.
  it("is a light list called Things to try, with soft words and no homework framing", () => {
    expect(html).toContain("Things to try");
    expect(html).not.toMatch(/Current task|To do|practice only|Try this/);
    expect(item(1)).toContain("Tried");
    expect(item(2)).toContain("Try next");
    expect(item(3)).toContain("Later");
    expect(html).not.toContain("<ol");
    expect(item(1)).toContain("✓");
    for (const n of [1, 2, 3]) expect(item(n)).not.toMatch(/>\s*[0-9]\s*</);
  });

  it("marks only the current task as the current step", () => {
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(item(2)).toContain('aria-current="step"');
  });

  it("uses the design tokens only", () => {
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b|(?:bg|text|border)-(?:blue|slate|gray|green|red|zinc|neutral)-/);
  });

  it("draws in the Widget with the first task current at the start", () => {
    const drawn = renderToStaticMarkup(<WidgetView code={widget("$rate == 0", "$rate == 2")} complete />);
    expect(drawn).toContain("Interest rate");
    expect(drawn).toMatch(/data-state="current"[\s\S]*Task 1/);
    expect(drawn).toContain('data-state="todo"');
  });
});

describe("the server's Widget check for Guided Tasks", () => {
  it("accepts the example and a task that reads a slider's variable", () => {
    expect(widgetProblems(WIDGET_PROMPT_OPTIONS.examples.at(-1)!)).toEqual([]);
    expect(widgetProblems(widget("$rate >= 3 && $rate <= 4"))).toEqual([]);
  });

  it("rejects a task whose condition reads no value at all", () => {
    expect(widgetProblems(widget("true")).join("\n")).toMatch(/t0: the condition reads no value bound to a Slider/);
    expect(widgetProblems(widget("1 == 1")).join("\n")).toMatch(/t0:/);
  });

  it("rejects a task that reads a variable no Slider is bound to, naming the task", () => {
    const code = widget("$rate == 0", "$other == 2").replace("$rate = 5", "$rate = 5\n$other = 1");
    const problems = widgetProblems(code);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^t1: /);
  });

  it("reads the tasks' texts in order, and the parts of a Widget include GuidedTasks", () => {
    const code = widget("$rate == 0", "$rate == 2");
    expect(widgetTaskTexts(code)).toEqual(["Task 1", "Task 2"]);
    expect(widgetParts(code).components).toEqual(["Slider", "GuidedTasks"]);
    expect(widgetTaskTexts("not openui")).toEqual([]);
  });
});

/** The course check on a Widget's Guided Tasks: since every explore Widget is a written-ahead Widget, the written-ahead check. */
const guidedTaskCheck = (topicId: string, code: string) => writtenAheadCheck(topicId, { id: "w", code, parts: [] });

describe("the course check for Guided Tasks", () => {
  const check = (...tasks: string[]) => guidedTaskCheck("pv", widget(...tasks));

  it("passes present value's annuity Widget's two tasks (its third joins after the reveal)", () => {
    const code = annuityCode();
    expect(widgetTaskTexts(code)).toHaveLength(2);
    expect(guidedTaskCheck("present-value", code)).toEqual([]);
  });

  it("passes tasks that can be reached on the slider", () => {
    expect(check("$rate == 0", "$rate == 2.25", "$rate > 9.5")).toEqual([]);
  });

  it("fails a task already done at the start", () => {
    expect(check("$rate == 5").join("\n")).toMatch(/already done at the start/);
    expect(check("$rate >= 4").join("\n")).toMatch(/already done at the start/);
  });

  it("fails a task no slider position can reach, past the range or between two steps (a percent slider moves in 0.01 steps)", () => {
    expect(check("$rate > 10").join("\n")).toMatch(/can never be reached/);
    expect(check("$rate == 2.123").join("\n")).toMatch(/can never be reached/);
  });

  it("fails a task that reads no slider", () => {
    expect(check("true").join("\n")).toMatch(/reads no value bound to a slider/);
  });

  it("names the Topic and the task", () => {
    expect(check("$rate > 10")[0]).toContain('Topic "pv" written-ahead Widget "w" Guided Task "Task 1"');
  });
});

describe("finding Sliders and Guided Tasks at any depth", () => {
  // Parsed components as the parser hands them over: a Stack holding the slider and Tabs whose second tab holds the tasks.
  const element = (typeName: string, props: Record<string, unknown>, statementId?: string) => ({ type: "element", typeName, props, partial: false, statementId });
  const rate = element("Slider", { name: "rate", label: "Rate", min: 0, max: 10, step: 0.5, value: { k: "StateRef", n: "$rate" }, unit: "percent" }, "rate");
  const done = { k: "BinOp", op: "==", left: { k: "StateRef", n: "$rate" }, right: { k: "Num", v: 0 } };
  const steps = element("GuidedTasks", { tasks: [element("GuidedTask", { text: "Set 0%", done }, "t0")] }, "steps");
  // A component inside an expression is drawn by the browser; the walk leaves it alone.
  const choice = { k: "Ternary", cond: { k: "StateRef", n: "$rate" }, then: { k: "Comp", name: "Slider", args: [], mappedProps: {} }, else: { k: "Null" } };
  const tabs = element("Tabs", { items: [element("TabItem", { value: "a", trigger: "A", content: [choice] }), element("TabItem", { value: "b", trigger: "B", content: [steps] })] });
  const children = [element("Stack", { children: [rate, tabs] }, "box")];

  it("walks every component depth first, in the order written", () => {
    expect([...walkNodes(children)].map((n) => n.typeName)).toEqual(["Stack", "Slider", "Tabs", "TabItem", "TabItem", "GuidedTasks", "GuidedTask"]);
    expect([...walkNodes(undefined)]).toEqual([]);
  });

  it("finds a Slider and Guided Tasks nested in a Stack and a tab, so the tasks pass", () => {
    expect(parsedSliders(children)).toEqual([{ variable: "$rate", min: 0, max: 10, step: 0.5, unit: "percent" }]);
    expect(parsedTasks(children)).toEqual([{ id: "t0", text: "Set 0%", condition: done }]);
    expect(guidedTaskProblems(children)).toEqual([]);
  });
});

// These need OpenUI's kit (Stack) in the frozen schema.
describe("Guided Tasks inside a Stack", () => {
  const nested = (...tasks: string[]) =>
    [
      'root = Widget("Rates", [box])',
      "$rate = 5",
      "box = Stack([rate, steps])",
      'rate = Slider("rate", "Interest rate", 0, 10, 0.25, $rate, "percent")',
      `steps = GuidedTasks([${tasks.map((_, i) => `t${i}`).join(", ")}])`,
      ...tasks.map((condition, i) => `t${i} = GuidedTask("Task ${i + 1}", ${condition})`),
    ].join("\n");

  it("pass the server's check when they read the Stack's Slider, which still names a task that reads none", () => {
    expect(widgetProblems(nested("$rate == 0", "$rate == 2"))).toEqual([]);
    expect(widgetProblems(nested("$rate == 0", "true")).join("\n")).toMatch(/^t1: the condition reads no value bound to a Slider/m);
    expect(widgetTaskTexts(nested("$rate == 0", "$rate == 2"))).toEqual(["Task 1", "Task 2"]);
  });

  it("are tried on their Slider by the course check", () => {
    expect(guidedTaskCheck("pv", nested("$rate == 0", "$rate > 9.5"))).toEqual([]);
    expect(guidedTaskCheck("pv", nested("$rate == 2.123")).join("\n")).toMatch(/can never be reached/);
    expect(guidedTaskCheck("pv", nested("$rate == 5")).join("\n")).toMatch(/already done at the start/);
  });
});

describe("what the browser hands the stepper", () => {
  it("nested tasks arrive with their conditions already worked out from the slider's current value", () => {
    const result = parser.parse(widget("$rate == 0", "$rate == 2"));
    const store = createStore();
    const doneAt = (rate: number) => {
      store.set("$rate", rate);
      const ctx = { getState: (n: string) => store.get(n), resolveRef: () => undefined };
      const root = evaluateRoot(result, { ctx, library: widgetLibrary, store })!;
      const steps = (root.props.children as { typeName: string; props: { tasks: { props: { done: unknown } }[] } }[]).find((c) => c.typeName === "GuidedTasks")!;
      return steps.props.tasks.map((t) => t.props.done);
    };
    expect(doneAt(5)).toEqual([false, false]);
    expect(doneAt(0)).toEqual([true, false]);
    expect(doneAt(2)).toEqual([false, true]);
  });
});

describe("present value's 'find where the annuity equals the cash' task", () => {
  it("ticks at exactly the 0.01 slider positions within 0.02 points of the break-even code works out against the cash option", () => {
    const even = parsedTasks(parser.parse(annuityCode()).root!.props.children).at(-1)!;
    const rates = Array.from({ length: 1001 }, (_, i) => Number((i * 0.01).toFixed(2)));
    const ticks = rates.filter((rate) => evaluate(even.condition as never, { getState: () => rate, resolveRef: () => undefined }) === true);
    // The cash option as advertised ($877.8 million) and as paid ($877,784,124) give the same positions.
    for (const cashOption of [877_800_000, 877_784_124]) {
      const breakEven = annuityBreakEven({ total: 1_537_000_000, payments: 30, growthPercent: 5 }, cashOption)!;
      expect(ticks).toEqual(rates.filter((rate) => Math.abs(rate - breakEven) <= 0.02));
    }
    expect(ticks).toEqual([3.36, 3.37, 3.38, 3.39]);
  });
});
