import { readFileSync } from "node:fs";
import { createParser, evaluate, type LibraryJSONSchema } from "@openuidev/lang-core";
import { broadTaskWarnings, parsedSliders, parsedTasks, stateRefs, type ParsedSlider } from "../widgets/guided-tasks.ts";
import { sliderStep } from "../widgets/slider-steps.ts";
import type { Topic } from "./map.ts";
import { withOnlyTask, withRevealTask, type OnlyTask } from "./written-ahead.ts";

// The course check for written-ahead Widgets (spec #119, "Owner tooling › The course check"): each one can be drawn,
// its sliders' defaults sit on their steps, and each Guided Task can be reached and is not done at the start. A task
// is tried with the numbers it names plus each slider's min, max and default, not every position, so sliders in 0.01
// steps stay checkable. A Widget with a reveal task is checked again with that task added, since its numbers come from
// Case Data in the database: there with its slider's min and max standing in for them.
// No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

type Frozen = { schema: LibraryJSONSchema };
const frozen = JSON.parse(readFileSync(new URL("../widgets/frozen.generated.json", import.meta.url), "utf8")) as Frozen;
const parser = createParser(frozen.schema, "Widget");

/** True when the expression holds with these $variable values (anything but exactly true is false). */
function holds(condition: unknown, values: Record<string, unknown>): boolean {
  return evaluate(condition as never, { getState: (name) => values[name], resolveRef: () => undefined }) === true;
}

/** Every number written in a parsed expression, e.g. `$old == 6 && $new == 6.4` names [6, 6.4]. */
function namedNumbers(node: unknown): number[] {
  if (Array.isArray(node)) return node.flatMap(namedNumbers);
  if (typeof node !== "object" || node === null) return [];
  const n = node as Record<string, unknown>;
  if (n.k === "Num" && typeof n.v === "number") return [n.v];
  return Object.values(n).flatMap(namedNumbers);
}

/** True when the value is a position the slider can be set to: inside its range and on one of its steps. */
function onStep(value: number, s: ParsedSlider): boolean {
  if (value < s.min - 1e-9 || value > s.max + 1e-9) return false;
  const steps = (value - s.min) / sliderStep(s);
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

/** What stops the code drawing: the parser's errors, no root, or names it never defines. */
function drawProblems(code: string): string[] {
  try {
    const result = parser.parse(code);
    const problems = result.meta.errors.filter((e) => e.severity !== "warning").map((e) => `${e.statementId ?? e.component}: ${e.message}`);
    if (!result.root) problems.push("no root = Widget(...) statement");
    if (result.meta.unresolved.length) problems.push(`undefined names: ${result.meta.unresolved.join(", ")}`);
    return problems;
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)];
  }
}

/** Problems in one Widget's code as drawn: its defaults and its Guided Tasks. `where` names it in each message. */
function codeProblems(where: string, code: string): string[] {
  const drawn = drawProblems(code);
  if (drawn.length) return [`${where} cannot be drawn: ${drawn.join("; ")}`];
  const result = parser.parse(code);
  const children = result.root?.props.children;
  const sliders = parsedSliders(children);
  const start = result.stateDeclarations as Record<string, unknown>;
  const problems: string[] = [];
  for (const s of sliders) {
    const value = start[s.variable];
    if (typeof value !== "number") problems.push(`${where}: ${s.variable} has no starting number`);
    else if (value < s.min || value > s.max) problems.push(`${where}: ${s.variable} starts at ${value}, outside ${s.min} to ${s.max}`);
    else if (!onStep(value, s)) problems.push(`${where}: ${s.variable} starts at ${value}, which is not on a step of ${sliderStep(s)} from ${s.min}`);
  }
  for (const task of parsedTasks(children)) {
    const at = `${where} Guided Task "${task.text}" (${task.id})`;
    const used = sliders.filter((s) => stateRefs(task.condition).includes(s.variable));
    if (!used.length) {
      problems.push(`${at} reads no value bound to a slider`);
      continue;
    }
    if (holds(task.condition, start)) {
      problems.push(`${at} is already done at the start (${used.map((s) => `${s.variable} = ${start[s.variable]}`).join(", ")})`);
      continue;
    }
    // The numbers the task names, and each slider's min, max and default, wherever the slider can be set to them.
    const named = namedNumbers(task.condition);
    const tries = used.map((s) => [...new Set([...named, s.min, s.max, start[s.variable] as number])].filter((v) => typeof v === "number" && onStep(v, s)));
    let reached = false;
    const walk = (i: number, values: Record<string, unknown>) => {
      if (reached) return;
      if (i === used.length) {
        reached = holds(task.condition, values);
        return;
      }
      for (const v of tries[i]) walk(i + 1, { ...values, [used[i].variable]: v });
    };
    walk(0, { ...start });
    if (!reached) problems.push(`${at} can never be reached: none of the numbers it names, nor any slider's min, max or default, makes it true`);
  }
  return problems;
}

/** Problems in one written-ahead Widget, with its reveal task added too when it has one. */
export function writtenAheadCheck(topicId: string, widget: Topic["widgets"][number]): string[] {
  const where = `Topic "${topicId}" written-ahead Widget "${widget.id}"`;
  const problems = codeProblems(where, widget.code);
  const task = widget.revealTask;
  if (!task || problems.length) return problems;
  // Case Data lives in the database, so the first slider's min and max stand in for the move's numbers.
  const first = parsedSliders(parser.parse(widget.code).root?.props.children)[0];
  if (!first) return [`${where} has a reveal task but no slider for it`];
  return codeProblems(`${where} with its reveal task added`, withRevealTask(widget.code, task, { before: first.min, after: first.max }));
}

/** The written-ahead Widget Home shows and the one task it gives it (src/app/_landing/home-widget-spec.ts). */
export type OnlyTaskWidget = { topic: string; widget: string; task: OnlyTask };

/** Problems in the written-ahead Widget Home shows, as Home draws it: with its own tasks swapped for Home's one. */
export function onlyTaskCheckErrors(topics: readonly Pick<Topic, "id" | "widgets">[], home: OnlyTaskWidget): string[] {
  const widget = topics.find((t) => t.id === home.topic)?.widgets.find((w) => w.id === home.widget);
  if (!widget) return [`Topic "${home.topic}" has no written-ahead Widget "${home.widget}", which Home shows`];
  return codeProblems(`Topic "${home.topic}" written-ahead Widget "${home.widget}" with only Home's task`, withOnlyTask(widget.code, home.task));
}

/** Problems in every Topic's written-ahead Widgets. */
export function writtenAheadCheckErrors(topics: readonly Pick<Topic, "id" | "widgets">[]): string[] {
  return topics.flatMap((t) => t.widgets.flatMap((w) => writtenAheadCheck(t.id, w)));
}

/**
 * Warnings (not errors) about every Topic's written-ahead Widgets: a Guided Task that more than half of a slider's range
 * ticks is not a discovery task. For the course check to print beside its errors; they never fail it.
 */
export function writtenAheadCheckWarnings(topics: readonly Pick<Topic, "id" | "widgets">[]): string[] {
  return topics.flatMap((t) =>
    t.widgets.flatMap((w) => {
      if (drawProblems(w.code).length) return [];
      const result = parser.parse(w.code);
      return broadTaskWarnings(result.root?.props.children, result.stateDeclarations as Record<string, unknown>, holds).map(
        (warning) => `Topic "${t.id}" written-ahead Widget "${w.id}": ${warning}`,
      );
    }),
  );
}
