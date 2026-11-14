import type { CourseMap, Topic } from "./map";
import type { Progress } from "./navigator";
import { writtenAheadWidgets } from "./written-ahead";

/**
 * The Topic Start card (spec #119, "The Study Workspace › Topic Start card"): the first item of a Topic's
 * conversation, drawn from course data and the Learner's progress with no model call. It is worked out on
 * every render, never stored, so "Before this" always reads the Learner's passes as they are now.
 */

/** The kind the thread draws the card by (src/app/session-item-view.tsx). */
export const TOPIC_START = "topic_start";

const STAGE_NAMES: Record<Topic["stage"], string> = { spine: "Spine", foundation: "Foundation", follow: "Follow", judge: "Judge", analyse: "Analyse" };

export type TopicStartData = {
  topicId: string;
  title: string;
  /** The Topic's Subject, or its Stage when it has none. */
  where: string;
  youllLearn: string[];
  /** Each prerequisite and whether the Learner has passed it; empty for a starting Topic. */
  before: { id: string; title: string; passed: boolean }[];
  /** The written-ahead Widget titles; the line is left out when there are none. */
  uses: string[];
  checks: number;
  /**
   * Skip ahead (spec 2026-11-12 A8): "offer" shows the Choice "I know this: quiz me", "tried_today" the line that today's
   * quiz is used; left out for a Topic that offers none (passed, ending on the Learner's own work, too few questions).
   * The page fills it from Learner Memory (skipAheadState in src/learner/skip-ahead.ts), which knows today's attempt.
   */
  skipAhead?: "offer" | "tried_today";
};

/** The card for a Topic, as a display-only item, or null for a Topic not on the Course Map. */
export function topicStart(map: CourseMap, progress: Progress, topicId: string): { kind: typeof TOPIC_START; data: TopicStartData } | null {
  const topic = map.topic(topicId);
  if (!topic) return null;
  const data: TopicStartData = {
    topicId: topic.id,
    title: topic.title,
    where: topic.subject ?? STAGE_NAMES[topic.stage],
    youllLearn: topic.youllLearn ?? [],
    before: topic.prerequisites.map((id) => ({ id, title: map.topic(id)?.title ?? id, passed: progress.topics[id]?.status === "passed" })),
    uses: writtenAheadWidgets(topic).map((w) => w.title),
    checks: topic.checks.length,
  };
  return { kind: TOPIC_START, data };
}
