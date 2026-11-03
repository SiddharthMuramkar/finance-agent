import type { Check, CourseMap, Topic } from "./map";
import type { Subject } from "./outline";
import type { QuestionLookup } from "./quiz";

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

/** Required Checks added to a passed Topic since it was passed. */
function dueIn(topic: Topic, record: TopicProgress | undefined): Check[] {
  return record?.status === "passed" ? topic.checks.filter((c) => c.required && !record.passedChecks.includes(c.id)) : [];
}

/**
 * The current Topic: the chosen one if still open. Otherwise a passed Topic with a due Check, so
 * the Learner takes it before starting anything new; otherwise the first unpassed Topic on the default path.
 */
function currentTopic(map: CourseMap, progress: Progress): Topic | undefined {
  const chosen = progress.currentTopicId ? map.topic(progress.currentTopicId) : undefined;
  if (chosen && !isPassed(progress, chosen.id)) return chosen;
  return map.topics.find((t) => dueIn(t, progress.topics[t.id]).length) ?? map.topics.find((t) => !isPassed(progress, t.id));
}

/** The first Check in the Topic's current order with no pass; in a passed Topic, the first due Check. */
function firstUnpassed(topic: Topic, record: TopicProgress): Check | undefined {
  if (record.status === "passed") return dueIn(topic, record)[0];
  return topic.checks.find((c) => !record.passedChecks.includes(c.id));
}

function placeIn(topic: Topic, record: TopicProgress | undefined) {
  const r = record ?? FRESH;
  const check = firstUnpassed(topic, r);
  let step = r.step;
  // A passed Topic is reopened only for a due Check: its concept, your-turn and Check steps, nothing else.
  if (r.status === "passed" && check && !PER_CHECK.includes(step)) step = "concept";
  if (PER_CHECK.includes(step) && !check) step = r.status === "passed" ? "principle" : "reveal";
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
    dueChecks: map.topics.flatMap((t) => dueIn(t, progress.topics[t.id])),
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
  const { record, step, check } = placeIn(topic, progress.topics[topic.id]);
  if (reported !== step) return { ok: false, reason: `Cannot finish "${reported}": the current Teaching Step is "${step}".` };
  if (step === "check") return { ok: false, reason: "Only a saved Check result moves past a Check step." };
  if (record.status === "passed" && !check) return { ok: false, reason: "This Topic is passed; there is no step to finish." };
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
  if (record.status === "passed") {
    // A due Check in a passed Topic: once none is left, the Topic is as it was (passed), and the path goes on.
    const more = dueIn(topic, { ...record, passedChecks }).length > 0;
    return { ok: true, progress: save(progress, topic, { ...record, passedChecks, step: more ? "concept" : "principle" }) };
  }
  const more = topic.checks.some((c) => !passedChecks.includes(c.id));
  return {
    ok: true,
    progress: save(progress, topic, { ...record, passedChecks, step: more ? "concept" : "reveal", revealShown: !more || record.revealShown }),
  };
}

export type Jump = { ok: true; progress: Progress; unmetPrerequisites: string[] } | { ok: false; reason: string };

/**
 * The Learner chooses a Topic on the Course Map page. It becomes the current Topic; the unmet
 * prerequisites are returned so the Learner can be warned first. Other Topics keep their progress.
 */
export function jumpTo(map: CourseMap, progress: Progress, topicId: string): Jump {
  const topic = map.topic(topicId);
  if (!topic) return { ok: false, reason: `Topic "${topicId}" is not on the Course Map.` };
  if (isPassed(progress, topicId)) return { ok: false, reason: `Topic "${topicId}" is already passed.` };
  return {
    ok: true,
    progress: { ...progress, currentTopicId: topicId },
    unmetPrerequisites: topic.prerequisites.filter((p) => !isPassed(progress, p)),
  };
}

/** The Learner goes back to the default path. The Topic they leave keeps its progress. */
export function returnToDefaultPath(progress: Progress): Progress {
  return { ...progress, currentTopicId: null };
}

export type TopicOverview = {
  id: string;
  title: string;
  stage: Topic["stage"];
  /** The Subject of a Foundation Topic; null for later Stages. */
  subject: Subject | null;
  status: TopicStatus;
  /** The Teaching Step a started Topic is at. */
  step: TeachingStep | null;
  /** Each Check in the Topic's current order; `here` marks the Learner's place. */
  checks: { id: string; passed: boolean; here: boolean }[];
  unmetPrerequisites: string[];
  /** The Learner's current Topic. */
  current: boolean;
  /** The Topic the default path leads to (where going back would land). */
  onDefaultPath: boolean;
};

/** Every Topic on the Course Map in default-path order, with its status, Checks and the Learner's place. For the Course Map page. */
export function courseOverview(map: CourseMap, progress: Progress): TopicOverview[] {
  const place = navigate(map, progress);
  const defaultTopic = currentTopic(map, returnToDefaultPath(progress));
  return map.topics.map((topic) => {
    const record = progress.topics[topic.id];
    const here = place?.topic.id === topic.id ? place : null;
    return {
      id: topic.id,
      title: topic.title,
      stage: topic.stage,
      subject: topic.subject ?? null,
      status: record ? record.status : "not_started",
      step: here && record ? here.step : record && record.status !== "passed" ? placeIn(topic, record).step : null,
      checks: topic.checks.map((c) => ({ id: c.id, passed: record?.passedChecks.includes(c.id) ?? false, here: here?.check?.id === c.id })),
      unmetPrerequisites: topic.prerequisites.filter((p) => !isPassed(progress, p)),
      current: here !== null,
      onDefaultPath: defaultTopic?.id === topic.id,
    };
  });
}

/** The most reviews offered in one Session, unless the `review_cap` setting says otherwise. */
export const DEFAULT_REVIEW_CAP = 10;

/** What the Navigator needs to know of a review card: which question, and when it falls due. */
export type DueCard = { questionId: string; due: Date };

/**
 * Reviews to offer at `now`: cards that have fallen due and whose question is still on the Course
 * Map, most overdue first, at most `cap` minus the reviews already done since the Session started.
 * `dueCount` is how many are due in all, so a long break shows as a count, not a pile. Reviews come
 * before the current Teaching Step and never touch Progress, so a missed one cannot unpass a Topic.
 */
export function reviewsDue<C extends DueCard>(map: QuestionLookup, cards: C[], now: Date, doneThisSession: number, cap = DEFAULT_REVIEW_CAP): { offered: C[]; dueCount: number } {
  const due = cards
    .filter((c) => c.due.getTime() <= now.getTime() && map.question(c.questionId))
    .sort((a, b) => a.due.getTime() - b.due.getTime() || a.questionId.localeCompare(b.questionId));
  return { offered: due.slice(0, Math.max(0, cap - doneThisSession)), dueCount: due.length };
}
