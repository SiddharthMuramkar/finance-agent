import { parsedChildren } from "./check";
import { parsedSliders, parsedTasks, type ParsedSlider } from "./guided-tasks";
import { declaredSettings } from "./settings";
import { dragStep } from "./slider-steps";

// Sliders a person can land on (spec 2026-11-12, B5), read from a Widget's code: the values its Guided Tasks name, where
// each slider stops and shows a chip, and the code the browser draws, in which a task that names a value ticks within one
// step of it. Pure: code in, numbers and code out.

/**
 * Where one slider can be landed on: the values it stops at when dragged near (task values and its opening value), its
 * chips (task values), and the other sliders' `$variables` whose current value a task names for it (`follows`: a task
 * `$new == $old` makes the old rate, wherever it is now, a stop and a chip of the new rate; B7).
 */
export type Landing = { stops: number[]; chips: number[]; follows?: string[] };

/** Each slider's landing, by its `$variable`. */
export type Landings = Record<string, Landing>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every `$variable == number` (either way round) in a parsed condition, at any depth of && and ||. */
export function namedValues(condition: unknown): { variable: string; value: number }[] {
  if (!isRecord(condition)) return [];
  if (condition.k === "BinOp" && condition.op === "==") {
    const { left, right } = condition as { left: unknown; right: unknown };
    const ref = (v: unknown) => (isRecord(v) && v.k === "StateRef" && typeof v.n === "string" ? v.n : null);
    const num = (v: unknown) => (isRecord(v) && v.k === "Num" && typeof v.v === "number" ? v.v : null);
    const variable = ref(left) ?? ref(right);
    const value = num(right) ?? num(left);
    if (variable !== null && value !== null) return [{ variable, value }];
  }
  return Object.values(condition).flatMap(namedValues);
}

/** Every `$a == $b` between two $variables in a parsed condition, at any depth of && and ||. */
export function namedVariables(condition: unknown): { variable: string; other: string }[] {
  if (!isRecord(condition)) return [];
  if (condition.k === "BinOp" && condition.op === "==") {
    const { left, right } = condition as { left: unknown; right: unknown };
    const ref = (v: unknown) => (isRecord(v) && v.k === "StateRef" && typeof v.n === "string" ? v.n : null);
    const [a, b] = [ref(left), ref(right)];
    if (a !== null && b !== null && a !== b) return [{ variable: a, other: b }];
  }
  return Object.values(condition).flatMap(namedVariables);
}

const unique = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);

/** The sliders of a Widget's code and the values its Guided Tasks name for each, inside the slider's range. */
function taskValues(code: string): { sliders: ParsedSlider[]; named: Map<string, number[]>; follows: Map<string, string[]> } {
  const children = parsedChildren(code);
  const sliders = parsedSliders(children);
  const named = new Map<string, number[]>();
  const follows = new Map<string, string[]>();
  const isSlider = (v: string) => sliders.some((s) => s.variable === v);
  for (const task of parsedTasks(children)) {
    // `$new == $old`: each slider follows the other, whose value it is asked to reach.
    for (const { variable, other } of namedVariables(task.condition)) {
      if (!isSlider(variable) || !isSlider(other)) continue;
      for (const [a, b] of [
        [variable, other],
        [other, variable],
      ]) {
        if (!(follows.get(a) ?? []).includes(b)) follows.set(a, [...(follows.get(a) ?? []), b]);
      }
    }
    for (const { variable, value } of namedValues(task.condition)) {
      const slider = sliders.find((s) => s.variable === variable);
      if (!slider || value < slider.min || value > slider.max) continue;
      named.set(variable, [...(named.get(variable) ?? []), value]);
    }
  }
  return { sliders, named, follows };
}

/** Each slider's stops (the values its Widget's Guided Tasks name, and its opening value) and chips (the task values). */
export function sliderLandings(code: string): Landings {
  const { sliders, named, follows } = taskValues(code);
  const opening = declaredSettings(code);
  return Object.fromEntries(
    sliders.map((s) => {
      const tasks = unique(named.get(s.variable) ?? []);
      const start = opening[s.variable];
      const stops = unique([...tasks, ...(typeof start === "number" && start >= s.min && start <= s.max ? [start] : [])]);
      const follow = follows.get(s.variable);
      return [s.variable, { stops, chips: tasks, ...(follow && { follows: follow }) }];
    }),
  );
}

