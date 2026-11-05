import { choicesFor, choiceSet, drawTemplate, type DrawnItem } from "@/teaching";
import type { CourseMap, QuizCheck } from "./map";

/**
 * Quiz Checks, in pure code: which questions an attempt shows, what the browser
 * may see, and how answers are marked. No model, no database.
 */

/**
 * A question with its key, from the Course Map or the Question Bank. `credit` and `verified` come
 * with bank questions; a question written in a Topic file has neither, so it counts as verified.
 */
export type KeyedQuestion = {
  id: string;
  prompt: string;
  /** A wrong choice's `mistake` is a Known mistake: its one-line fix shows in the marking. A template draw's choices come from `choicesFor`. */
  choices: { id: string; text: string; mistake?: { fix: string; tag?: string } }[];
  answer: string;
  explanation: string;
  credit?: string;
  verified?: boolean;
  /** The Skill the question tests (converted Topics). */
  skill?: string;
  /** Set for a template slot: one draw of a question template, served as choices. `answer` is then the right choice's id. */
  drawn?: DrawnItem;
};

/** Anything that can find a question by ID: the Course Map, or the Course Map plus loaded bank questions. */
export type QuestionLookup = { question(id: string): KeyedQuestion | undefined };

/** A question as the browser receives it: no answer, no explanation, no source. */
export type PublicQuestion = {
  id: string;
  prompt: string;
  choices: { id: string; text: string }[];
};

export type MarkedQuestion = {
  id: string;
  prompt: string;
  /** The choice the Learner picked, or null if none (or one that does not exist). */
  chosen: string | null;
  answer: string;
  correct: boolean;
  explanation: string;
  choices: { id: string; text: string }[];
  /** The credit line, for a Question Bank question. */
  credit?: string;
  /** False while a bank question's key has not been checked by a person. */
  verified: boolean;
  /** `markAttempt` always sets it. */
  kind?: "choice";
  /** What the Learner picked: the choice's ID, or for a template slot the choice's label ("50 bp"). Empty when nothing. */
  given?: string;
  /** The right answer in words, e.g. "60 bp": the right choice's text. */
  expected?: string;
  skill?: string;
  /** The Known mistake the wrong answer matched, with its one-line fix. */
  mistake?: { tag?: string; fix: string };
  /** A template slot's template and the numbers it was drawn with. */
  templateId?: string;
  params?: Record<string, string>;
};

export type Marking = { correctCount: number; shown: number; needed: number; passed: boolean; questions: MarkedQuestion[] };

/** The ID a template slot has in a stored attempt: the template and the seed its numbers are rebuilt from. */
export const templateInstanceId = (templateId: string, seed: string) => `${templateId}#${seed}`;

/** The template and seed behind an instance ID, or null for any other question ID. */
export function parseTemplateInstanceId(id: string): { templateId: string; seed: string } | null {
  const at = id.indexOf("#");
  return at > 0 && at < id.length - 1 ? { templateId: id.slice(0, at), seed: id.slice(at + 1) } : null;
}

/**
 * The question IDs for attempt number `attemptNo` (0 for the first). Attempts
 * walk round the Check's pool (its questions, then its templates), so a retry starts on questions the last attempt
 * did not show wherever the pool is bigger than one attempt. A template slot is the bare template ID here;
 * `instantiateSlots` turns it into an instance when the attempt opens. Templates make fresh numbers, so a Check
 * with templates may show more slots than its pool is long, the extra ones being more draws of its templates.
 */
export function selectQuestions(check: QuizCheck, attemptNo: number): string[] {
  const pool = [...check.questions, ...check.templates];
  const want = check.perAttempt ?? check.passRule.correct;
  const size = Math.min(want, pool.length);
  const start = (attemptNo * size) % pool.length;
  const slots = Array.from({ length: size }, (_, i) => pool[(start + i) % pool.length]);
  for (let i = size; check.templates.length && i < want; i++) slots.push(check.templates[(i - size) % check.templates.length]);
  return slots;
}

/** Whether a template can be drawn at all (a template with a problem is treated as not there). */
export function templateDraws(map: Pick<CourseMap, "template">, templateId: string): boolean {
  const t = map.template(templateId);
  if (!t) return false;
  try {
    // A draw with fewer than 2 choices (a template with no Known mistakes) is never shown.
    return choicesFor(drawTemplate(t, "probe", {}), "probe") !== null;
  } catch {
    return false;
  }
}

/**
 * Turns the template slots of `selectQuestions` into instance IDs, whose numbers pure code rebuilds from the seed.
 * The seed is made from the Learner, the Check, the attempt number and the slot. A draw that repeats the numbers this
 * Learner's previous attempt (`previous`, its stored IDs) or an earlier slot of this attempt had for the same
 * template is stepped on until the numbers differ. A slot whose template cannot be drawn is left out.
 */
