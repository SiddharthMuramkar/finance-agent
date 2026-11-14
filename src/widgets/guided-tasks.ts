// The pure part of Guided Tasks: the order they tick in, and what the server and the course check read
// from a parsed Widget. No React and no "@/" imports, so the course check (`scripts/check-course.mjs`,
// plain Node) can share it.

export type TaskState = "done" | "current" | "todo";

/**
 * How many tasks are done after this render. Tasks tick in order: only the first task not yet done can
 * tick, and when it does the next one is looked at straight away. Never less than `reached`, so a task
 * that has ticked stays ticked even when the Learner moves the slider away again.
 */
export function advanceReached(reached: number, conditions: readonly boolean[]): number {
  let next = reached;
  while (next < conditions.length && conditions[next]) next++;
  return next;
}

/** Each task's state given how many are done: the first one not done is the current task. */
export function taskStates(count: number, reached: number): TaskState[] {
  return Array.from({ length: count }, (_, i) => (i < reached ? "done" : i === reached ? "current" : "todo"));
}

/**
 * One Guided Task as the browser holds it (spec 2026-11-12, B7): its key (the text as written, which saved ticks name),
 * the words drawn now (the text with each `{name}` filled from the task's live values), whether its claim can hold for
 * the current settings (`shown`), and whether its condition holds (`met`).
 */
export type LiveTask = { key: string; text: string; shown: boolean; met: boolean };

/** A Guided Task's state as drawn; a task whose claim cannot hold now is hidden. */
export type LiveTaskState = TaskState | "hidden";

/**
 * The keys of the tasks done after this render, in task order. Tasks tick in order among those shown: only the first
 * shown task not yet done can tick, and when it does the next is looked at straight away. A hidden task neither ticks
 * nor holds up the ones after it. A task done stays done (`done` only grows), so moving a slider away never unticks it.
 */
export function advanceDone(done: readonly string[], tasks: readonly LiveTask[]): string[] {
  const now = new Set(done);
  for (const task of tasks) {
    if (now.has(task.key) || !task.shown) continue;
    if (!task.met) break;
    now.add(task.key);
  }
  return tasks.filter((t) => now.has(t.key)).map((t) => t.key);
}

/** Each task's state: done; the first shown task not done is current; later shown ones are to do; the rest hidden. */
export function liveTaskStates(tasks: readonly LiveTask[], done: readonly string[]): LiveTaskState[] {
  const finished = new Set(done);
  let current = false;
  return tasks.map((t) => {
    if (finished.has(t.key)) return "done";
    if (!t.shown) return "hidden";
    if (current) return "todo";
    current = true;
    return "current";
  });
}

/** The keys of a Widget's tasks that a saved Widget state already ticked, in task order. */
export function savedDone(keys: readonly string[], ticked: readonly string[]): string[] {
  const saved = new Set(ticked);
  return keys.filter((k) => saved.has(k));
}

/** The `{name}` slots a task's text names, e.g. ["old"] for "Move the new rate to the old rate, {old}%". */
export function taskSlots(text: string): string[] {
  return [...new Set([...text.matchAll(/\{([A-Za-z_]\w*)\}/g)].map((m) => m[1]))];
}

/** A number as a task's words write it: no float noise, at most four decimals ("4.31", "12.5"). */
const taskNumber = (n: number) => String(Number(n.toFixed(4)));

/**
 * A task's words with each `{name}` filled from `values` (B7): "Move the new rate to the old rate, {old}%" with
 * {old: 4.31} reads "Move the new rate to the old rate, 4.31%". A slot with no finite number stays as written.
 */
export function fillTaskText(text: string, values: Readonly<Record<string, unknown>> | null | undefined): string {
  if (!values) return text;
  return text.replace(/\{([A-Za-z_]\w*)\}/g, (slot, name: string) => {
    const v = values[name];
    return typeof v === "number" && Number.isFinite(v) ? taskNumber(v) : slot;
  });
}

/** One component of a parsed Widget, as the parser hands it over: its name, its statement (if it has one) and its props. */
export type ParsedNode = { typeName: string; statementId?: string; props: Record<string, unknown> };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNode = (v: unknown): v is ParsedNode => isRecord(v) && typeof v.typeName === "string" && isRecord(v.props);

/**
 * Every component in a parsed value, depth first in the order it is written: the value itself when it is one,
 * then everything inside its props, lists and nested children. A Slider in a Stack inside a TabItem is found
 * like one at the top of the Widget. Expressions ($rate, a Query's result) hold no finished components, so
 * they add nothing.
 */
export function* walkNodes(value: unknown): Generator<ParsedNode> {
  if (Array.isArray(value)) {
    for (const item of value) yield* walkNodes(item);
  } else if (isNode(value)) {
    yield value;
    yield* walkNodes(Object.values(value.props));
  } else if (isRecord(value)) {
    yield* walkNodes(Object.values(value));
  }
}

/** Every $variable a parsed expression reads, e.g. `$rate >= 3 && $rate <= 4` reads ["$rate"]. */
export function stateRefs(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(stateRefs);
  if (!isRecord(node)) return [];
  if (node.k === "StateRef" && typeof node.n === "string") return [node.n];
  return Object.values(node).flatMap(stateRefs);
}

