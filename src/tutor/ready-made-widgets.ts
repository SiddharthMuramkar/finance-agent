import { widgetNodes } from "@/widgets/check";
import { RECIPES, recipeById } from "@/widgets/recipes";
import { recipeSignature } from "@/widgets/recipes/define";
import { sliderStep } from "@/widgets/slider-steps";
import type { ReplyWidget } from "./reply-checks";

/**
 * Ready-made Widgets only (spec #229, ticket #242, ADR 0007): what the Tutor may open or show. A Widget is either one
 * written ahead in the Topic's file (opened by id, already set through a preset) or one drawn by code from a recipe
 * (its numbers given as inputs). The Tutor writes no Widget code and composes none. This file holds the rules every
 * such Widget answers to: the Tutor's catalogue, a preset's checks, and the facts a recipe may not be given.
 */

/** Recipes the Tutor does not teach with. quick_check is Quick tries' job; rate_move replaces percent_points as the single rate Widget. */
const NOT_FOR_TEACHING = ["quick_check", "percent_points"] as const;

/** The recipes the Tutor may choose from: every recipe except quick_check and percent_points. */
export const TUTOR_RECIPE_IDS: readonly string[] = RECIPES.map((r) => r.id).filter((id) => !(NOT_FOR_TEACHING as readonly string[]).includes(id));

/** The Tutor's catalogue as its instructions list it: each recipe's id, use and params schema. */
export function tutorRecipeSignatures(): string {
  return RECIPES.filter((r) => TUTOR_RECIPE_IDS.includes(r.id)).map(recipeSignature).join("\n");
}

/** What show_widget says when a Session frozen with quick_check still calls it. */
export const QUICK_CHECK_REFUSAL =
  "Not shown: quick_check is not used to teach a Topic. For 'quiz me', point to the next Quick try, or ask one question in words.";

/** A slider of a Widget, by its `$variable`, with the range and step it moves by. */
export type SliderSpec = { min: number; max: number; step: number };

/** The sliders of a Widget's code, read by the parser: `$variable` to its range and the step it really moves by (percent sliders move by 0.01). */
export function sliderSpecs(code: string): Map<string, SliderSpec> {
  const out = new Map<string, SliderSpec>();
  for (const n of widgetNodes(code)) {
    const { value, min, max, step, unit } = n.props as { value?: { k?: string; n?: string }; min?: unknown; max?: unknown; step?: unknown; unit?: unknown };
    if (n.typeName !== "Slider" || value?.k !== "StateRef" || typeof value.n !== "string") continue;
    if (typeof min !== "number" || typeof max !== "number" || typeof step !== "number") continue;
    out.set(value.n, { min, max, step: sliderStep({ min, max, step, unit: typeof unit === "string" ? unit : undefined }) });
  }
  return out;
}

/** A preset's keys with their `$`, whether or not the Tutor wrote it. */
export function normalizePreset(preset: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(preset).map(([k, v]) => [k.startsWith("$") ? k : `$${k}`, v]));
}

/**
 * Problems with a preset for a Widget (the Tutor's open_widget, or a recipe's slider values): each key must be one of
 * the Widget's sliders, and each value within its min and max and on its step. None means the preset is valid. The same
 * rules as the lesson lint's `presetValueProblems`, built on the runtime parser (that one reads files from disk).
 */
export function presetProblems(code: string, preset: Record<string, number>): string[] {
  const sliders = sliderSpecs(code);
  const names = [...sliders.keys()].join(", ") || "none";
  return Object.entries(normalizePreset(preset)).flatMap(([name, value]) => {
    const s = sliders.get(name);
    if (!s) return [`${name} is not one of its sliders (${names}).`];
    if (!Number.isFinite(value) || value < s.min - 1e-9 || value > s.max + 1e-9) return [`${name} = ${value} must be from ${s.min} to ${s.max}.`];
    const steps = (value - s.min) / s.step;
    if (Math.abs(steps - Math.round(steps)) > 1e-6) return [`${name} = ${value} is not on a step of ${s.step} from ${s.min}.`];
    return [];
  });
}

type Params = { inputs?: Record<string, unknown>; refs?: Record<string, unknown>; facts?: Record<string, unknown> };

/** A fact that an input or a Case Data path of the same recipe already covers. */
type CoveredFact = { fact: string; /** Only when this holds of the params (a Case Data path given in the same call); always, when left out. */ when?: (p: Params) => boolean; reason: string };

/**
 * Illustrations: a fact makes a Widget an Illustration, which is allowed only where no input or Case Data path covers the
 * same number. One row per recipe that has facts; `covered` lists the facts that are refused, each with the input to use.
 * A fact with no row entry (a made-up price, a number the Tutor worked out) has no path, so it stays an Illustration.
 */
export const ILLUSTRATION_FACTS: Record<string, { covered: CoveredFact[] }> = {
  buying_power: {
    covered: [{ fact: "price", when: (p) => p.refs?.price !== undefined, reason: "refs.price already gives the price from Case Data. Leave facts.price out." }],
  },
  fx_convert: {
    covered: [{ fact: "unitPriceUsd", when: (p) => p.refs?.unitPrice !== undefined, reason: "refs.unitPrice already gives the dollar price from Case Data. Leave facts.unitPriceUsd out." }],
  },
  percent_points: {
    covered: [{ fact: "before", reason: "inputs.slider.start is where the Widget starts, so set the earlier rate there. Leave facts.before out." }],
  },
  price_over_time: { covered: [] },
  chain: { covered: [] },
  quick_check: { covered: [] },
};

/** The facts of these params that an input or Case Data path covers, as problems that name what to use; none when all is well. */
export function illustrationProblems(recipeId: string, params: unknown): string[] {
  const p = (params ?? {}) as Params;
  const given = p.facts ?? {};
  return (ILLUSTRATION_FACTS[recipeId]?.covered ?? []).flatMap((c) => (given[c.fact] !== undefined && (c.when?.(p) ?? true) ? [`facts.${c.fact} is covered: ${c.reason}`] : []));
}

/** The numbers of a ReplyWidget's params as a preset: its numeric entries only. */
function presetOf(params: Record<string, unknown> | undefined): Record<string, number> {
  return Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => typeof v === "number")) as Record<string, number>;
}

/**
 * The reply check's Widget validator (V4) for a Topic: a known written-ahead id or Tutor recipe, a valid preset or valid
 * params, and no quick_check. null means valid, otherwise the reason. The tools refuse every invalid Widget before it is
 * stored, so this is for a check that reads a finished reply (T10 fails a fence in an engine Session).
 */
export function widgetValidator(writtenAhead: readonly { id: string; code: string }[]): (w: ReplyWidget) => string | null {
  return (w) => {
    if (w.kind === "written") {
      const widget = writtenAhead.find((x) => x.id === w.id);
      if (!widget) return `this Topic has no written-ahead Widget "${w.id}".`;
      const problems = presetProblems(widget.code, presetOf(w.params));
      return problems.length ? problems.join(" ") : null;
    }
    if (w.id === "quick_check") return QUICK_CHECK_REFUSAL.replace(/^Not shown: /, "");
    if (!TUTOR_RECIPE_IDS.includes(w.id)) return `there is no Widget recipe "${w.id}" in the Tutor's catalogue.`;
    const built = recipeById(w.id)!.build(w.params ?? {});
    if (!built.ok) return `these params do not fit the ${w.id} recipe. ${built.error}`;
    const problems = illustrationProblems(w.id, built.params);
    return problems.length ? problems.join(" ") : null;
  };
}
