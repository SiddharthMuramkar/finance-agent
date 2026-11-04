import type { CourseMap, Topic } from "./map";
import { navigate, type Progress, type TopicProgress } from "./navigator";

/**
 * The Topic's own explore Widget, which code puts in the Widget panel (the Tutor does not draw it): one of the Topic's
 * written-ahead Widgets, by its id (which is its Widget key), with its code as written in the Topic file. A page that
 * knows the Learner's Case Data swaps in the code as the Learner sees it now (writtenAheadFor), reveal task and all.
 */
export type ExploreWidget = { topicId: string; id: string; code: string };

/** The Topic's explore Widget as written, or null when it has none (or names a written-ahead Widget it lacks). */
export function exploreWidgetOf(topic: Pick<Topic, "id" | "explore" | "widgets">): ExploreWidget | null {
  const id = topic.explore?.widget;
  const widget = id ? topic.widgets.find((w) => w.id === id) : undefined;
  return widget ? { topicId: topic.id, id: widget.id, code: widget.code } : null;
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
export function exploreHeldBack(topic: Pick<Topic, "id" | "explore" | "widgets">, record: TopicProgress | undefined): string | null {
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
