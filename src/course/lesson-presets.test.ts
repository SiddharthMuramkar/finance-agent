import { describe, expect, it } from "vitest";
import { widgetProblems, widgetRuleProblems } from "@/widgets/check";
import { RECIPE_IDS, recipeById } from "@/widgets/recipes";
import { convertedTopic } from "./lesson-fixture";
import { lessonLintErrors, writtenAheadPresetOk, type PresetCheck } from "./lesson-lint";
import { loadCourseMap, type Topic } from "./map";

// L4 in full. Plain Node cannot load the Widget recipes (extensionless "@/" imports), so `npm run course:check` checks
// written-ahead presets only, and this test, part of `npm run check`, builds every recipe preset of the real map.

/** Builds a recipe preset as code opens it at the card (the card's title unless the preset gives one) and runs the Widget checks. */
const fullPresetOk: PresetCheck = (preset, topic) => {
  if (!("recipe" in preset)) return writtenAheadPresetOk(preset, topic);
  const recipe = recipeById(preset.recipe);
  if (!recipe) return `"${preset.recipe}" is not a Widget recipe (${RECIPE_IDS.join(", ")})`;
  const card = topic.checks.find((c) => c.card?.widget === preset)?.card;
  const built = recipe.build({ title: preset.title ?? card?.title ?? topic.title, inputs: preset.inputs, refs: {}, facts: {} });
  if (!built.ok) return built.error;
  const problems = [...widgetProblems(built.code), ...widgetRuleProblems(built.code)];
  return problems.length ? problems.join("; ") : null;
};

const lint = (t: Topic) => lessonLintErrors([t], { notYet: [], presetOk: fullPresetOk });

describe("Widget presets on Concept cards (L4, recipes built)", () => {
  it("builds every preset in the real Course Map", () => {
    expect(lessonLintErrors(loadCourseMap().topics, { presetOk: fullPresetOk })).toEqual([]);
  });

  it("builds the converted fixture's rate_move presets, set to the Running example", () => {
    expect(lint(convertedTopic())).toEqual([]);
  });

  it("fails a rate_move preset whose new rate is off the Widget's range", () => {
    const t = convertedTopic();
    t.checks[0].card!.widget = { recipe: "rate_move", inputs: { old: 4, new: 25 } };
    expect(lint(t)).toEqual([expect.stringMatching(/^L4: Check "pct-demo-check-1" card's recipe "rate_move" preset: inputs\.new: .*\(Topic "pct-demo"\)$/)]);
  });

  it("fails a preset that names no Widget recipe", () => {
    const t = convertedTopic();
    t.checks[1].card!.widget = { recipe: "rate_moves", inputs: { old: 4, new: 5 } };
    expect(lint(t)).toEqual([expect.stringMatching(/^L4: Check "pct-demo-check-2" card's recipe "rate_moves" preset: "rate_moves" is not a Widget recipe \(.*rate_move/)]);
  });
});
