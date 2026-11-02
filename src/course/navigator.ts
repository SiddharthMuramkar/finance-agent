import type { Check, CourseMap, Topic } from "./map";

/**
 * The Course Navigator: a pure decision module. Course Map and the Learner's
 * progress in, the Learner's place and the next legal move out. No model, no
 * database, no clock: callers load and save progress around it.
 */

export const TEACHING_STEPS = ["story", "concept", "your_turn", "check", "reveal", "principle"] as const;
export type TeachingStep = (typeof TEACHING_STEPS)[number];
export type TopicStatus = "not_started" | "in_progress" | "passed";

export type TopicProgress = {
  step: TeachingStep;
  /** IDs of Checks with a saved pass. Records of removed Checks are kept and ignored. */
  passedChecks: string[];
  revealShown: boolean;
  status: "in_progress" | "passed";
};

export type Progress = {
  /** The Topic the Learner is in; null means "follow the default path". */
  currentTopicId: string | null;
  topics: Record<string, TopicProgress>;
};

export type Place = {
  topic: Topic;
  status: TopicStatus;
  step: TeachingStep;
  /** The Check the concept, your-turn and Check steps are about; null otherwise. */
  check: Check | null;
  /** The step that comes after this one, or "topic_passed" after the principle. */
  next: TeachingStep | "topic_passed";
  unmetPrerequisites: string[];
  /** Saved once the reveal opens, so it survives a new Session. */
  revealShown: boolean;
  /** Required Checks added to already passed Topics since they were passed. */
  dueChecks: Check[];
};

export type Move = { ok: true; progress: Progress } | { ok: false; reason: string };

const PER_CHECK: TeachingStep[] = ["concept", "your_turn", "check"];
const FRESH: TopicProgress = { step: "story", passedChecks: [], revealShown: false, status: "in_progress" };

function isPassed(progress: Progress, topicId: string) {
  return progress.topics[topicId]?.status === "passed";
}

/** The current Topic: the chosen one if still open, otherwise the first unpassed Topic on the default path. */
function currentTopic(map: CourseMap, progress: Progress): Topic | undefined {
  const chosen = progress.currentTopicId ? map.topic(progress.currentTopicId) : undefined;
  if (chosen && !isPassed(progress, chosen.id)) return chosen;
  return map.topics.find((t) => !isPassed(progress, t.id));
}

/** The first Check in the Topic's current order with no pass. */
function firstUnpassed(topic: Topic, record: TopicProgress): Check | undefined {
  return topic.checks.find((c) => !record.passedChecks.includes(c.id));
}

function placeIn(topic: Topic, record: TopicProgress | undefined) {
  const r = record ?? FRESH;
  const check = firstUnpassed(topic, r);
  let step = r.step;
  if (PER_CHECK.includes(step) && !check) step = "reveal";
  return { record: r, step, check: PER_CHECK.includes(step) ? (check ?? null) : null };
}

function nextStep(step: TeachingStep): TeachingStep | "topic_passed" {
  return step === "principle" ? "topic_passed" : step === "check" ? "concept" : TEACHING_STEPS[TEACHING_STEPS.indexOf(step) + 1];
}

/** Where the Learner is now, or null once every Topic is passed. */
export function navigate(map: CourseMap, progress: Progress): Place | null {
  const topic = currentTopic(map, progress);
  if (!topic) return null;
  const record = progress.topics[topic.id];
  const { step, check } = placeIn(topic, record);
  return {
    topic,
    status: record ? record.status : "not_started",
    step,
    check,
    next: nextStep(step),
    unmetPrerequisites: topic.prerequisites.filter((p) => !isPassed(progress, p)),
    revealShown: (record?.revealShown ?? false) || step === "reveal",
    dueChecks: map.topics.flatMap((t) =>
      isPassed(progress, t.id) ? t.checks.filter((c) => c.required && !progress.topics[t.id].passedChecks.includes(c.id)) : [],
    ),
  };
}

function save(progress: Progress, topic: Topic, record: TopicProgress): Progress {
  return {
    currentTopicId: record.status === "passed" ? null : topic.id,
    topics: { ...progress.topics, [topic.id]: record },
  };
}

/** The Tutor reports that it finished a Teaching Step. Only the current step is accepted. */
export function finishStep(map: CourseMap, progress: Progress, reported: TeachingStep): Move {
  const topic = currentTopic(map, progress);
  if (!topic) return { ok: false, reason: "Every Topic on the Course Map is passed." };
  const { record, step } = placeIn(topic, progress.topics[topic.id]);
  if (reported !== step) return { ok: false, reason: `Cannot finish "${reported}": the current Teaching Step is "${step}".` };
  if (step === "check") return { ok: false, reason: "Only a saved Check result moves past a Check step." };
  if (step === "principle") return { ok: true, progress: save(progress, topic, { ...record, status: "passed" }) };
  const following = nextStep(step) as TeachingStep;
  return { ok: true, progress: save(progress, topic, { ...record, step: following, revealShown: record.revealShown || following === "reveal" }) };
}

/** Records a Check result. Only the current Check, at its Check step, is accepted. A pass moves on; anything else stays. */
export function recordCheckResult(map: CourseMap, progress: Progress, checkId: string, passed: boolean): Move {
  const topic = currentTopic(map, progress);
  if (!topic) return { ok: false, reason: "Every Topic on the Course Map is passed." };
  const { record, step, check } = placeIn(topic, progress.topics[topic.id]);
  if (step !== "check" || !check) return { ok: false, reason: `No Check is being taken; the current Teaching Step is "${step}".` };
  if (check.id !== checkId) return { ok: false, reason: `Check "${checkId}" is not the current Check; the current Check is "${check.id}".` };
  if (!passed) return { ok: true, progress };
  const passedChecks = [...record.passedChecks, checkId];
  const more = topic.checks.some((c) => !passedChecks.includes(c.id));
  return {
    ok: true,
    progress: save(progress, topic, { ...record, passedChecks, step: more ? "concept" : "reveal", revealShown: !more || record.revealShown }),
  };
}
