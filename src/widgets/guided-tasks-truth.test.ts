import { evaluate } from "@openuidev/lang-core";
import { describe, expect, it } from "vitest";
import { parsedChildren, widgetNodes } from "./check";
import { fillTaskText, parsedSliders, parsedTasks, stateRefs, type ParsedSlider } from "./guided-tasks";
import { RECIPES } from "./recipes/index";
import { declaredSettings } from "./settings";
import { lenientTaskCode } from "./slider-landing";
import { dragStep } from "./slider-steps";
import { workbenchEntry } from "./workbench/registry";

// Spec 2026-11-12, B7 and Part B "Done when": no Guided Task on screen states something false for the sliders' current
// values, checked over every recipe's examples with randomised slider positions. The Widget is read as the browser draws
// it (lenientTaskCode), each task's `show` and `{slot}` values are worked out at the settings, and every task shown and
// not yet met must be one the Learner can do as written: some number its words name, set on a slider its condition reads,
// makes it tick. Rate move's two claims are checked as claims: "shrink to nothing" names the old rate as it is now, and
// "the same gap run the other way" names the old rate that puts the first gap the other side of the new rate as it is now.

const POSITIONS = 60;

/** A seeded random number in [0, 1) (mulberry32), so a failure names a position that can be run again. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random value on the slider's grid (a percent slider moves in 0.01 steps). */
function position(slider: ParsedSlider, random: () => number): number {
  const step = slider.unit === "percent" ? 0.01 : slider.step;
  const steps = Math.floor((slider.max - slider.min) / step + 1e-9);
  return Number((slider.min + Math.floor(random() * (steps + 1)) * step).toFixed(10));
}

/** An expression (or a plain object of them, like a task's values) worked out at the settings. */
function run(expr: unknown, state: Record<string, number>): unknown {
  if (expr === null || typeof expr !== "object") return expr;
  if (Array.isArray(expr)) return expr.map((e) => run(e, state));
  const node = expr as Record<string, unknown>;
  if (typeof node.k === "string") return evaluate(node as never, { getState: (name) => state[name], resolveRef: () => undefined });
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, run(v, state)]));
}

/** The numbers a task's words name, e.g. [4.31] for "Move the new rate to the old rate, 4.31%, and ...". */
const numbersIn = (text: string) => [...text.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "")));

/** Every value along a slider's range, at most about 2,000 of them, for a task that names no number ("until the meter says you found it"). */
function sweep(slider: ParsedSlider): number[] {
  const count = 2000;
  return Array.from({ length: count + 1 }, (_, i) => slider.min + ((slider.max - slider.min) * i) / count);
}

/** What is false about the shown tasks of a Widget at these settings; none when every shown task can be done as written. */
function falseTasks(code: string, state: Record<string, number>, gap?: number): string[] {
  const drawn = lenientTaskCode(code);
  const children = parsedChildren(drawn);
  const sliders = parsedSliders(children);
  const problems: string[] = [];
  for (const task of parsedTasks(children)) {
    if (task.show !== undefined && run(task.show, state) !== true) continue;
    if (run(task.condition, state) === true) continue; // It ticks at once: nothing is left to claim.
    const values = task.values ? (run(task.values, state) as Record<string, unknown>) : undefined;
    const text = fillTaskText(task.text, values);
    if (/\{\w+\}/.test(text)) {
      problems.push(`"${text}" has a slot no value fills`);
      continue;
    }
    const read = new Set(stateRefs(task.condition));
    const named = numbersIn(text);
    // A task that names numbers must tick at one of them; one that names none must tick somewhere along a slider it reads.
    const ways = sliders
      .filter((s) => read.has(s.variable))
      .flatMap((s) => (named.length ? named : sweep(s)).filter((n) => n >= s.min && n <= s.max && run(task.condition, { ...state, [s.variable]: n }) === true).map((n) => ({ s, n })));
    if (!ways.length) {
      problems.push(`"${text}" names no value that ticks it at ${JSON.stringify(state)}`);
      continue;
    }
    // Rate move's claims (spec B7): the move shrinks to nothing only at the old rate as it is now; the same gap runs the
    // other way only from where the old rate began.
    if (/shrink to nothing/.test(text) && !ways.some(({ s, n }) => s.variable === "$new" && Math.abs(n - state.$old) <= dragStep(s) + 1e-9)) {
      problems.push(`"${text}" says the move shrinks to nothing, but the old rate is ${state.$old}%`);
    }
    if (gap !== undefined && /same gap run the other way/.test(text) && !ways.some(({ s, n }) => s.variable === "$old" && Math.abs(state.$new - n + gap) <= dragStep(s) + 1e-9)) {
      problems.push(`"${text}" says the same gap runs the other way, but from a new rate of ${state.$new}% it does not`);
    }
  }
  return problems;
}