/**
 * Each slider's landing with the current value of each slider it follows added as a stop and a chip (B7): with the old
 * rate at 4.31%, the new rate stops at 4.31% and shows its chip. Values outside the slider's range are left out.
 */
export function liveLandings(landings: Landings, values: Readonly<Record<string, unknown>>, ranges: Readonly<Record<string, { min: number; max: number }>> = {}): Landings {
  return Object.fromEntries(
    Object.entries(landings).map(([variable, landing]) => {
      const range = ranges[variable];
      const live = (landing.follows ?? [])
        .map((v) => values[v])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && (!range || (v >= range.min && v <= range.max)));
      if (!live.length) return [variable, landing];
      return [variable, { ...landing, stops: unique([...landing.stops, ...live]), chips: unique([...landing.chips, ...live]) }];
    }),
  );
}

/** Each slider's range by `$variable`, read from the Widget's code. */
export function sliderRanges(code: string): Record<string, { min: number; max: number }> {
  return Object.fromEntries(parsedSliders(parsedChildren(code)).map((s) => [s.variable, { min: s.min, max: s.max }]));
}

/** A number as OpenUI Lang writes it, without float noise. */
const written = (n: number) => String(Number(n.toPrecision(12)));

/** Length of the string literal that opens `text` (a GuidedTask's text), quotes included; 0 when it does not open with one. */
function literalLength(text: string): number {
  if (!text.startsWith('"')) return 0;
  for (let i = 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === '"') return i + 1;
  }
  return 0;
}

/**
 * The code as the browser draws it: in each GuidedTask, a condition `$x == N` on a slider becomes "within one drag step of
 * N" (B5), so a task that names a value ticks when the slider is that near. The task's text and everything else are left
 * as written; stored code, the checks and what the Tutor is told all read the code as written.
 */
export function lenientTaskCode(code: string): string {
  const { sliders } = taskValues(code);
  if (!sliders.length) return code;
  // Bounds written to 12 significant figures, so 4 ± 0.1 is 3.9 to 4.1 exactly as a slider's value is.
  const steps = new Map(sliders.map((s) => [s.variable, dragStep(s)]));
  const near = (variable: string, value: number) => {
    const step = steps.get(variable);
    // `!= null` first: before the Widget's state is set, a $variable reads as nothing, which a comparison would count as 0.
    return step === undefined ? null : `(${variable} != null && ${variable} >= ${written(value - step)} && ${variable} <= ${written(value + step)})`;
  };
  // `$a == $b` (B7: "move the new rate to the old rate"): within one drag step of the other slider's value now.
  const nearVariable = (a: string, b: string) => {
    const step = steps.get(a) ?? steps.get(b);
    return step === undefined ? null : `(${a} != null && ${b} != null && ${a} >= ${b} - ${written(step)} && ${a} <= ${b} + ${written(step)})`;
  };
  const NUMBER = "-?\\d+(?:\\.\\d+)?";
  // Only a comparison that stands as a whole operand is rewritten: one bounded by the start of an argument, a bracket,
  // && or || on each side. `$a - $b == 0`, `$a == $b * 2` and `$a == 1e1` are left exactly as written.
  const BEFORE = "(?<=(?:^|[(,]|&&|\\|\\|)\\s*)";
  const AFTER = "(?=\\s*(?:$|[),]|&&|\\|\\|))";
  const pattern = (body: string) => new RegExp(`${BEFORE}${body}${AFTER}`, "g");
  const ws = "\\s*==\\s*";
  const VAR = "(\\$\\w+)";
  return code
    .split("\n")
    .map((line) => {
      const head = line.match(/^(\s*\w+\s*=\s*GuidedTask\(\s*)/);
      if (!head) return line;
      const rest = line.slice(head[1].length);
      const text = literalLength(rest);
      if (!text) return line;
      const condition = rest
        .slice(text)
        .replace(pattern(`${VAR}${ws}${VAR}`), (match, a: string, b: string) => nearVariable(a, b) ?? match)
        .replace(pattern(`${VAR}${ws}(${NUMBER})`), (match, variable: string, value: string) => near(variable, Number(value)) ?? match)
        .replace(pattern(`(${NUMBER})${ws}${VAR}`), (match, value: string, variable: string) => near(variable, Number(value)) ?? match);
      return head[1] + rest.slice(0, text) + condition;
    })
    .join("\n");
}