export function instantiateSlots(
  map: Pick<CourseMap, "template">,
  check: Pick<QuizCheck, "id" | "templates">,
  slots: string[],
  ctx: { learnerId: number; attemptNo: number; previous?: string[] },
): string[] {
  const numbersOf = (templateId: string, seed: string) => {
    const t = map.template(templateId);
    if (!t) return null;
    const drawn = drawTemplate(t, seed, {});
    if (!choicesFor(drawn, seed)) throw new Error(`Template ${t.id} makes fewer than 2 choices`);
    return JSON.stringify(drawn.params);
  };
  const avoid = new Map<string, Set<string>>();
  const note = (templateId: string, numbers: string | null) => {
    if (numbers) avoid.set(templateId, (avoid.get(templateId) ?? new Set()).add(numbers));
  };
  for (const id of ctx.previous ?? []) {
    const parsed = parseTemplateInstanceId(id);
    if (!parsed) continue;
    try {
      note(parsed.templateId, numbersOf(parsed.templateId, parsed.seed));
    } catch {
      // A previous draw that cannot be rebuilt blocks nothing.
    }
  }
  const out: string[] = [];
  slots.forEach((slot, index) => {
    if (!check.templates.includes(slot)) return void out.push(slot);
    try {
      const base = `${ctx.learnerId}.${check.id}.${ctx.attemptNo}.${index}`;
      let seed = base;
      let numbers = numbersOf(slot, seed);
      for (let bump = 1; bump <= 50 && numbers && avoid.get(slot)?.has(numbers); bump++) {
        seed = `${base}.${bump}`;
        numbers = numbersOf(slot, seed);
      }
      note(slot, numbers);
      out.push(templateInstanceId(slot, seed));
    } catch {
      // The template cannot be drawn: the slot is left out.
    }
  });
  return out;
}

/**
 * The lookup entry for one draw of a template: what `questionLookup` returns for an instance ID. The draw is served as
 * 2 to 4 choices (`choicesFor`, ordered by the instance ID), each Known-mistake value carrying its fix.
 */
export function instanceQuestion(id: string, drawn: DrawnItem): KeyedQuestion {
  const set = choicesFor(drawn, id) ?? choiceSet(drawn)!;
  const expected = set.choices.find((c) => c.id === set.answer)?.text ?? "";
  return {
    id,
    prompt: drawn.prompt,
    choices: set.choices.map((c) => ({ id: c.id, text: c.text, ...(c.mistake && { mistake: c.mistake }) })),
    answer: set.answer,
    explanation: `The right answer is ${expected}.`,
    skill: drawn.skill,
    drawn,
  };
}

/** The questions for the browser, with the key left out. */
export function publicQuestions(map: QuestionLookup, ids: string[]): PublicQuestion[] {
  return ids.map((id) => {
    const q = map.question(id);
    if (!q) throw new Error(`Question "${id}" is not on the Course Map or in the Question Bank.`);
    return { id: q.id, prompt: q.prompt, choices: q.choices.map(({ id, text }) => ({ id, text })) };
  });
}

/** Marks an attempt on the server. The pass rule comes from the Course Map. */
export function markAttempt(map: QuestionLookup, check: QuizCheck, ids: string[], answers: Record<string, string>): Marking {
  const questions = ids.map((id): MarkedQuestion => {
    const q = map.question(id);
    if (!q) throw new Error(`Question "${id}" is not on the Course Map or in the Question Bank.`);
    const shared = { id, prompt: q.prompt, verified: q.verified ?? true, ...(q.credit ? { credit: q.credit } : {}), ...(q.skill ? { skill: q.skill } : {}) };
    const picked = answers[id];
    const chosen = q.choices.some((c) => c.id === picked) ? picked : null;
    const correct = chosen === q.answer;
    const hit = !correct && chosen ? q.choices.find((c) => c.id === chosen)?.mistake : undefined;
    return {
      ...shared,
      kind: "choice",
      chosen,
      // A template slot stores the picked label ("50 bp"), a written question the picked choice's id.
      given: q.drawn ? (q.choices.find((c) => c.id === chosen)?.text ?? "") : (chosen ?? ""),
      answer: q.answer,
      expected: q.choices.find((c) => c.id === q.answer)?.text ?? q.answer,
      correct,
      explanation: q.explanation,
      choices: q.choices.map(({ id, text }) => ({ id, text })),
      ...(hit ? { mistake: { ...(hit.tag ? { tag: hit.tag } : {}), fix: hit.fix } } : {}),
      ...(q.drawn ? { templateId: q.drawn.templateId, params: q.drawn.params } : {}),
    };
  });
  const correctCount = questions.filter((q) => q.correct).length;
  return { correctCount, shown: ids.length, needed: check.passRule.correct, passed: correctCount >= check.passRule.correct, questions };
}
