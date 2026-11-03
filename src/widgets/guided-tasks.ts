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

type Node = { typeName?: unknown; statementId?: string; props?: Record<string, unknown> };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every $variable a parsed expression reads, e.g. `$rate >= 3 && $rate <= 4` reads ["$rate"]. */
export function stateRefs(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(stateRefs);
  if (!isRecord(node)) return [];
  if (node.k === "StateRef" && typeof node.n === "string") return [node.n];
  return Object.values(node).flatMap(stateRefs);
}

const nodesOf = (children: unknown): Node[] => (Array.isArray(children) ? children : []).filter(isRecord) as Node[];

/** A Slider among a Widget's children, as parsed: the $variable it is bound to and its range. */
export type ParsedSlider = { variable: string; min: number; max: number; step: number };

export function parsedSliders(children: unknown): ParsedSlider[] {
  return nodesOf(children).flatMap((n) => {
    if (n.typeName !== "Slider") return [];
    const { value, min, max, step } = n.props ?? {};
    if (!isRecord(value) || value.k !== "StateRef" || typeof value.n !== "string") return [];
    if (typeof min !== "number" || typeof max !== "number" || typeof step !== "number") return [];
    return [{ variable: value.n, min, max, step }];
  });
}

/** One Guided Task as parsed: its text and its condition (an expression node, left as parsed). */
export type ParsedTask = { id: string; text: string; condition: unknown };

/** The Guided Tasks of a Widget's children, in order, across every GuidedTasks among them. */
export function parsedTasks(children: unknown): ParsedTask[] {
  return nodesOf(children)
    .filter((n) => n.typeName === "GuidedTasks")
    .flatMap((group) => (Array.isArray(group.props?.tasks) ? (group.props.tasks as unknown[]) : []))
    .map((t, i): ParsedTask => {
      const task = (isRecord(t) ? t : {}) as Node;
      return { id: task.statementId ?? `task ${i + 1}`, text: typeof task.props?.text === "string" ? task.props.text : "", condition: task.props?.done };
    });
}

/**
 * Problems in the Widget's Guided Tasks, which the parser cannot see: a task whose condition reads no
 * $variable bound to a Slider in the Widget (so nothing the Learner does could tick it).
 */
export function guidedTaskProblems(children: unknown): string[] {
  const sliders = new Set(parsedSliders(children).map((s) => s.variable));
  return parsedTasks(children).flatMap((task) => {
    if (stateRefs(task.condition).some((name) => sliders.has(name))) return [];
    return [
      `${task.id}: the condition reads no value bound to a Slider in this widget, so no slider move could tick it. Write it with a $variable that a Slider uses, such as $rate == 0.`,
    ];
  });
}
