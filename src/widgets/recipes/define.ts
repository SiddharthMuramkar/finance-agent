import { z } from "zod";
import { CASE_DATA_REFERENCE } from "../tool-specs";

/**
 * Widget recipes (ADR 0005): the Tutor chooses a recipe and its params with show_widget, and code compiles them
 * into an OpenUI Lang program. The program is checked by the same Widget checks as one the Tutor writes, and is
 * stored and drawn like one, so saving, Notes, Widget state and old Sessions keep working unchanged.
 *
 * A recipe's params come in three kinds, so every number has a known origin (ADR 0003):
 * - `inputs`: slider ranges and starting values, and the calculator or formula inputs the Widget works out in the
 *   browser through our tested code;
 * - `refs`: Case Data references ("caseId/datasetId", "reference/<id>"), checked against the Case Data the as-of
 *   rule allows the Learner now;
 * - `facts`: free numbers the Widget shows as values. Any fact makes the Widget an Illustration: its title is
 *   prefixed "Illustration:".
 */

/** What kind of idea a recipe teaches; it feeds variety later (no two in a row). */
export const ARCHETYPES = ["Grow", "Compare", "History", "Formula", "Predict", "Check", "Rank", "Chain", "Convert", "Story", "Lingo"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/** The information budget of a Widget at rest (UX audit ★.7): enforced by the recipe tests. */
export type Budget = { controls: number; numbers: number; visuals: number; words: number };

/** Slider units our Slider part takes. */
export const SLIDER_UNITS = ["percent", "years", "usd", "inr"] as const;

/** A Case Data reference, "caseId/datasetId". */
export const caseDataRef = z.string().regex(CASE_DATA_REFERENCE, 'a Case Data reference, "caseId/datasetId"');

/** A slider's range, step and starting value, as fields to spread into a slider's params object. */
export const sliderShape = {
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  start: z.number(),
};
export type SliderRange = { min: number; max: number; step: number; start: number };

/** Problems with a slider's range, for a superRefine on the object that holds `sliderShape`. */
export function rangeProblems(s: SliderRange): string[] {
  if (!(s.min < s.max)) return ["min must be below max"];
  const problems: string[] = [];
  if (s.start < s.min || s.start > s.max) problems.push("start must lie between min and max");
  if ((s.max - s.min) / s.step > 10_000) problems.push("the step is too small for the range");
  return problems;
}

/** A slider the Learner moves: its range, step and starting value. */
export const sliderRange = z.object(sliderShape).superRefine((s, ctx) => {
  for (const message of rangeProblems(s)) ctx.addIssue({ code: "custom", message });
});

/** A Widget's title, as the Tutor gives it: short, and it is the Widget's key. */
export const widgetTitle = z.string().trim().min(3).max(90);

/** The params every recipe takes: a title and its three kinds of value. */
export type RecipeParams<I, R, F> = { title: string; inputs: I; refs: R; facts: F };

type Obj = z.ZodType<Record<string, unknown>>;

export type RecipeSpec<I extends Obj, R extends Obj, F extends Obj> = {
  id: string;
  archetype: Archetype;
  /** One line for the Tutor: what the recipe shows and when to use it. */
  summary: string;
  params: { inputs: I; refs: R; facts: F };
  budget: Budget;
  /** Working params; the tests compile each and run the Widget checks on it. */
  examples: RecipeParams<z.input<I>, z.input<R>, z.input<F>>[];
  /** The OpenUI Lang program. `title` already carries "Illustration:" when the params hold facts. */
  compile: (p: RecipeParams<z.output<I>, z.output<R>, z.output<F>>) => string;
};

export type Built =
  | { ok: true; title: string; code: string; params: Record<string, unknown>; refs: string[] }
  | { ok: false; error: string };

export type Recipe = {
  id: string;
  archetype: Archetype;
  summary: string;
  budget: Budget;
  examples: unknown[];
  /** The full params schema (title, inputs, refs, facts). */
  schema: z.ZodType;
  /** Parses raw params and compiles them; never throws. */
  build(raw: unknown): Built;
};

export const ILLUSTRATION = "Illustration:";

/** The title with "Illustration:" in front, unless it already has it. */
export function asIllustration(title: string): string {
  return title.startsWith(ILLUSTRATION) ? title : `${ILLUSTRATION} ${title}`;
}

/** Every string anywhere in a value: the Case Data references of a parsed `refs`. */
function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsIn);
  return [];
}

