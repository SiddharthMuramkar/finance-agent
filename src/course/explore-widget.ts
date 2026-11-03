import type { CourseMap } from "./map";
import { navigate, type Progress } from "./navigator";

/** The Topic's own explore Widget, which code puts in the Widget panel (the Tutor does not draw it). */
export type ExploreWidget = { topicId: string; code: string };

/**
 * The explore Widget the Learner has now, or null. It appears when the explore step begins and stays
 * until the Topic is passed, so the Learner can keep playing during their turn and the Check. A passed
 * Topic taken back through a due explore step shows it again for that step. Pure: map and progress in.
 */
export function exploreWidgetFor(map: CourseMap, progress: Progress): ExploreWidget | null {
  const place = navigate(map, progress);
  const code = place?.topic.explore?.widget;
  if (!place || !code) return null;
  const settled = progress.topics[place.topic.id]?.insight !== undefined;
  const shown = place.step === "explore" || (place.status !== "passed" && settled);
  return shown ? { topicId: place.topic.id, code } : null;
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
    if (topic?.explore?.widget) return { topicId: topic.id, code: topic.explore.widget };
  }
  return null;
}
