import type { Check, CourseMap, Topic } from "./map";
import type { Subject } from "./outline";
import type { QuestionLookup } from "./quiz";

/**
 * The Course Navigator: a pure decision module. Course Map and the Learner's
 * progress in, the Learner's place and the next legal move out. No model, no
 * database, no clock: callers load and save progress around it.
 */

export const TEACHING_STEPS = ["story", "concept", "explore", "your_turn", "check", "reveal", "principle"] as const;
export type TeachingStep = (typeof TEACHING_STEPS)[number];
export type TopicStatus = "not_started" | "in_progress" | "passed";

export type TopicProgress = {
  step: TeachingStep;
  /** IDs of Checks with a saved pass. Records of removed Checks are kept and ignored. */
  passedChecks: string[];
  revealShown: boolean;
  status: "in_progress" | "passed";
  /** How the Topic's Insight was settled at explore; absent until the Learner has found it or been told it. */
  insight?: "found" | "told";
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
  /** The Check the concept, explore, your-turn and Check steps are about; null otherwise. */
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
 * A passed Topic whose explore step is owed: it has an Insight, marks explore as required, and the
 * Insight was never settled. Once settled it stays owed while the step is saved as explore, until the Tutor finishes it.
 */
function exploreDue(topic: Topic, record: TopicProgress | undefined): boolean {
  return record?.status === "passed" && Boolean(topic.explore?.requiredWhenPassed) && (!record.insight || record.step === "explore");
}

/** The Check explore comes before, or null for a Topic without an Insight. */
function anchorCheck(topic: Topic): Check | null {
  return topic.explore ? (topic.checks.find((c) => c.id === topic.explore!.before) ?? null) : null;
}

/**
 * The current Topic: the chosen one if still open. Otherwise a passed Topic with a due Check or a due
 * explore step, so the Learner takes it before starting anything new; otherwise the first unpassed Topic on the default path.
 */
function currentTopic(map: CourseMap, progress: Progress): Topic | undefined {
  const chosen = progress.currentTopicId ? map.topic(progress.currentTopicId) : undefined;
  if (chosen && !isPassed(progress, chosen.id)) return chosen;
  return (
    map.topics.find((t) => dueIn(t, progress.topics[t.id]).length || exploreDue(t, progress.topics[t.id])) ??
    map.topics.find((t) => !isPassed(progress, t.id))
  );
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
  // A Topic whose Insight was removed from its file has no explore step to stand at.
  if (step === "explore" && !topic.explore) step = check ? "your_turn" : "reveal";
  if (r.status === "passed") {
    // A passed Topic is reopened only for a due explore step or a due Check: explore, then concept, your-turn and Check, nothing else.
    if (exploreDue(topic, r)) step = "explore";
    else if (step === "explore" || (check && !PER_CHECK.includes(step))) step = check ? "concept" : "principle";
  }
  if (step === "explore") return { record: r, step, check: anchorCheck(topic) };
  if (PER_CHECK.includes(step) && !check) step = r.status === "passed" ? "principle" : "reveal";
  return { record: r, step, check: PER_CHECK.includes(step) ? (check ?? null) : null };
}

/** Where the Learner goes after explore: the Check it precedes, or on to the reveal (or, in a passed Topic, to any due Check, else the end). */
function afterExplore(topic: Topic, record: TopicProgress): TeachingStep {
  const next = firstUnpassed(topic, record);
  if (record.status === "passed") return next ? "concept" : "principle";
  if (!next) return "reveal";
  return next.id === topic.explore?.before ? "your_turn" : "concept";
}

function nextStep(topic: Topic, record: TopicProgress, step: TeachingStep, check: Check | null): TeachingStep | "topic_passed" {
  switch (step) {
    case "principle":
      return "topic_passed";
    case "check":
      return "concept";
    case "concept":
      // Explore follows the concept of the anchor Check, once per Topic, and only for a Topic still being taught.
      return record.status !== "passed" && !record.insight && check && check.id === topic.explore?.before ? "explore" : "your_turn";
    case "explore":
      return afterExplore(topic, record);
    default:
      return TEACHING_STEPS[TEACHING_STEPS.indexOf(step) + 1];
  }
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
    next: nextStep(topic, record ?? FRESH, step, check),
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
  if (step === "explore" && !record.insight) {
    return { ok: false, reason: "Cannot finish explore: the Learner has not yet found the Insight or been told it. Record their attempt with record_insight_attempt." };
  }
  if (step === "principle") return { ok: true, progress: save(progress, topic, { ...record, status: "passed" }) };
  const following = nextStep(topic, record, step, check) as TeachingStep;
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
  // A Learner who got past the anchor Check before the Topic had an Insight takes explore before the reveal, never earlier.
  const explore = !more && !record.insight && topic.explore !== undefined && passedChecks.includes(topic.explore.before);
  return {
    ok: true,
    progress: save(progress, topic, {
      ...record,
      passedChecks,
      step: more ? "concept" : explore ? "explore" : "reveal",
      revealShown: (!more && !explore) || record.revealShown,
    }),
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

/** Each Teaching Step's name in plain words, as dividers, the strip and the Next chip show it. */
export const STEP_NAMES: Record<TeachingStep, string> = {
  story: "Story",
  concept: "Concept",
  explore: "Explore",
  your_turn: "Your turn",
  check: "Check",
  reveal: "Reveal",
  principle: "Principle",
};

/** A Check as the Learner sees it: its id and its number in the Topic's current order (Check 1, Check 2…). */
export type NumberedCheck = { id: string; number: number };

/** One numbered position in a Topic's step sequence. */
export type StepPosition = {
  step: TeachingStep;
  /** The Check this step belongs to on the strip; null for story, reveal, principle and an explore not tied to a Check. */
  check: NumberedCheck | null;
  /** 1-based position in the sequence. */
  number: number;
  /** "Step k of N · <step>", as a divider shows it. */
  label: string;
};

export type StepSequence = {
  topicId: string;
  /** True for a passed Topic's Due Check run, which lists only its due steps. */
  dueRun: boolean;
  steps: StepPosition[];
  /** Index in `steps` of the Learner's place; null in a passed Topic with nothing due. */
  current: number | null;
  /** The steps grouped for the strip: one group per Check, and ungrouped runs (check null) before and after. */
  groups: { check: NumberedCheck | null; steps: StepPosition[] }[];
};

/**
 * Whether explore sits just before the reveal: the Learner passed the Check that tests the Insight
 * before the Insight existed, so it was never taught after that Check's concept. Once that late explore
 * is settled and finished, the record no longer tells the two apart and explore is listed in its usual place.
 */
function lateExplore(topic: Topic, record: TopicProgress): boolean {
  return Boolean(topic.explore) && record.passedChecks.includes(topic.explore!.before) && (!record.insight || record.step === "explore");
}

/**
 * The numbered Teaching Steps of a Topic for this Learner's record: story; concept, your turn and Check
 * for each Check; explore once (only with an Insight), after the concept of the Check that tests it, or
 * just before the reveal for a Learner who passed that Check before the Insight existed; then reveal and
 * principle. A passed Topic with a Due Check (or a due explore) lists only the due steps. Null for a
 * Topic not on the Course Map.
 */
export function stepSequence(map: CourseMap, progress: Progress, topicId: string): StepSequence | null {
  const topic = map.topic(topicId);
  if (!topic) return null;
  const record = progress.topics[topicId] ?? FRESH;
  const numbered = (c: Check): NumberedCheck => ({ id: c.id, number: topic.checks.indexOf(c) + 1 });
  const due = dueIn(topic, record);
  const dueRun = due.length > 0 || exploreDue(topic, record);
  const late = lateExplore(topic, record);

  const raw: { step: TeachingStep; check: NumberedCheck | null }[] = [];
  const perCheck = (c: Check, withExplore: boolean) => {
    const check = numbered(c);
    raw.push({ step: "concept", check });
    if (withExplore) raw.push({ step: "explore", check });
    raw.push({ step: "your_turn", check }, { step: "check", check });
  };
  if (dueRun) {
    if (exploreDue(topic, record)) raw.push({ step: "explore", check: null });
    for (const c of due) perCheck(c, false);
  } else {
    raw.push({ step: "story", check: null });
    for (const c of topic.checks) perCheck(c, !late && c.id === topic.explore?.before);
    if (late) raw.push({ step: "explore", check: null });
    raw.push({ step: "reveal", check: null }, { step: "principle", check: null });
  }

  const steps = raw.map((s, i) => ({ ...s, number: i + 1, label: `Step ${i + 1} of ${raw.length} · ${STEP_NAMES[s.step]}` }));
  const groups: StepSequence["groups"] = [];
  for (const s of steps) {
    const last = groups[groups.length - 1];
    if (last && last.check?.id === s.check?.id) last.steps.push(s);
    else groups.push({ check: s.check, steps: [s] });
  }

  let current: number | null = null;
  if (record.status !== "passed" || dueRun) {
    const place = placeIn(topic, record);
    const index = steps.findIndex((s) => s.step === place.step && (s.step === "explore" || (s.check?.id ?? null) === (place.check?.id ?? null)));
    current = index >= 0 ? index : null;
  }
  return { topicId, dueRun, steps, current, groups };
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
