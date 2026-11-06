import { RECIPE_IDS, recipeById } from "@/widgets/recipes";
import type { Built } from "@/widgets/recipes/define";
import { buildStoryRecipe, isStoryRecipeId, type StoryContext } from "@/widgets/recipes/set-story";
import { STEP_KEYS, type Scene, type Term, type Topic } from "./map";

/**
 * Building a Topic's written-ahead story Widgets (spec 2026-11-05, ticket E3). A scene is built through its
 * recipe with the Topic's story context, so the as-of and currency rules hold wherever it shows. Plain Node
 * cannot load the Widget recipes, so `scripts/check-course.mjs` does not run this; `scenes.test.ts`, part of
 * `npm run check`, builds every Topic's scenes instead (the lesson-presets precedent).
 */

const USD_IN_STORY = /US\$|\$\s?\d/;
const INR_IN_STORY = /₹\s?\d|\bRs\.?\s?\d/;

/** The story context of a Topic at one step: its earliest Case as-of date, its example currency and its Case currencies (read off the Case stories, as turn-facts does with the database's units too). */
export function storyContextFor(topic: Topic, step?: string): StoryContext {
  const stories = topic.cases.map((c) => c.story);
  return {
    asOf: topic.cases.map((c) => c.asOf),
    ...(step && { step }),
    exampleCurrency: topic.exampleCurrency,
    caseCurrencies: [...(stories.some((s) => USD_IN_STORY.test(s)) ? ["USD"] : []), ...(stories.some((s) => INR_IN_STORY.test(s)) ? ["INR"] : [])],
  };
}

/** The name a built scene carries in the Widget panel: its own title, else the Topic's name for the scene. */
export function sceneTitle(topic: Topic, scene: Scene): string {
  if (scene.title) return scene.title;
  const words = scene.id.replace(/-/g, " ");
  return `${topic.title}: ${words.charAt(0).toUpperCase()}${words.slice(1)}`.slice(0, 90);
}

/** Builds one scene through its recipe, held to the Topic's story checks at its own step. Never throws. */
export function buildScene(topic: Topic, scene: Scene): Built {
  const recipe = recipeById(scene.recipe);
  if (!recipe) return { ok: false, error: `"${scene.recipe}" is not a Widget recipe (${RECIPE_IDS.join(", ")})` };
  const params = { title: sceneTitle(topic, scene), inputs: scene.inputs, refs: scene.refs ?? {}, facts: scene.facts ?? {} };
  return isStoryRecipeId(recipe.id) ? buildStoryRecipe(recipe, params, storyContextFor(topic, scene.step)) : recipe.build(params);
}

/** A term as a Lingo card, when the file gives it the whole card; null when it is still only a term and a meaning. */
export function buildTermCard(topic: Topic, term: Term): Built | null {
  if (!term.pro || !term.example || !term.emoji) return null;
  const recipe = recipeById("lingo_card");
  if (!recipe) return null;
  const inputs = { term: term.term, pro: term.pro, means: term.means, example: term.example, emoji: term.emoji, ...(term.inStory && { inStory: term.inStory }) };
  return buildStoryRecipe(recipe, { title: `Lingo: ${term.term}`.slice(0, 90), inputs, refs: {}, facts: {} }, storyContextFor(topic));
}

/** The title the Running example's scene is built under. */
export const RUNNING_SCENE_TITLE = (topic: Topic) => `${topic.title}: the running example`.slice(0, 90);

/** Builds the Running example's Story scene, held to the story step's rules since code may show it at any step. */
export function buildRunningScene(topic: Topic): Built | null {
  const scene = topic.runningExample?.scene;
  if (!scene) return null;
  const recipe = recipeById("story_scene");
  if (!recipe) return { ok: false, error: `"story_scene" is not a Widget recipe (${RECIPE_IDS.join(", ")})` };
  return buildStoryRecipe(recipe, { title: RUNNING_SCENE_TITLE(topic), inputs: scene, refs: {}, facts: {} }, storyContextFor(topic, "story"));
}

/** The Topic's scenes in the order its Teaching Steps run, file order within a step. */
export function scenesInStepOrder(topic: Topic): Scene[] {
  const at = (step: string) => STEP_KEYS.indexOf(step as (typeof STEP_KEYS)[number]);
  return [...(topic.scenes ?? [])].sort((a, b) => at(a.step) - at(b.step));
}

/**
 * Every problem in every Topic's scenes, each in the shape the course check would print:
 * `Scene "<id>": <reason> (Topic "<id>")`. The Running example's scene is built too.
 */
export function sceneCheckErrors(topics: readonly Topic[]): string[] {
  const errors: string[] = [];
  for (const topic of topics) {
    for (const scene of topic.scenes ?? []) {
      const built = buildScene(topic, scene);
      if (!built.ok) errors.push(`Scene "${scene.id}": ${built.error} (Topic "${topic.id}")`);
    }
    const running = buildRunningScene(topic);
    if (running && !running.ok) errors.push(`runningExample.scene: ${running.error} (Topic "${topic.id}")`);
  }
  return errors;
}