/** True when a parsed `facts` holds any value. */
function hasFacts(facts: unknown): boolean {
  if (facts === undefined || facts === null) return false;
  if (Array.isArray(facts)) return facts.some(hasFacts);
  if (typeof facts === "object") return Object.values(facts).some(hasFacts);
  return true;
}

/** Zod issues as one plain line each, with where they are. */
export function issuesText(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.length ? i.path.join(".") : "params"}: ${i.message}`).join("; ");
}

export function defineRecipe<I extends Obj, R extends Obj, F extends Obj>(spec: RecipeSpec<I, R, F>): Recipe {
  const schema = z.object({ title: widgetTitle, inputs: spec.params.inputs, refs: spec.params.refs, facts: spec.params.facts });
  return {
    id: spec.id,
    archetype: spec.archetype,
    summary: spec.summary,
    budget: spec.budget,
    examples: spec.examples,
    schema,
    build(raw) {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: issuesText(parsed.error) };
      const p = parsed.data as RecipeParams<z.output<I>, z.output<R>, z.output<F>>;
      const title = hasFacts(p.facts) ? asIllustration(p.title) : p.title;
      try {
        const code = spec.compile({ ...p, title });
        return { ok: true, title, code, params: p as unknown as Record<string, unknown>, refs: stringsIn(p.refs) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

// ——— Helpers for compile functions ———

/** An OpenUI Lang string literal. */
export const str = (text: string) => JSON.stringify(text);

/** A number as OpenUI Lang writes it (no exponent for the sizes we use). */
export const num = (n: number) => String(Number(n.toFixed(10)));

/** An OpenUI Lang object literal from numbers or already-written expressions ($variables). */
export function obj(fields: Record<string, number | string>): string {
  return `{${Object.entries(fields)
    .map(([k, v]) => `${k}: ${typeof v === "number" ? num(v) : v}`)
    .join(", ")}}`;
}

/** A value a slider can reach other than its start, for its Guided Task: the far end of the range from the start. */
export function reachableTarget(range: SliderRange): number {
  return range.max - range.start >= range.start - range.min ? range.max : range.min;
}

/** A slider in a compiled program: its statement name, $variable (without $), label, range and unit. */
export type CompiledSlider = { name: string; variable: string; label: string; range: SliderRange; unit: (typeof SLIDER_UNITS)[number]; task?: string };

/** The `$var = start` declaration and the Slider statement. */
export function sliderStatements(s: CompiledSlider): string[] {
  return [`$${s.variable} = ${num(s.range.start)}`, `${s.name} = Slider(${str(s.variable)}, ${str(s.label)}, ${num(s.range.min)}, ${num(s.range.max)}, ${num(s.range.step)}, $${s.variable}, ${str(s.unit)})`];
}

const unitWords: Record<CompiledSlider["unit"], (n: number) => string> = {
  percent: (n) => `${num(n)}%`,
  years: (n) => `${num(n)} years`,
  usd: (n) => `$${n.toLocaleString("en-US")}`,
  inr: (n) => `₹${n.toLocaleString("en-IN")}`,
};

/**
 * GuidedTasks for the sliders (#146): one task per slider, whose condition reads its $variable at a number it can
 * reach. Returns the statements and the name to put last in the Widget.
 */
export function taskStatements(sliders: readonly CompiledSlider[]): { name: string; statements: string[] } | null {
  if (!sliders.length) return null;
  const tasks = sliders.map((s, i) => {
    const target = reachableTarget(s.range);
    const text = s.task ?? `Move ${s.label.toLowerCase()} to ${unitWords[s.unit](target)} and watch what changes`;
    return { name: `task${i + 1}`, statement: `task${i + 1} = GuidedTask(${str(text)}, $${s.variable} == ${num(target)})` };
  });
  return { name: "tasks", statements: [`tasks = GuidedTasks([${tasks.map((t) => t.name).join(", ")}])`, ...tasks.map((t) => t.statement)] };
}

/** A whole program: the root Widget over `children`, then every other statement. */
export function program(title: string, children: readonly string[], statements: readonly string[]): string {
  return [`root = Widget(${str(title)}, [${children.join(", ")}])`, ...statements].join("\n");
}

/** A one-line signature of a recipe for the Tutor's instructions: its id, use, and params as JSON Schema. */
export function recipeSignature(recipe: Recipe): string {
  const json = z.toJSONSchema(recipe.schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return `- ${recipe.id} (${recipe.archetype}): ${recipe.summary}\n  params: ${JSON.stringify(json)}`;
}
