import { hash } from "@/teaching/choices";
import { isBankId, type CourseMap, type QuizCheck, type Topic } from "./map";
import type { Move, Progress, TopicProgress } from "./navigator";
import { computedInstanceId, computedKeyedQuestion, templateDraws, templateInstanceId } from "./quiz";
import { endsOnOwnWork } from "./spine-check";

export { endsOnOwnWork };

/**
 * Skip ahead (spec 2026-11-12 A8, ADR 0004), in pure code: which questions the "I know this: quiz me" quiz shows, whether
 * a Topic offers it, the pass rule, and what a pass does to the Learner's progress. No model, no database, no clock;
 * src/learner/skip-ahead.ts saves the attempt, marks it and records the pass.
 */

/** The fewest and the most questions one skip-ahead quiz shows (A8). With fewer than the least, the Topic offers none. */
export const SKIP_AHEAD_MIN = 4;
export const SKIP_AHEAD_MAX = 8;

/** How many a Learner may miss and still pass the whole Topic (A8: "missing no more than one"). */
export const SKIP_AHEAD_MISSES = 1;

/** Whether a quiz with `shown` questions and `correct` right answers passes: at most one missed. */
export const skipAheadPassed = (correct: number, shown: number) => shown > 0 && shown - correct <= SKIP_AHEAD_MISSES;

/** The pass rule markAttempt marks a skip-ahead quiz of `shown` questions by. */
export const skipAheadPassRule = (shown: number): Pick<QuizCheck, "passRule"> => ({ passRule: { correct: Math.max(shown - SKIP_AHEAD_MISSES, 1) } });

type Candidate = { id: string; skill?: string; written: boolean };

/**
 * The questions the Topic's quiz Checks list that a skip-ahead quiz may show, in Check order, once each: written questions
 * from the Topic file and computed ones code can value. A predict question is left out, because a predict tap is never
 * marked wrong (D1), and so are Question Bank questions, which test no Skill of the Topic.
 */
function candidates(map: Pick<CourseMap, "topics">, topic: Topic): Candidate[] {
  const listed = [...new Set(topic.checks.flatMap((c) => (c.kind === "quiz" ? c.questions : [])))].filter((id) => !isBankId(id));
  return listed.flatMap((id): Candidate[] => {
    const q = topic.questions.find((x) => x.id === id);
    if (!q) return [];
    if ("computed" in q) return q.kind !== "predict" && computedKeyedQuestion(map, id) ? [{ id, skill: q.skill, written: false }] : [];
    return [{ id, skill: q.skill, written: true }];
  });
}

/** `items` reordered by a seed, the same order for the same seed. */
function seededOrder<T>(items: readonly T[], seed: string): T[] {
  return [...items].map((item, i) => ({ item, key: hash(`${seed}#${i}`) })).sort((a, b) => a.key - b.key).map((x) => x.item);
}

/**
 * The question ids of one skip-ahead quiz (A8). A Topic with Skills gets one question for each Skill, in the file's order
 * and at most eight: one of the questions its quiz Checks list for that Skill, picked by the seed, or failing that a draw
 * of a template its quiz Checks use for it. With fewer than four, other questions from its quiz Checks fill up to four.
 * A Topic without Skills draws from its quiz Checks' written questions, up to eight in Check order, picked by the seed
 * when it has more. A computed question is a seeded draw from its pool. The seed (Learner, Topic and day) gives another
 * pick on another day. Fewer than four ids means the
 * Topic cannot offer skip ahead.
 */
export function skipAheadQuestions(map: Pick<CourseMap, "topics" | "template">, topic: Topic, seed: string): string[] {
  const pool = candidates(map, topic);
  if (!topic.skills.length) {
    const written = pool.filter((c) => c.written).map((c) => c.id);
    if (written.length <= SKIP_AHEAD_MAX) return written;
    const kept = new Set(seededOrder(written, seed).slice(0, SKIP_AHEAD_MAX));
    return written.filter((id) => kept.has(id));
  }
  const templates = [...new Set(topic.checks.flatMap((c) => (c.kind === "quiz" ? c.templates : [])))];
  const picked: string[] = [];
  for (const skill of topic.skills.slice(0, SKIP_AHEAD_MAX)) {
    const forSkill = pool.filter((c) => c.skill === skill.id && !picked.includes(c.id));
    if (forSkill.length) {
      picked.push(forSkill[hash(`${seed}.${skill.id}`) % forSkill.length].id);
      continue;
    }
    const template = templates.find((id) => map.template(id)?.skill === skill.id && templateDraws(map, id));
    if (template) picked.push(templateInstanceId(template, `skip.${seed}.${skill.id}`));
  }
  for (const c of seededOrder(pool, seed)) {
    if (picked.length >= SKIP_AHEAD_MIN) break;
    if (!picked.includes(c.id)) picked.push(c.id);
  }
  // A computed question is drawn afresh from its pool by the seed (D5), so another day does not bring back the same choices.
  return picked.map((id) => {
    if (pool.find((c) => c.id === id)?.written !== false) return id;
    const drawn = computedInstanceId(id, `skip.${seed}`);
    return computedKeyedQuestion(map, drawn) ? drawn : id;
  });
}

/**
 * Whether the Topic Start card offers "I know this: quiz me" (A8): the Topic is on the Course Map and not passed, it does
 * not end on a conversation Check about the Learner's own work, and it has at least four questions to ask. Whether the
 * Learner has used today's attempt is the database's to say (src/learner/skip-ahead.ts).
 */
export function skipAheadOffered(map: Pick<CourseMap, "topic" | "topics" | "template">, progress: Progress, topicId: string): boolean {
  const topic = map.topic(topicId);
  if (!topic || progress.topics[topicId]?.status === "passed" || endsOnOwnWork(topic)) return false;
  return skipAheadQuestions(map, topic, "offer").length >= SKIP_AHEAD_MIN;
}

const FRESH: TopicProgress = { step: "story", passedChecks: [], revealShown: false, status: "in_progress" };

/**
 * The Learner's progress once a skip-ahead quiz passed (A8): every Check of the Topic passed and the Topic passed, at its
 * principle like any passed Topic, so the Course Map shows it passed and the default path goes on. Passes already saved
 * (a removed Check's included) stay. The Insight is left as it was: skip ahead passes the Topic without its explore step.
 */
export function passBySkipAhead(map: Pick<CourseMap, "topic">, progress: Progress, topicId: string): Move {
  const topic = map.topic(topicId);
  if (!topic) return { ok: false, reason: `Topic "${topicId}" is not on the Course Map.` };
  const record = progress.topics[topicId] ?? FRESH;
  if (record.status === "passed") return { ok: false, reason: `Topic "${topicId}" is already passed.` };
  const passedChecks = [...new Set([...record.passedChecks, ...topic.checks.map((c) => c.id)])];
  return {
    ok: true,
    progress: {
      currentTopicId: progress.currentTopicId === topicId ? null : progress.currentTopicId,
      topics: { ...progress.topics, [topicId]: { ...record, passedChecks, step: "principle", status: "passed" } },
    },
  };
}
