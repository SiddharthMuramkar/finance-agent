import { readFileSync } from "node:fs";
import { createParser, evaluate, type LibraryJSONSchema } from "@openuidev/lang-core";
import { parsedSliders, parsedTasks, stateRefs, type ParsedSlider } from "../widgets/guided-tasks.ts";
import type { Topic } from "./map.ts";

// The course check for Guided Tasks. Each task in a Topic's explore Widget must be reachable (some
// position of the sliders it reads makes its condition true) and must not already be done at the start.
// No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

type Frozen = { schema: LibraryJSONSchema };
const frozen = JSON.parse(readFileSync(new URL("../widgets/frozen.generated.json", import.meta.url), "utf8")) as Frozen;
const parser = createParser(frozen.schema, "Widget");

/** Most slider positions tried for one task; a task over several sliders is tried on every combination. */
const MAX_POSITIONS = 200_000;

/** Every position a slider can be dragged to, from its minimum in steps. Rounded so 0.1 + 0.2 stays 0.3. */
function positions(s: ParsedSlider): number[] {
  const count = Math.floor((s.max - s.min) / s.step + 1e-9) + 1;
  return Array.from({ length: Math.max(count, 0) }, (_, i) => Number((s.min + i * s.step).toFixed(10)));
}

/** True when the expression holds with these $variable values (anything but exactly true is false). */
function holds(condition: unknown, values: Record<string, unknown>): boolean {
  return evaluate(condition as never, { getState: (name) => values[name], resolveRef: () => undefined }) === true;
}

/** Problems in one explore Widget's Guided Tasks; empty when each task can be reached and none starts done. */
export function guidedTaskCheck(topicId: string, code: string): string[] {
  const result = parser.parse(code);
  const children = result.root?.props.children;
  const sliders = parsedSliders(children);
  const start = result.stateDeclarations as Record<string, unknown>;
  return parsedTasks(children).flatMap((task) => {
    const where = `Topic "${topicId}" Guided Task "${task.text}" (${task.id})`;
    const read = [...new Set(stateRefs(task.condition))];
    const used = sliders.filter((s) => read.includes(s.variable));
    if (!used.length) return [`${where} reads no value bound to a slider`];
    if (holds(task.condition, start)) return [`${where} is already done at the start (${used.map((s) => `${s.variable} = ${start[s.variable]}`).join(", ")})`];
    const grids = used.map(positions);
    if (grids.reduce((n, g) => n * g.length, 1) > MAX_POSITIONS) return [`${where} reads too many slider positions to check`];
    // Every combination of the sliders it reads, the others held at their starting value.
    let reachable = false;
    const walk = (i: number, values: Record<string, unknown>) => {
      if (reachable) return;
      if (i === used.length) {
        reachable = holds(task.condition, values);
        return;
      }
      for (const p of grids[i]) walk(i + 1, { ...values, [used[i].variable]: p });
    };
    walk(0, { ...start });
    return reachable ? [] : [`${where} can never be reached on its slider: no position of ${used.map((s) => s.variable).join(", ")} makes it true`];
  });
}

/** Problems in the Guided Tasks of every Topic's explore Widget. */
export function guidedTaskCheckErrors(topics: readonly Pick<Topic, "id" | "explore">[]): string[] {
  return topics.flatMap((t) => (t.explore?.widget ? guidedTaskCheck(t.id, t.explore.widget) : []));
}
