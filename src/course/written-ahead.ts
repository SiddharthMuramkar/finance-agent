import type { CaseData } from "../case-data/case-data";
import type { Topic, WrittenAheadSpec } from "./map.ts";

// Written-ahead Widgets (spec #119, "Widgets › Written-ahead Widgets"): Widgets written in a Topic file, which the
// Tutor opens by id (open_widget in src/tutor/tools.ts) and never draws a version of its own. Pure: no React, no
// database and no "@/" imports, so the course check (scripts/check-course.mjs, plain Node) can share it. It imports
// only types, so the browser can use it without the Course Map's file reading.

/** The title a Widget's code gives in its root = Widget("Title", ...) line, or null when it has none. */
export function widgetCodeTitle(code: string): string | null {
  return code.match(/^root = Widget\("([^"]+)"/m)?.[1]?.trim() || null;
}

/**
 * A written-ahead Widget as the Workspace draws it: its id (its Widget key), its title and its code now, and the two
 * sliders whose rate change code works out for the Tutor, when it says one (WrittenAheadSpec's rateChange).
 */
export type WrittenAhead = { id: string; title: string; code: string; rateChange?: WrittenAheadSpec["rateChange"] };

/** The Session item kind stored when the Tutor opens a written-ahead Widget: it stands where it was opened, as a chip. */
export const WIDGET_OPENED = "widget_opened";

/** The move a dataset made across its Case's as-of date: the last value on or before it, and the first after it. */
export type RevealMove = { before: number; after: number };

/** Rounds a Case Data value to two decimals, the steps a percent slider takes, so a task's condition can be met exactly. */
const twoDecimals = (value: number) => Number(value.toFixed(2));

/**
 * The move the dataset made across the Case's as-of date, read from Case Data as the as-of rule gives it: null
 * before the reveal (nothing after the as-of date is given), or when the dataset has no point on one side.
 */
export function revealMove(data: CaseData | undefined, datasetId: string): RevealMove | null {
  if (!data?.revealed) return null;
  const points = data.datasets.find((d) => d.id === datasetId)?.points ?? [];
  const before = points.filter((p) => p.date <= data.asOf).at(-1);
  const after = points.find((p) => p.date > data.asOf);
  return before && after ? { before: twoDecimals(before.value), after: twoDecimals(after.value) } : null;
}

/** The statement name the reveal task is written under; no Topic Widget may use it for anything else. */
const REVEAL_TASK = "revealTask";

/** The statement name a Widget's only task is written under (withOnlyTask); no Topic Widget may use it for anything else. */
const ONLY_TASK = "onlyTask";

/** A Guided Task given from outside the Topic file: its text and its done condition, e.g. `$rate == 0`. */
export type OnlyTask = { text: string; done: string };

/** The Widget's code with its GuidedTasks list, wherever it is written, rewritten by `list` (the names inside the brackets). */
const withTaskList = (code: string, list: (tasks: string) => string) => code.replace(/GuidedTasks\(\[([^\]]*)\]\)/, (_, tasks: string) => `GuidedTasks([${list(tasks.trim())}])`);

const fill = (template: string, move: RevealMove) => template.replaceAll("{before}", String(move.before)).replaceAll("{after}", String(move.after));

/**
 * The slider named `name` with one more quick button, `{value, note}`, added last to its quick buttons (the list after
 * its unit), or given a list of its own. Slider lines are one line each in a Topic file.
 */
function withQuickButton(code: string, name: string, value: number, note: string): string {
  const button = `{value: ${value}, note: ${JSON.stringify(note)}}`;
  return code.replace(new RegExp(`^(\\w+ = Slider\\(${JSON.stringify(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},.*?)\\)\\s*$`, "m"), (line: string, call: string) => {
    const list = call.match(/^(.*), \[([^\]]*)\]$/);
    return list ? `${list[1]}, [${list[2].trim() ? `${list[2]}, ` : ""}${button}])` : `${call}, [${button}])`;
  });
}

/**
 * The Widget's code with its reveal task added last to its GuidedTasks, its numbers filled in from the move, and its
 * reveal quick button (when it has one) added to its slider, set to the move's {before} value.
 */
export function withRevealTask(code: string, task: NonNullable<WrittenAheadSpec["revealTask"]>, move: RevealMove): string {
  const joined = withTaskList(code, (tasks) => `${tasks ? `${tasks}, ` : ""}${REVEAL_TASK}`);
  const quick = task.quick ? withQuickButton(joined, task.quick.slider, move.before, task.quick.note) : joined;
  return `${quick.trimEnd()}\n${REVEAL_TASK} = GuidedTask(${JSON.stringify(fill(task.text, move))}, ${fill(task.done, move)})`;
}

/**
 * The Widget's code with its own Guided Tasks swapped for one task: its GuidedTask statements dropped and its
 * GuidedTasks list naming only the new one. Home's copy of a Widget (src/app/_landing/home-widget-data.ts) is this.
 */
export function withOnlyTask(code: string, task: OnlyTask): string {
  const lines = code.trimEnd().split("\n").filter((line) => !/^\w+ = GuidedTask\(/.test(line));
  return `${withTaskList(lines.join("\n"), () => ONLY_TASK)}\n${ONLY_TASK} = GuidedTask(${JSON.stringify(task.text)}, ${task.done})`;
}

/** The Topic's written-ahead Widgets as written, before any reveal: the course check and the Tutor's context read these. */
export function writtenAheadWidgets(topic: Pick<Topic, "widgets">): WrittenAhead[] {
  return topic.widgets.map((w) => ({ id: w.id, title: widgetCodeTitle(w.code) ?? w.id, code: w.code, ...(w.rateChange && { rateChange: w.rateChange }) }));
}

/**
 * The Topic's written-ahead Widgets as the Learner sees them now: a Widget with a reveal task gets it once its Case's
 * reveal has been shown, with the numbers read from that Case's data (`cases`, loaded under the as-of rule for the
 * Learner). Before the reveal the task, and every number of it, is left out.
 */
export function writtenAheadFor(topic: Pick<Topic, "widgets">, cases: readonly (CaseData | undefined)[]): WrittenAhead[] {
  return topic.widgets.map((w) => {
    const title = widgetCodeTitle(w.code) ?? w.id;
    const task = w.revealTask;
    const move = task ? revealMove(cases.find((c) => c?.caseId === task.case), task.dataset) : null;
    return { id: w.id, title, code: task && move ? withRevealTask(w.code, task, move) : w.code, ...(w.rateChange && { rateChange: w.rateChange }) };
  });
}

/**
 * The written-ahead Widget whose parts a Tutor Widget uses: the parts it covers, by Widget. `held` marks the explore
 * Widget before the explore step (exploreHeldBack): it still covers its parts, but the Tutor may not open it yet.
 */
export type CoveredParts = { id: string; title: string; parts: string[]; held?: boolean };

/** What each of the Topic's written-ahead Widgets covers, so a Widget the Tutor draws may not use those parts. */
export function coveredParts(topic: Pick<Topic, "widgets">): CoveredParts[] {
  return topic.widgets.map((w) => ({ id: w.id, title: widgetCodeTitle(w.code) ?? w.id, parts: w.parts }));
}
