import type { CourseMap, Topic } from "./map";
import type { Progress } from "./navigator";

/**
 * The Topic Start card (spec #119, "The Study Workspace › Topic Start card"): the first item of a Topic's
 * conversation, drawn from course data and the Learner's progress with no model call. It is worked out on
 * every render, never stored, so "Before this" always reads the Learner's passes as they are now.
 */

/** The kind the thread draws the card by (src/app/session-item-view.tsx). */
export const TOPIC_START = "topic_start";

const STAGE_NAMES: Record<Topic["stage"], string> = { foundation: "Foundation", follow: "Follow", judge: "Judge", analyse: "Analyse" };

export type TopicStartData = {
  title: string;
  /** The Topic's Subject, or its Stage when it has none. */
  where: string;
  youllLearn: string[];
  /** Each prerequisite and whether the Learner has passed it; empty for a starting Topic. */
  before: { id: string; title: string; passed: boolean }[];
  /** The written-ahead Widget titles; empty until written-ahead Widgets exist, and then the line is left out. */
  uses: string[];
  checks: number;
};

/** The card for a Topic, as a display-only item, or null for a Topic not on the Course Map. */
export function topicStart(map: CourseMap, progress: Progress, topicId: string): { kind: typeof TOPIC_START; data: TopicStartData } | null {
  const topic = map.topic(topicId);
  if (!topic) return null;
  const data: TopicStartData = {
    title: topic.title,
    where: topic.subject ?? STAGE_NAMES[topic.stage],
    youllLearn: topic.youllLearn ?? [],
    before: topic.prerequisites.map((id) => ({ id, title: map.topic(id)?.title ?? id, passed: progress.topics[id]?.status === "passed" })),
    uses: [],
    checks: topic.checks.length,
  };
  return { kind: TOPIC_START, data };
}
