import { drawTemplate, formatExact, markAnswer, type DrawnItem, type Unit } from "@/teaching";
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
  /** A wrong choice's `mistake` is a Known mistake: its one-line fix shows in the marking. A typed question has no choices. */
  choices: { id: string; text: string; mistake?: { fix: string; tag?: string } }[];
  answer: string;
  explanation: string;
  credit?: string;
  verified?: boolean;
  /** The Skill the question tests (converted Topics). */
  skill?: string;
  /** Set for a typed question: one draw of a question template. `answer` is then its right answer in words ("60 bp"). */
  drawn?: DrawnItem;
};

/** Anything that can find a question by ID: the Course Map, or the Course Map plus loaded bank questions. */
export type QuestionLookup = { question(id: string): KeyedQuestion | undefined };

/** A question as the browser receives it: no answer, no explanation, no source. */
export type PublicQuestion = {
  id: string;
  prompt: string;
  choices: { id: string; text: string }[];
  /** "number" for a typed question (it has `choices: []`, a `unit` and the `decimals` its ask states); a choice question leaves it out. */
  kind?: "choice" | "number";
  unit?: Unit;
  decimals?: number;
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
  /** Absent in a hand-built marking: read it as "choice". `markAttempt` always sets it. */
  kind?: "choice" | "number";
  /** What the Learner gave: the picked choice's ID, or the text they typed. Empty when nothing. */
  given?: string;
  /** The right answer in words, e.g. "60 bp". For a choice question, the right choice's text. */
  expected?: string;
  skill?: string;
  /** The Known mistake the wrong answer matched, with its one-line fix. */
  mistake?: { tag?: string; fix: string };
  /** A typed question's template and the numbers it was drawn with. */
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
    drawTemplate(t, "probe", {});
    return true;
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
    return t ? JSON.stringify(drawTemplate(t, seed, {}).params) : null;
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

/** The lookup entry for one draw of a template: what `questionLookup` returns for an instance ID. */
export function instanceQuestion(id: string, drawn: DrawnItem): KeyedQuestion {
  const expected = markAnswer(drawn, "").expected;
  return {
    id,
    prompt: drawn.prompt,
    choices: [],
    answer: formatExact(drawn.answer, drawn.unit),
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
    if (q.drawn) return { id: q.id, prompt: q.prompt, choices: [], kind: "number" as const, unit: q.drawn.unit, decimals: q.drawn.decimals };
    return { id: q.id, prompt: q.prompt, choices: q.choices.map(({ id, text }) => ({ id, text })) };
  });
}

/** Marks an attempt on the server. The pass rule comes from the Course Map. */
export function markAttempt(map: QuestionLookup, check: QuizCheck, ids: string[], answers: Record<string, string>): Marking {
  const questions = ids.map((id): MarkedQuestion => {
    const q = map.question(id);
    if (!q) throw new Error(`Question "${id}" is not on the Course Map or in the Question Bank.`);
    const shared = { id, prompt: q.prompt, verified: q.verified ?? true, ...(q.credit ? { credit: q.credit } : {}), ...(q.skill ? { skill: q.skill } : {}) };
    if (q.drawn) {
      const given = answers[id] ?? "";
      const verdict = markAnswer(q.drawn, given);
      return {
        ...shared,
        kind: "number",
        chosen: null,
        given,
        answer: q.answer,
        expected: verdict.expected,
        correct: verdict.verdict === "right",
        explanation: `The right answer is ${verdict.expected}.`,
        choices: [],
        ...(verdict.verdict === "known_mistake" ? { mistake: { tag: verdict.tag, fix: verdict.fix } } : {}),
        templateId: q.drawn.templateId,
        params: q.drawn.params,
      };
    }
    const picked = answers[id];
    const chosen = q.choices.some((c) => c.id === picked) ? picked : null;
    const correct = chosen === q.answer;
    const hit = !correct && chosen ? q.choices.find((c) => c.id === chosen)?.mistake : undefined;
    return {
      ...shared,
      kind: "choice",
      chosen,
      given: chosen ?? "",
      answer: q.answer,
      expected: q.choices.find((c) => c.id === q.answer)?.text ?? q.answer,
      correct,
      explanation: q.explanation,
      choices: q.choices.map(({ id, text }) => ({ id, text })),
      ...(hit ? { mistake: { ...(hit.tag ? { tag: hit.tag } : {}), fix: hit.fix } } : {}),
    };
  });
  const correctCount = questions.filter((q) => q.correct).length;
  return { correctCount, shown: ids.length, needed: check.passRule.correct, passed: correctCount >= check.passRule.correct, questions };
}