describe("Guided Tasks state nothing false for the sliders' current values (B7, Done when)", () => {
  for (const recipe of RECIPES) {
    recipe.examples.forEach((example, i) => {
      const built = recipe.build(example);
      if (!built.ok) return;
      const sliders = parsedSliders(parsedChildren(built.code));
      if (!sliders.length || !parsedTasks(parsedChildren(built.code)).length) return;
      it(`${recipe.id} example ${i + 1}, at ${POSITIONS} random positions`, () => {
        const random = seeded(i * 7919 + recipe.id.length);
        const start = declaredSettings(built.code);
        // Rate move's first gap, new less old, which "the same gap run the other way" claims.
        const gap = recipe.id === "rate_move" ? start.$new - start.$old : undefined;
        expect(falseTasks(built.code, start, gap), "at the opening values").toEqual([]);
        for (let k = 0; k < POSITIONS; k++) {
          const state = { ...start, ...Object.fromEntries(sliders.map((s) => [s.variable, position(s, random)])) };
          expect(falseTasks(built.code, state, gap)).toEqual([]);
        }
      });
    });
  }

  it("covers at least the rate move, savings and loan recipes", () => {
    const covered = RECIPES.filter((r) =>
      r.examples.some((e) => {
        const built = r.build(e);
        return built.ok && parsedTasks(parsedChildren(built.code)).length > 0;
      }),
    ).map((r) => r.id);
    expect(covered).toContain("rate_move");
    expect(covered.length).toBeGreaterThanOrEqual(5);
  });

  it("catches the audited falsehood: a fixed 4% beside an old rate restored to 4.31%", () => {
    // The task as it was written before B7: the old rate at a fixed number.
    const before = [
      'root = Widget("A savings rate from 4% to 5%", [control, tasks])',
      "$old = 4",
      "$new = 5",
      'control = Slider("new", "New rate", 0, 20, 0.01, $new, "percent")',
      'oldControl = Slider("old", "Old rate", 0, 20, 0.01, $old, "percent")',
      "tasks = GuidedTasks([task1])",
      'task1 = GuidedTask("Move the new rate to 4% and watch the move shrink to nothing", $new == 4)',
    ].join("\n");
    expect(falseTasks(before, { $old: 4.31, $new: 5.78 })).toEqual(['"Move the new rate to 4% and watch the move shrink to nothing" says the move shrinks to nothing, but the old rate is 4.31%']);
    expect(falseTasks(before, { $old: 4, $new: 5 })).toEqual([]);
  });

  it("rate move reads the old rate as it stands, and names the old rate that turns the gap round from the new rate now", () => {
    const built = RECIPES.find((r) => r.id === "rate_move")!.build({ title: "A savings rate from 4% to 5%", inputs: { old: 4, new: 5 }, refs: {}, facts: {} });
    if (!built.ok) throw new Error(built.error);
    const tasks = parsedTasks(parsedChildren(lenientTaskCode(built.code)));
    const restored = { $old: 4.31, $new: 5.78 };
    expect(fillTaskText(tasks[0].text, run(tasks[0].values, restored) as Record<string, unknown>)).toBe("Move the new rate to the old rate, 4.31%, and watch the move shrink to nothing");
    expect(fillTaskText(tasks[1].text, run(tasks[1].values, restored) as Record<string, unknown>)).toBe("Now set the old rate to 6.78% and see the same gap run the other way");
    expect(run(tasks[1].show, restored)).toBe(true);
    // Past 20% there is no such old rate on the slider, so the task is not shown.
    expect(run(tasks[1].show, { $old: 4, $new: 19.5 })).toBe(false);
    // Each ticks within one drag step (0.1 points) of the rate it names, wherever the other slider is.
    expect(run(tasks[0].condition, { $old: 4.31, $new: 4.33 })).toBe(true);
    expect(run(tasks[0].condition, { $old: 4.31, $new: 4.6 })).toBe(false);
    expect(run(tasks[1].condition, { $old: 6.8, $new: 5.78 })).toBe(true);
    expect(run(tasks[1].condition, { $old: 6.5, $new: 5.78 })).toBe(false);
  });

  it("leaves a comparison inside arithmetic exactly as written (review: precedence)", () => {
    const code = (condition: string) =>
      [
        'root = Widget("Two", [a, b, tasks])',
        "$a = 1",
        "$b = 2",
        'a = Slider("a", "A", 0, 10, 1, $a, "years")',
        'b = Slider("b", "B", 0, 10, 1, $b, "years")',
        "tasks = GuidedTasks([task1])",
        `task1 = GuidedTask("Make them equal", ${condition})`,
      ].join("\n");
    for (const condition of ["$a - $b == 0", "$a == $b * 2", "$a == 1e1", "$a-3 == $b"]) {
      expect(lenientTaskCode(code(condition)).split("\n").at(-1)).toBe(`task1 = GuidedTask("Make them equal", ${condition})`);
    }
    // A bounded comparison is still made lenient.
    expect(lenientTaskCode(code("$a == 3 && $b == 4")).split("\n").at(-1)).toMatch(/^task1 = GuidedTask\("Make them equal", \(\$a != null && .*\) && \(\$b != null && .*\)\)$/);
  });
});

