import { recipeById } from "@/widgets/recipes";
import type { Built } from "@/widgets/recipes/define";
import type { CourseMap, Topic } from "./map";
import { navigate, type Progress, type TopicProgress } from "./navigator";

/**
 * The Topic's own explore Widget, which code puts in the Widget panel (the Tutor does not draw it): one of the Topic's
 * written-ahead Widgets, by its id (which is its Widget key), with its code as written in the Topic file. A page that
 * knows the Learner's Case Data swaps in the code as the Learner sees it now (writtenAheadFor), reveal task and all.
 */
export type ExploreWidget = { topicId: string; id: string; code: string };

/** The id an explore Workbench is kept under in the Widget panel: one per Topic, so reopening it updates its tab. */
export const exploreWorkbenchId = (topicId: string) => `${topicId}-workbench`;

/**
 * The Topic's explore Widget as written, or null when it has none (or names a written-ahead Widget it lacks). A Spine
 * Topic's explore Workbench (spec C2, B3) is compiled by code from its recipe, bound Case and inputs, exactly as the
 * Tutor's show_widget would compile it, so the Learner meets the Workbench at explore whatever the Tutor says.
 */
export function exploreWidgetOf(topic: Pick<Topic, "id" | "title" | "explore" | "widgets">): ExploreWidget | null {
  const id = topic.explore?.widget;
  const widget = id ? topic.widgets.find((w) => w.id === id) : undefined;
  if (widget) return { topicId: topic.id, id: widget.id, code: widget.code };
  const built = exploreWorkbenchBuild(topic);
  if (!built) return null;
  if (!built.ok) {
    // Loud, never silent: the course check and src/course/explore-workbench.test.ts fail on this; a Learner gets no
    // Workbench rather than a broken page.
    console.error(`Topic "${topic.id}": its explore Workbench does not build: ${built.error}`);
    return null;
  }
  return { topicId: topic.id, id: exploreWorkbenchId(topic.id), code: built.code };
}

/**
 * The Topic's explore Workbench compiled from its recipe, bound Case and inputs (exploreWorkbenchParams, so exactly what
 * a show_widget call would give), or null when it names none. A failure says why (an unknown recipe, inputs the recipe
 * refuses, a Case the registry lacks).
 */
export function exploreWorkbenchBuild(topic: Pick<Topic, "id" | "title" | "explore">): Built | null {
  const call = exploreWorkbenchParams(topic);
  if (!call) return null;
  const recipe = recipeById(call.recipe);
  if (!recipe) return { ok: false, error: `there is no Widget recipe "${call.recipe}"` };
  return recipe.build(call.params);
}

/**
 * The recipe and params a Topic's explore Workbench is compiled from, exactly as a show_widget call would give them: its
 * title (the Topic's when the file names none), and its inputs with the bound Case, for a recipe that reads a Case. A
 * recipe that reads no Case gets none: the Case then only dates the Topic's figures, and passing it would make the
 * recipe refuse the Widget. (The Multiple decoder takes Spine Topic 12's Case and checks it without drawing it.)
 */
export function exploreWorkbenchParams(topic: Pick<Topic, "title" | "explore">): { recipe: string; params: { title: string; inputs: Record<string, unknown>; refs: Record<string, never>; facts: Record<string, never> } } | null {
  const bench = topic.explore?.workbench;
  if (!bench) return null;
  type Shaped = { shape?: Record<string, Shaped | undefined> };
  const shape = (recipeById(bench.recipe)?.schema as Shaped | undefined)?.shape?.inputs?.shape;
  const readsCase = !shape || "case" in shape;
  const inputs = { ...(bench.case && readsCase ? { case: bench.case } : {}), ...bench.inputs };
  return { recipe: bench.recipe, params: { title: bench.title ?? topic.title, inputs, refs: {}, facts: {} } };
}

/**
 * The explore Widget the Learner has now, or null. It appears when the explore step begins and stays
 * until the Topic is passed, so the Learner can keep playing during their turn and the Check. A passed
 * Topic taken back through a due explore step shows it again for that step. Pure: map and progress in.
 */
export function exploreWidgetFor(map: CourseMap, progress: Progress): ExploreWidget | null {
  const place = navigate(map, progress);
  const widget = place ? exploreWidgetOf(place.topic) : null;
  if (!place || !widget) return null;
  const settled = progress.topics[place.topic.id]?.insight !== undefined;
  const shown = place.step === "explore" || (place.status !== "passed" && settled);
  return shown ? widget : null;
}

/**
 * The id of the Topic's explore Widget while the Learner has not reached its explore step (`record` is their progress
 * in the Topic), else null. Until then the Tutor may not open it and is not told of it: the Learner plays with it only
 * once the concept is named, and code holds that (ADR 0001). A passed Topic, or one whose Insight is settled, holds nothing back.
 */
export function exploreHeldBack(topic: Pick<Topic, "id" | "title" | "explore" | "widgets">, record: TopicProgress | undefined): string | null {
  const id = exploreWidgetOf(topic)?.id;
  const reached = record?.status === "passed" || record?.insight !== undefined || record?.step === "explore";
  return id && !reached ? id : null;
}

/** The explore Widget with its code as the Learner sees it now, from the Topic's written-ahead Widgets worked out for them. */
export function exploreAsSeen(explore: ExploreWidget | null, writtenAhead: readonly { id: string; code: string }[]): ExploreWidget | null {
  if (!explore) return null;
  const seen = writtenAhead.find((w) => w.id === explore.id);
  return seen ? { ...explore, code: seen.code } : explore;
}

/** The Topic title and Teaching Step of each Course Navigator context in a Session's saved text, in order. */
const CONTEXT = /^Topic: (.+) \([A-Za-z]+ Stage\)\.\nTeaching Step: (\w+)/gm;

/**
 * The explore Widget an old Session showed: the one of the first Topic whose Course Navigator context
 * in that Session stood at the explore step. Read from the Session's saved text, so it needs no progress.
 */
export function exploreWidgetInSession(map: CourseMap, savedText: string): ExploreWidget | null {
  for (const [, title, step] of savedText.matchAll(CONTEXT)) {
    if (step !== "explore") continue;
    const topic = map.topics.find((t) => t.title === title);
    const widget = topic ? exploreWidgetOf(topic) : null;
    if (widget) return widget;
  }
  return null;
}
