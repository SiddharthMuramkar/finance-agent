import { loadCourseMap, type CourseMap, type Topic } from "@/course/map";
import { buildScene } from "@/course/scenes";
import { formulaById, formulaCurrency } from "@/finance/formulas";
import { recipeById } from "@/widgets/recipes";
import { SHOWCASES, type Showcase } from "./showcases";

export type BuiltShowcase = Showcase & { title: string; code: string; step: string; topicTitle: string };

type Built = { title: string; code: string; step: string };

/** Builds the Widget a Showcase names, the same way a Topic opens it. Null when it will not build. */
export function showcaseWidget(map: CourseMap, showcase: Showcase): Built | null {
  const topic = map.topics.find((t) => t.id === showcase.topic);
  if (!topic) return null;
  const named = showcase.widget;
  if (named.kind === "card") return cardWidget(topic, named.check);
  if (named.kind === "growth") return growthWidget(topic, named.check);
  const scene = topic.scenes.find((s) => s.id === named.scene);
  if (!scene) return null;
  const built = buildScene(topic, scene);
  return built.ok ? { title: built.title, code: built.code, step: scene.step } : null;
}

/** A Concept card's Formula Card preset ({ recipe: "formula", inputs }), or null. */
function cardPreset(topic: Topic, checkId: string) {
  const check = topic.checks.find((c) => c.id === checkId);
  const preset = check?.card?.widget;
  return check?.card && preset && "recipe" in preset ? { check, card: check.card, preset } : null;
}

function cardWidget(topic: Topic, checkId: string): Built | null {
  const found = cardPreset(topic, checkId);
  if (!found) return null;
  const { card, preset } = found;
  const built = recipeById(preset.recipe)?.build({ title: preset.title ?? card.title, inputs: preset.inputs, refs: {}, facts: {} });
  return built?.ok ? { title: built.title, code: built.code, step: "concept" } : null;
}

/**
 * A Concept card's Formula Card drawn as a picture of growth (spec 2026-11-12 E6, H5): the grow_money recipe's money pile,
 * at the card's own numbers (its title, held amounts and years slider), on the calculator the card's formula names. Home
 * then shows what ₹1,000 grows to without a single symbol. Null when the card is not a formula on a calculator grow_money
 * can run, or the build fails.
 */
function growthWidget(topic: Topic, checkId: string): Built | null {
  const found = cardPreset(topic, checkId);
  if (!found || found.preset.recipe !== "formula") return null;
  const { card, preset } = found;
  const inputs = preset.inputs as { formula?: string; held?: Record<string, number>; slider?: { symbol: string; label: string; min: number; max: number; step: number; start: number } };
  const formula = inputs.formula ? formulaById(inputs.formula) : undefined;
  const symbol = formula?.symbols.find((s) => s.key === inputs.slider?.symbol);
  if (!formula?.calculator || !inputs.slider || !symbol || !["percent", "years", "usd", "inr"].includes(symbol.unit)) return null;
  const { symbol: input, ...range } = inputs.slider;
  const currency = formulaCurrency(formula);
  const built = recipeById("grow_money")?.build({
    title: preset.title ?? card.title,
    inputs: { calculator: formula.calculator, currency, held: inputs.held ?? {}, slider: { input, unit: symbol.unit, ...range } },
    refs: {},
    facts: {},
  });
  return built?.ok ? { title: built.title, code: built.code, step: "concept" } : null;
}

/** The three Showcases, each with its built Widget. One that fails to build is logged and left out. */
export function loadShowcases(map: CourseMap = loadCourseMap()): BuiltShowcase[] {
  const built: BuiltShowcase[] = [];
  for (const showcase of SHOWCASES) {
    const widget = showcaseWidget(map, showcase);
    const topic = map.topics.find((t) => t.id === showcase.topic);
    if (!widget || !topic) {
      console.error(`Showcase "${showcase.id}" did not build.`);
      continue;
    }
    built.push({ ...showcase, ...widget, topicTitle: topic.title });
  }
  return built;
}
