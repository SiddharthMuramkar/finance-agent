import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WidgetView } from "@/app/widget-view";
import { parsedChildren } from "./check";
import { advanceDone, fillTaskText, guidedTaskProblems, liveTaskStates, savedDone, taskSlots, type LiveTask } from "./guided-tasks";
import { RECIPES } from "./recipes/index";
import { lenientTaskCode, liveLandings, namedVariables, sliderLandings } from "./slider-landing";
import { readWidget } from "./widget-reading";

// Guided Tasks written from the Widget as it stands (spec 2026-11-12, B7): a task that names the other slider's value
// reads it when drawn, and a task whose claim cannot hold for the current settings is not shown.

const task = (key: string, met: boolean, shown = true): LiveTask => ({ key, text: key, shown, met });

describe("which Guided Tasks are done and shown (B7)", () => {
  it("ticks in order among the tasks shown, and a hidden task holds up none after it", () => {
    expect(advanceDone([], [task("a", true), task("b", true), task("c", false)])).toEqual(["a", "b"]);
    expect(advanceDone([], [task("a", false), task("b", true)])).toEqual([]);
    expect(advanceDone([], [task("a", false, false), task("b", true)])).toEqual(["b"]);
  });

  it("keeps a done task done when its condition no longer holds or it is hidden", () => {
    expect(advanceDone(["a"], [task("a", false, false), task("b", false)])).toEqual(["a"]);
  });

  it("draws done, then the first shown task as current, later ones to do, and hides the rest", () => {
    expect(liveTaskStates([task("a", true), task("b", false, false), task("c", false), task("d", false)], ["a"])).toEqual(["done", "hidden", "current", "todo"]);
  });

  it("restores saved ticks by the task's text as written, gaps and all", () => {
    expect(savedDone(["a", "b", "c"], ["c", "a", "x"])).toEqual(["a", "c"]);
  });

  it("fills each {name} from the task's live values, and leaves a slot with no number as written", () => {
    expect(taskSlots("Move the new rate to the old rate, {old}%, then {old} again")).toEqual(["old"]);
    expect(fillTaskText("Move the new rate to the old rate, {old}%, and watch", { old: 4.31 })).toBe("Move the new rate to the old rate, 4.31%, and watch");
    expect(fillTaskText("to {old}%", { old: 4.3100000000001 })).toBe("to 4.31%");
    expect(fillTaskText("to {old}%", {})).toBe("to {old}%");
  });

  it("the Widget check refuses a slot that no value fills", () => {
    const code = [
      'root = Widget("Rates", [control, tasks])',
      "$old = 4",
      "$new = 5",
      'control = Slider("new", "New rate", 0, 20, 0.01, $new, "percent")',
      "tasks = GuidedTasks([task1])",
      'task1 = GuidedTask("Move the new rate to the old rate, {old}%", $new == $old)',
    ].join("\n");
    expect(guidedTaskProblems(parsedChildren(code))).toEqual(["task1: the text names {old} but values gives no number for it. Write values {old: $variable}."]);
  });
});

const rateMove = (inputs: Record<string, unknown>) => {
  const built = RECIPES.find((r) => r.id === "rate_move")!.build({ title: "A savings rate from 4% to 5%", inputs, refs: {}, facts: {} });
  if (!built.ok) throw new Error(built.error);
  return built.code;
};

describe("rate move's tasks as the Widget stands (B7)", () => {
  const code = rateMove({ old: 4, new: 5 });

  it("the new rate follows the old one: a stop and a chip at the old rate wherever it is", () => {
    expect(namedVariables({ k: "BinOp", op: "==", left: { k: "StateRef", n: "$new" }, right: { k: "StateRef", n: "$old" } })).toEqual([{ variable: "$new", other: "$old" }]);
    const landings = sliderLandings(code);
    expect(landings.$new.follows).toEqual(["$old"]);
    const live = liveLandings(landings, { $old: 4.31, $new: 5.78 }, { $new: { min: 0, max: 20 }, $old: { min: 0, max: 20 } });
    expect(live.$new.stops).toContain(4.31);
    expect(live.$new.chips).toContain(4.31);
  });

  it("ticks the first task within one drag step of the old rate, as drawn", () => {
    const drawn = lenientTaskCode(code);
    expect(drawn).toMatch(/task1 = GuidedTask\("Move the new rate to the old rate, \{old\}%, and watch the move shrink to nothing", \(\$new != null && \$old != null && \$new >= \$old - [\d.]+ && \$new <= \$old \+ [\d.]+\)/);
  });

  it("first paints the task with the opening old rate, before the Widget's state is set", () => {
    expect(renderToStaticMarkup(<WidgetView code={code} complete />)).toContain("Move the new rate to the old rate, 4%, and watch the move shrink to nothing");
  });

  it("tells the Tutor the task as the Learner reads it, ticked by the text as written", () => {
    const reading = readWidget(code, { values: { $old: 4.31, $new: 5.78 }, ticked: [] } as never, () => undefined);
    expect(reading?.tasks[0]).toEqual({ text: "Move the new rate to the old rate, 4.31%, and watch the move shrink to nothing", ticked: false });
  });
});
