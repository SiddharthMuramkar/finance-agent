import { createParser, createStore, evaluate, evaluateRoot, type LibraryJSONSchema } from "@openuidev/lang-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WidgetView } from "@/app/widget-view";
import { guidedTaskCheck } from "@/course/guided-task-check";
import { annuitySchedule } from "@/finance/present-value";
import { presentValueOnly } from "@/test/present-value-map";
import { widgetParts, widgetProblems, widgetTaskTexts } from "./check";
import frozen from "./frozen.generated.json";
import { advanceReached, guidedTaskProblems, parsedSliders, parsedTasks, taskStates, walkNodes } from "./guided-tasks";
import { GuidedTasksFigure } from "./guided-tasks-view";
import { WIDGET_PROMPT_OPTIONS, widgetLibrary } from "./library";

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
    expect(item(1)).toContain("Done");
    expect(item(2)).toContain("Current task");
    expect(item(3)).toContain("To do");
  });

  it("marks only the current task as the current step, and says it is practice only", () => {
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(item(2)).toContain('aria-current="step"');
    expect(html).toContain("practice only");
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

describe("the course check for Guided Tasks", () => {
  const check = (...tasks: string[]) => guidedTaskCheck("pv", widget(...tasks));

  it("passes present value's four tasks", () => {
    const pv = presentValueOnly().topic("present-value")!;
    expect(widgetTaskTexts(pv.explore!.widget!)).toHaveLength(4);
    expect(guidedTaskCheck("present-value", pv.explore!.widget!)).toEqual([]);
  });

  it("passes tasks that can be reached on the slider", () => {
    expect(check("$rate == 0", "$rate == 2.25", "$rate > 9.5")).toEqual([]);
  });

  it("fails a task already done at the start", () => {
    expect(check("$rate == 5").join("\n")).toMatch(/already done at the start/);
    expect(check("$rate >= 4").join("\n")).toMatch(/already done at the start/);
  });

  it("fails a task no slider position can reach, past the range or between two steps", () => {
    expect(check("$rate > 10").join("\n")).toMatch(/can never be reached/);
    expect(check("$rate == 2.1").join("\n")).toMatch(/can never be reached/);
  });

  it("fails a task that reads no slider", () => {
    expect(check("true").join("\n")).toMatch(/reads no value bound to a slider/);
  });

  it("names the Topic and the task", () => {
    expect(check("$rate > 10")[0]).toContain('Topic "pv" Guided Task "Task 1"');
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
    expect(parsedSliders(children)).toEqual([{ variable: "$rate", min: 0, max: 10, step: 0.5 }]);
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
    expect(guidedTaskCheck("pv", nested("$rate == 2.1")).join("\n")).toMatch(/can never be reached/);
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

describe("present value's 'closest' task", () => {
  it("is true at exactly the slider positions where the payments' worth today is nearest the sourced cash option", () => {
    const pv = presentValueOnly().topic("present-value")!;
    const code = pv.explore!.widget!;
    const closest = parsedTasks(parser.parse(code).root!.props.children).at(-1)!;
    const cashOption = 877_800_000;
    const gaps = Array.from({ length: 41 }, (_, i) => i * 0.25).map((rate) => ({
      rate,
      gap: Math.abs(annuitySchedule({ total: 1_537_000_000, payments: 30, growthPercent: 5, ratePercent: rate }).presentValue - cashOption),
    }));
    const nearest = [...gaps].sort((a, b) => a.gap - b.gap).slice(0, 2).map((g) => g.rate).sort((a, b) => a - b);
    const ticks = gaps.filter((g) => evaluate(closest.condition as never, { getState: () => g.rate, resolveRef: () => undefined }) === true).map((g) => g.rate);
    expect(ticks).toEqual(nearest);
  });
});