// The Workbenches' Things to try (spec 2026-11-12, B7 and Done when), as the OpenUI tasks above: at the opening and at 60
// seeded random lever positions every task's words stay the same and its condition is worked out (no throw, no NaN);
// and every task that depends on where the levers are can be done, found by moving each lever across its range and
// each pair of levers over a 41 by 41 grid. A task that depends on how the Learner moved ("one lever at a time") is
// left to the view's own tests.
describe("Workbench Things to try state nothing false at random lever positions (B7, Done when)", () => {
  for (const recipe of RECIPES.filter((r) => r.archetype === "workbench")) {
    recipe.examples.forEach((example, i) => {
      it(`${recipe.id} example ${i + 1}, at ${POSITIONS} random positions`, () => {
        const built = recipe.build(example);
        if (!built.ok) throw new Error(built.error);
        const node = widgetNodes(built.code).find((n) => workbenchEntry(n.typeName));
        expect(node).toBeDefined();
        const entry = workbenchEntry(node!.typeName)!;
        const start = declaredSettings(built.code);
        const at = (state: Record<string, number>) => run(node!.props, state) as Record<string, unknown>;
        expect(entry.problem(at(start)), "the example's figures parse").toBeNull();
        const tasks = entry.tasks(at(start));
        expect(tasks.length).toBeGreaterThan(0);
        expect(tasks.length).toBeLessThanOrEqual(3);
        for (const t of tasks) expect(t).not.toMatch(/\{\w+\}|NaN|undefined|Infinity/);
        const levers = entry.levers(at(start)).map((l) => {
          const ref = node!.props[l.prop] as { k?: string; n?: string } | undefined;
          return { ...l, variable: ref?.k === "StateRef" ? ref.n! : null };
        });
        expect(levers.every((l) => l.variable !== null), "every lever is bound to a $variable").toBe(true);

        const random = seeded(i * 104729 + recipe.id.length);
        const onGrid = (l: (typeof levers)[number], u: number) => Number((l.min + Math.round((u * (l.max - l.min)) / l.step) * l.step).toFixed(10));
        for (let k = 0; k <= POSITIONS; k++) {
          const state = k === 0 ? start : { ...start, ...Object.fromEntries(levers.map((l) => [l.variable!, onGrid(l, random())])) };
          const props = at(state);
          expect(entry.tasks(props), "the words never follow a lever").toEqual(tasks);
          const holds = entry.conditions(props);
          expect(holds).toHaveLength(tasks.length);
          for (const h of holds) expect(h === null || typeof h === "boolean").toBe(true);
        }

        // Every task that depends on where the levers are holds somewhere they can reach.
        const reachable = tasks.map((_, t) => entry.conditions(at(start))[t] !== false);
        const sweep = (n: number) => Array.from({ length: n }, (_, j) => j / (n - 1));
        for (const l of levers) {
          for (const u of sweep(201)) {
            entry.conditions(at({ ...start, [l.variable!]: onGrid(l, u) })).forEach((h, t) => h && (reachable[t] = true));
          }
        }
        for (let x = 0; x < levers.length; x++) {
          for (let y = x + 1; y < levers.length; y++) {
            if (reachable.every(Boolean)) break;
            for (const u of sweep(41)) {
              for (const v of sweep(41)) {
                const state = { ...start, [levers[x].variable!]: onGrid(levers[x], u), [levers[y].variable!]: onGrid(levers[y], v) };
                entry.conditions(at(state)).forEach((h, t) => h && (reachable[t] = true));
              }
            }
          }
        }
        expect(tasks.filter((_, t) => !reachable[t]), "tasks no lever setting can tick").toEqual([]);
      });
    });
  }
});