/** A Slider in a Widget, as parsed: the $variable it is bound to, its range and its unit ("percent" moves in 0.01 steps). */
export type ParsedSlider = { variable: string; min: number; max: number; step: number; unit?: string };

/** Every Slider in a Widget's children, at any depth (inside a Stack, a Card or a TabItem too), in order. */
export function parsedSliders(children: unknown): ParsedSlider[] {
  return [...walkNodes(children)].flatMap((n) => {
    if (n.typeName !== "Slider") return [];
    const { value, min, max, step, unit } = n.props;
    if (!isRecord(value) || value.k !== "StateRef" || typeof value.n !== "string") return [];
    if (typeof min !== "number" || typeof max !== "number" || typeof step !== "number") return [];
    return [{ variable: value.n, min, max, step, ...(typeof unit === "string" && { unit }) }];
  });
}

/**
 * One Guided Task as parsed: its text as written (with any `{name}` slots), its condition, and, when written, the
 * condition under which its claim can hold (`show`) and the live values its slots read (`values`: name to expression).
 * Expressions are left as parsed.
 */
export type ParsedTask = { id: string; text: string; condition: unknown; show?: unknown; values?: Record<string, unknown> };

/** The Guided Tasks of a Widget's children, in order, across every GuidedTasks among them at any depth. */
export function parsedTasks(children: unknown): ParsedTask[] {
  return [...walkNodes(children)]
    .filter((n) => n.typeName === "GuidedTasks")
    .flatMap((group) => (Array.isArray(group.props.tasks) ? (group.props.tasks as unknown[]) : []))
    .map((t, i): ParsedTask => {
      const task = isNode(t) ? t : undefined;
      const show = task?.props.show;
      const values = task?.props.values;
      return {
        id: task?.statementId ?? `task ${i + 1}`,
        text: typeof task?.props.text === "string" ? task.props.text : "",
        condition: task?.props.done,
        ...(show !== undefined && show !== null && { show }),
        ...(isRecord(values) && !isRecord(values.k) && typeof values.k !== "string" && { values: values as Record<string, unknown> }),
      };
    });
}

/**
 * Problems in the Widget's Guided Tasks, which the parser cannot see: a task whose condition reads no
 * $variable bound to a Slider in the Widget (so nothing the Learner does could tick it).
 */
export function guidedTaskProblems(children: unknown): string[] {
  const sliders = new Set(parsedSliders(children).map((s) => s.variable));
  return parsedTasks(children).flatMap((task) => {
    const problems: string[] = [];
    if (!stateRefs(task.condition).some((name) => sliders.has(name))) {
      problems.push(
        `${task.id}: the condition reads no value bound to a Slider in this widget, so no slider move could tick it. Write it with a $variable that a Slider uses, such as $rate == 0.`,
      );
    }
    const missing = taskSlots(task.text).filter((name) => !task.values || !(name in task.values));
    if (missing.length) {
      problems.push(`${task.id}: the text names ${missing.map((m) => `{${m}}`).join(", ")} but values gives no number for it. Write values {${missing[0]}: $variable}.`);
    }
    return problems;
  });
}

/**
 * How many tasks a saved Widget state already has done: the tasks from the first on whose texts it ticked, up to
 * the first it did not (ticks are in order, so a gap ends them).
 */
export function savedReached(texts: readonly string[], ticked: readonly string[]): number {
  const done = new Set(ticked);
  let reached = 0;
  while (reached < texts.length && done.has(texts[reached])) reached++;
  return reached;
}

/** How many evenly spaced positions of a slider's range a task is tried at, to see how much of the range ticks it. */
const BROAD_SAMPLES = 41;

/**
 * Warnings (never errors) for Guided Tasks that most of a slider's range ticks: such a task is not a discovery task,
 * it ticks the moment the Learner moves. Each task is tried along every slider it reads, one at a time, with the other
 * sliders at their starting values (`start`, the Widget's declared $variables); `holds` says whether a condition is
 * true for these values. Tasks that read no slider, or whose slider has no range, are left to guidedTaskProblems.
 */
export function broadTaskWarnings(
  children: unknown,
  start: Record<string, unknown>,
  holds: (condition: unknown, values: Record<string, unknown>) => boolean,
): string[] {
  const sliders = parsedSliders(children);
  return parsedTasks(children).flatMap((task) => {
    const read = new Set(stateRefs(task.condition));
    return sliders
      .filter((s) => read.has(s.variable) && s.max > s.min)
      .flatMap((s) => {
        let ticks = 0;
        for (let i = 0; i < BROAD_SAMPLES; i++) {
          if (holds(task.condition, { ...start, [s.variable]: s.min + ((s.max - s.min) * i) / (BROAD_SAMPLES - 1) })) ticks++;
        }
        if (ticks * 2 <= BROAD_SAMPLES) return [];
        return [
          `${task.id}: more than half of ${s.variable}'s range ticks "${task.text}", so it is not a discovery task. Name the value to find (a narrow range, or the break-even), not a region that most positions satisfy.`,
        ];
      });
  });
}
