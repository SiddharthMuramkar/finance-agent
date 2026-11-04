import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { loadCourseMap, parseCourseMap, type Topic } from "./map";
import { HOME_WIDGET } from "../app/_landing/home-widget-spec";
import { onlyTaskCheckErrors, writtenAheadCheckErrors } from "./written-ahead-check";

// The course check covers every written-ahead Widget (spec #119, "Owner tooling › The course check"): it can be
// drawn, its defaults sit on their steps, and each Guided Task can be reached and is not done at the start, tried
// with the numbers each task names plus each slider's min, max and default.

const widget = (lines: { old?: number; step?: number; unit?: string; tasks?: string[]; extra?: string } = {}) =>
  [
    'root = Widget("A rate change", [old, new, steps])',
    `$old = ${lines.old ?? 5}`,
    "$new = 5.2",
    `old = Slider("old", "Old rate", 0, 10, ${lines.step ?? 0.01}, $old, "${lines.unit ?? "percent"}")`,
    'new = Slider("new", "New rate", 0, 10, 0.01, $new, "percent")',
    `steps = GuidedTasks([${(lines.tasks ?? ["$old == 6 && $new == 6.4"]).map((_, i) => `t${i}`).join(", ")}])`,
    ...(lines.tasks ?? ["$old == 6 && $new == 6.4"]).map((done, i) => `t${i} = GuidedTask("Task ${i + 1}", ${done})`),
    lines.extra ?? "",
  ].join("\n");

const topic = (code: string, revealTask?: object): Pick<Topic, "id" | "widgets"> => ({ id: "t", widgets: [{ id: "w", code, parts: [], ...(revealTask && { revealTask }) }] as Topic["widgets"] });
const check = (code: string, revealTask?: object) => writtenAheadCheckErrors([topic(code, revealTask)]).join("\n");

describe("the course check for written-ahead Widgets", () => {
  it("passes every written-ahead Widget on the Course Map, present value's included", () => {
    const map = loadCourseMap();
    expect(map.topic("present-value")!.widgets.map((w) => w.id)).toEqual(["annuity-worth-today"]);
    expect(writtenAheadCheckErrors(map.topics)).toEqual([]);
  });

  it("passes a Widget whose tasks are reached on numbers they name, two sliders at once", () => {
    expect(check(widget())).toBe("");
  });

  it("fails a Widget that cannot be drawn", () => {
    expect(check('root = Widget("Broken", [nothing])')).toMatch(/written-ahead Widget "w" cannot be drawn/);
  });

  it("fails a default that sits off its slider's steps", () => {
    expect(check(widget({ old: 5.005 }))).toMatch(/\$old starts at 5.005, which is not on a step/);
    expect(check(widget({ old: 4.1, step: 0.25, unit: "years" }))).toMatch(/\$old starts at 4.1, which is not on a step/);
    expect(check(widget({ old: 12 }))).toMatch(/\$old starts at 12, outside 0 to 10/);
  });

  it("fails a Guided Task already done at the start", () => {
    expect(check(widget({ tasks: ["$old == 5"] }))).toMatch(/Guided Task "Task 1" .* is already done at the start/);
  });

  it("fails a Guided Task no slider position can reach", () => {
    expect(check(widget({ tasks: ["$old == 11"] }))).toMatch(/Guided Task "Task 1" .* can never be reached/);
    expect(check(widget({ tasks: ["$old == 6.123"] }))).toMatch(/can never be reached/);
  });

  it("tries each slider's min and max too, so a task past a named number is reached at the end of the range", () => {
    expect(check(widget({ tasks: ["$old > 9.5"] }))).toBe("");
  });

  it("checks the Widget with its reveal task added, whose task must read a slider", () => {
    expect(check(widget(), { case: "c", dataset: "d", text: "From {before}% to {after}%", done: "$old == {before} && $new == {after}" })).toBe("");
    expect(check(widget(), { case: "c", dataset: "d", text: "From {before}%", done: "{before} == {after}" })).toMatch(
      /with its reveal task added Guided Task "From 0%" \(revealTask\) reads no value bound to a slider/,
    );
  });

  it("is part of the Course Map's rules: a Topic file with a written-ahead Widget whose title repeats fails to load", () => {
    const real = loadCourseMap().topic("present-value")!;
    const twice = { ...real, stage: "foundation", path: 1, prerequisites: [], subject: undefined, connections: undefined, widgets: [...real.widgets, { ...real.widgets[0], id: "again" }] };
    const { errors } = parseCourseMap([{ name: "present-value.yaml", text: stringify(twice) }]);
    expect(errors.join("\n")).toMatch(/written-ahead Widget "again" repeats the title "What the annuity is worth today"/);
  });
});

describe("the course check for the Widget Home shows, with only Home's task", () => {
  const home = (code: string, done = "$old == 6") => onlyTaskCheckErrors([topic(code)], { topic: "t", widget: "w", task: { text: "Home's task", done } }).join("\n");

  it("passes Present value's annuity Widget with Home's task", () => {
    expect(onlyTaskCheckErrors(loadCourseMap().topics, HOME_WIDGET)).toEqual([]);
  });

  it("passes when the GuidedTasks list is written inside root's children", () => {
    const inside = [
      'root = Widget("A rate change", [old, GuidedTasks([t0])])',
      "$old = 5",
      'old = Slider("old", "Old rate", 0, 10, 0.01, $old, "percent")',
      't0 = GuidedTask("Task 1", $old == 7)',
    ].join("\n");
    expect(home(inside)).toBe("");
  });

  it("fails when Home's task cannot be reached", () => {
    expect(home(widget(), "$old == 11")).toMatch(/with only Home's task Guided Task "Home's task" .* can never be reached/);
  });

  it("fails when the Widget Home shows is missing", () => {
    expect(onlyTaskCheckErrors([topic(widget())], { topic: "t", widget: "gone", task: { text: "x", done: "$old == 6" } })).toEqual([
      'Topic "t" has no written-ahead Widget "gone", which Home shows',
    ]);
  });
});
