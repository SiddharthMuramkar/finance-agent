/**
 * Live Tutor test cases (spec #229, ticket #236): the Percent Session's real failures, T1 to T11, one JSON file
 * each under cases/; T12 to T16 for the story-first voice (D3b); T17 to T20 for the Tutor that answers what was asked
 * and never breaks (spec 2026-11-12, A1, A2 and A6). A live case is a Learner's state and their message; an aggregate case applies its
 * conditions to the replies of other cases; the lint case runs the course check. Pure: parsing and validation,
 * no model and no database. The runner (run.live.ts) sets each state up through the real code paths.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReplyKind } from "@/tutor/reply-checks";

/** Where the suite's own case files live. */
export const CASES_DIR = join(process.cwd(), "src", "behaviour", "tutor-eval", "cases");

export const STEPS = ["story", "concept", "explore", "your_turn", "check"] as const;
export type CaseStep = (typeof STEPS)[number];

export const METHODS = ["restate", "worked", "boxes", "widget", "drill5"] as const;
export type CaseMethod = (typeof METHODS)[number];

/** Every Reply kind code can choose, as a record so that a kind added to `ReplyKind` and left out here fails the type check. */
const REPLY_KIND_SET: Record<ReplyKind, true> = {
  feedback: true,
  rule: true,
  worked_example: true,
  quick_try: true,
  reteach: true,
  drill: true,
  hint: true,
  answer_question: true,
  offer_park: true,
  go_deeper: true,
  simpler: true,
};
export const REPLY_KINDS = Object.keys(REPLY_KIND_SET) as readonly ReplyKind[];

/**
 * A pass condition code can tell from the reply as the Learner sees it. The rest of a case's conditions are
 * yes-or-no questions for the grader (`graderChecks`).
 */
export type Condition =
  /** Words in the message and the ask, counted as the reply checks count them. */
  | { kind: "maxWords"; value: number }
  /** Lines of prose, Widget fences left out. */
  | { kind: "maxLines"; value: number }
  /** Exactly one ask: a last line that asks or tells, and no other question in the message. */
  | { kind: "oneAsk" }
  /** None of these refusal words (by default "can't", "cannot", "not while", "unable", "won't"). */
  | { kind: "noRefusal"; words?: string[] }
  /** A Widget from the registry was shown, in this mode when given, with no number from the open quiz. */
  | { kind: "widget"; mode?: "show" | "practice" }
  /** The Learner's own rule was saved, holding each of these words. */
  | { kind: "savedRule"; contains: string[] }
  /** The first sentence (the acknowledgement) has at most this many words. */
  | { kind: "ackMaxWords"; value: number }
  /** The message, without its ask, has at most this many sentences. */
  | { kind: "maxMessageSentences"; value: number }
  /** A park offer with its two choices: "Park it, review tomorrow" and "One more short try". */
  | { kind: "parkOffer" }
  /** No headings, emoji or "➜", one bold span or fewer, and no app words. */
  | { kind: "plainStyle" }
  /** No "$" in the text or in a Widget's labels. */
  | { kind: "noDollar" }
  /** No question, instruction or ask in the reply asks for a sum (`sumAsk`, ADR 0002; the same reading as V8). */
  | { kind: "noSum" }
  /** The turn stored a reply_choices item with 2 or 3 Choices (D3a, ADR 0008). */
  | { kind: "choicesStored" }
  /**
   * A normal reply (spec 2026-11-12, A3 and A4): some text, and none of the failure words a Learner may be shown
   * instead of one (the catch-all, the own-question fallback, provider text such as "400" or "invalid_request_error").
   */
  | { kind: "normalReply" }
  /** None of these phrases, case and curly quotes aside (a line the reply must not be, or a claim it must not make). */
  | { kind: "noPhrase"; phrases: string[] };

export const CONDITION_KINDS = [
  "maxWords",
  "maxLines",
  "oneAsk",
  "noRefusal",
  "widget",
  "savedRule",
  "ackMaxWords",
  "maxMessageSentences",
  "parkOffer",
  "plainStyle",
  "noDollar",
  "noSum",
  "choicesStored",
  "normalReply",
  "noPhrase",
] as const;
const WITH_VALUE = new Set(["maxWords", "maxLines", "ackMaxWords", "maxMessageSentences"]);

export type QuizState =
  /** An open attempt. `questions` pins its question ids; left out, the attempt code opens is used. */
  | { state: "open"; questions?: string[] }
  /** The last attempt was submitted and missed with this many right; no new attempt is open. */
  | { state: "missed"; questions?: string[]; correct: number };

/** Earlier answers on one Skill, oldest first, and the repair methods already used on it. */
export type SkillSeed = { skill: string; answers: ("right" | "wrong")[]; methodsUsed?: CaseMethod[] };

/**
 * A Quick try the Learner answered after the Tutor's last reply, as code marked it. The try is shown in the Session and
 * the answer goes through the Quick-try mark, so the Tutor is told of the result in its next turn, as the app tells it.
 */
export type AnsweredTry = { try: string; input: string; verdict: "right" | "wrong" };

export type CaseState = {
  /** The Teaching Step the Learner is at. */
  step: CaseStep;
  /** Which Check of the Topic the step is about, from 1. */
  check: number;
  quiz?: QuizState;
  skills?: SkillSeed[];
  /** Quick tries answered after the earlier turns (so the Tutor is told of them): each names a fixed Quick try of the Check. Needs a history. */
  answeredTries?: AnsweredTry[];
  /** Earlier turns, replayed through the real Tutor Turn with a scripted model, so they cost nothing. */
  history?: { learner: string; tutor: string }[];
  /** The Reply kind code would pick here; it sets the word cap the reply checks use. */
  replyKind?: ReplyKind;
  /** The Topic's currency for made-up examples (default INR) and its Cases' currencies (default none). */
  exampleCurrency?: string;
  caseCurrencies?: string[];
};

type Common = { id: string; title: string; source?: string; notes?: string; /** Why this case cannot run yet; it is reported, never passed. */ pending?: string };

export type LiveCase = Common & {
  kind: "live";
  topic: string;
  state: CaseState;
  /** The Learner's message; empty for an opener. */
  message: string;
  /** The page starts the turn itself (the opener of a Session with no messages): the Learner has written nothing. */
  opener?: true;
  /** How many of the three runs must pass (default 3, every one). */
  minPasses?: number;
  /**
   * The Learner's message is an answer on this Skill, recorded with this verdict before the turn (a Quick try). `try` names
   * the fixed Quick try of the case's Check that it answers (its id in the Topic file), so the try code shows is the one the
   * case's earlier turns talk about; left out, code draws the next try on the Skill.
   */
  answer?: { skill: string; verdict: "right" | "wrong"; try?: string };
  pass: Condition[];
  /** Case conditions code cannot tell, asked of the grader as yes-or-no questions beside the rubric. */
  graderChecks?: string[];
};

export type AggregateCase = Common & { kind: "aggregate"; over: string[]; pass: Condition[] };

/** The course check must pass, and the fixture Topics (a folder laid out like the repo's course/) must fail lint L1. */
export type LintCase = Common & { kind: "lint"; failingFixture?: string };

/**
 * A conversation (D3b, T13): the Learner's messages sent in order, each through the real Tutor Turn in one Session, with
 * the conditions applied to every reply. Code checks it alone (no grader), and it runs `runs` times (1 by default).
 * Every run fails on a `replay_stripped_after_refusal` incident (A2): each heal is a bug in what was sent (A1).
 */
export type DialogueCase = Common & {
  kind: "dialogue";
  topic: string;
  state: CaseState;
  messages: string[];
  pass: Condition[];
  runs?: number;
  /**
   * The reply checks run as in the app (T20): a step-led reply is held, checked, retried once and falls back. Left out,
   * every reply is the model's own first reply, as in the other cases. With it, a turn that fell back fails the run.
   */
  checkReplies?: true;
  /**
   * The message (from 1) whose turn's first draft the reply checks reject (T20, spec 2026-11-12 A1): code pads the draft
   * as stored past every word cap (reject-draft.ts), so the gate rejects it and the real model writes the retry. Needs
   * `checkReplies`. The run fails unless that turn's record shows the retry was accepted.
   */
  rejectDraft?: number;
};

export type EvalCase = LiveCase | AggregateCase | LintCase | DialogueCase;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

function unknownKeys(o: Obj, allowed: string[], where: string, errors: string[]) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) errors.push(`${where}: unknown field "${k}"`);
}

function parseCondition(raw: unknown, where: string, errors: string[]): Condition | null {
  if (!isObj(raw) || typeof raw.kind !== "string") {
    errors.push(`${where}: a condition needs a "kind"`);
    return null;
  }
  const kind = raw.kind;
  if (!(CONDITION_KINDS as readonly string[]).includes(kind)) {
    errors.push(`${where}: unknown condition "${kind}" (known: ${CONDITION_KINDS.join(", ")})`);
    return null;
  }
  const allowed = ["kind", ...(WITH_VALUE.has(kind) ? ["value"] : []), ...(kind === "noRefusal" ? ["words"] : []), ...(kind === "widget" ? ["mode"] : []), ...(kind === "savedRule" ? ["contains"] : []), ...(kind === "noPhrase" ? ["phrases"] : [])];
  unknownKeys(raw, allowed, `${where} ${kind}`, errors);
  if (WITH_VALUE.has(kind) && !(typeof raw.value === "number" && raw.value > 0)) {
    errors.push(`${where}: ${kind} needs a positive number "value"`);
    return null;
  }
  if (kind === "noRefusal" && raw.words !== undefined && !isStrList(raw.words)) errors.push(`${where}: noRefusal "words" must be a list of strings`);
  if (kind === "widget" && raw.mode !== undefined && raw.mode !== "show" && raw.mode !== "practice") errors.push(`${where}: widget "mode" is show or practice`);
  if (kind === "savedRule" && !(isStrList(raw.contains) && raw.contains.length)) errors.push(`${where}: savedRule needs a list "contains"`);
  if (kind === "noPhrase" && !(isStrList(raw.phrases) && raw.phrases.length && raw.phrases.every(isStr))) errors.push(`${where}: noPhrase needs a list "phrases"`);
  return raw as Condition;
}

function parseConditions(raw: unknown, where: string, errors: string[]): Condition[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    errors.push(`${where}: "pass" needs at least one condition`);
    return [];
  }
  return raw.flatMap((c, i) => parseCondition(c, `${where} pass[${i}]`, errors) ?? []);
}

function checkState(raw: unknown, where: string, errors: string[]) {
  if (!isObj(raw)) {
    errors.push(`${where}: "state" is required`);
    return;
  }
  unknownKeys(raw, ["step", "check", "quiz", "skills", "answeredTries", "history", "replyKind", "exampleCurrency", "caseCurrencies"], `${where} state`, errors);
  if (!(STEPS as readonly string[]).includes(raw.step as string)) errors.push(`${where}: state "step" must be one of ${STEPS.join(", ")}`);
  if (!(Number.isInteger(raw.check) && (raw.check as number) >= 1)) errors.push(`${where}: state "check" must be a Check number from 1`);
  if (raw.quiz !== undefined) {
    const q = raw.quiz;
    if (!isObj(q) || (q.state !== "open" && q.state !== "missed")) errors.push(`${where}: state "quiz" needs "state": open or missed`);
    else {
      unknownKeys(q, ["state", "questions", "correct"], `${where} quiz`, errors);
      if (q.questions !== undefined && !isStrList(q.questions)) errors.push(`${where}: quiz "questions" must be question ids`);
      if (q.state === "missed" && !(Number.isInteger(q.correct) && (q.correct as number) >= 0)) errors.push(`${where}: a missed quiz needs "correct"`);
      if (raw.step !== "check") errors.push(`${where}: a quiz state needs step "check"`);
    }
  }
  if (raw.skills !== undefined) {
    if (!Array.isArray(raw.skills)) errors.push(`${where}: state "skills" must be a list`);
    else
      raw.skills.forEach((s, i) => {
        if (!isObj(s) || !isStr(s.skill) || !Array.isArray(s.answers) || !s.answers.every((a) => a === "right" || a === "wrong")) {
          errors.push(`${where}: skills[${i}] needs "skill" and "answers" (right or wrong)`);
          return;
        }
        unknownKeys(s, ["skill", "answers", "methodsUsed"], `${where} skills[${i}]`, errors);
        if (s.methodsUsed !== undefined && !(Array.isArray(s.methodsUsed) && s.methodsUsed.every((m) => (METHODS as readonly string[]).includes(m))))
          errors.push(`${where}: skills[${i}] "methodsUsed" must be from ${METHODS.join(", ")}`);
      });
  }
  if (raw.answeredTries !== undefined) {
    if (!Array.isArray(raw.answeredTries)) errors.push(`${where}: state "answeredTries" must be a list`);
    else {
      raw.answeredTries.forEach((t, i) => {
        if (!isObj(t) || !isStr(t.try) || !isStr(t.input) || (t.verdict !== "right" && t.verdict !== "wrong")) {
          errors.push(`${where}: answeredTries[${i}] needs "try" (a fixed Quick try id), "input" and "verdict" (right or wrong)`);
          return;
        }
        unknownKeys(t, ["try", "input", "verdict"], `${where} answeredTries[${i}]`, errors);
      });
      if (raw.answeredTries.length && !(Array.isArray(raw.history) && raw.history.length)) errors.push(`${where}: "answeredTries" needs a "history", since the Session they are shown in starts with its first turn`);
    }
  }
  if (raw.history !== undefined && !(Array.isArray(raw.history) && raw.history.every((h) => isObj(h) && isStr(h.learner) && isStr(h.tutor))))
    errors.push(`${where}: state "history" must be a list of { learner, tutor }`);
  if (raw.replyKind !== undefined && !(REPLY_KINDS as readonly string[]).includes(raw.replyKind as string)) errors.push(`${where}: unknown replyKind "${String(raw.replyKind)}"`);
  if (raw.exampleCurrency !== undefined && !isStr(raw.exampleCurrency)) errors.push(`${where}: "exampleCurrency" must be a currency code`);
  if (raw.caseCurrencies !== undefined && !isStrList(raw.caseCurrencies)) errors.push(`${where}: "caseCurrencies" must be currency codes`);
}

/** Reads one case file. `errors` names every problem, each prefixed with the file name; `case` is set only when there are none. */
export function parseCase(text: string, name: string): { case?: EvalCase; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { errors: [`${name}: not JSON (${e instanceof Error ? e.message : String(e)})`] };
  }
  const errors: string[] = [];
  if (!isObj(raw)) return { errors: [`${name}: a case is a JSON object`] };
  const common = ["id", "title", "kind", "source", "notes", "pending"];
  if (!isStr(raw.id)) errors.push(`${name}: "id" is required`);
  if (!isStr(raw.title)) errors.push(`${name}: "title" is required`);
  if (raw.pending !== undefined && !isStr(raw.pending)) errors.push(`${name}: "pending" must say why`);
  if (raw.kind === "live") {
    unknownKeys(raw, [...common, "topic", "state", "message", "opener", "minPasses", "answer", "pass", "graderChecks"], name, errors);
    if (!isStr(raw.topic)) errors.push(`${name}: "topic" is required`);
    if (raw.opener !== undefined && raw.opener !== true) errors.push(`${name}: "opener" is true or left out`);
    if (raw.opener === true) {
      if (raw.message !== undefined) errors.push(`${name}: an opener has no "message": the page starts the turn`);
      if (raw.answer !== undefined) errors.push(`${name}: an opener has no "answer"`);
    } else if (!isStr(raw.message)) errors.push(`${name}: "message" is required`);
    if (raw.minPasses !== undefined && !(Number.isInteger(raw.minPasses) && (raw.minPasses as number) >= 1 && (raw.minPasses as number) <= 3))
      errors.push(`${name}: "minPasses" is a number of runs from 1 to 3`);
    checkState(raw.state, name, errors);
    if (raw.answer !== undefined && !(isObj(raw.answer) && isStr(raw.answer.skill) && (raw.answer.verdict === "right" || raw.answer.verdict === "wrong")))
      errors.push(`${name}: "answer" needs "skill" and "verdict" (right or wrong)`);
    else if (isObj(raw.answer)) {
      unknownKeys(raw.answer, ["skill", "verdict", "try"], `${name} answer`, errors);
      if (raw.answer.try !== undefined && !isStr(raw.answer.try)) errors.push(`${name}: answer "try" must be the id of a fixed Quick try`);
    }
    if (raw.graderChecks !== undefined && !(isStrList(raw.graderChecks) && raw.graderChecks.every(isStr))) errors.push(`${name}: "graderChecks" must be questions`);
    parseConditions(raw.pass, name, errors);
  } else if (raw.kind === "aggregate") {
    unknownKeys(raw, [...common, "over", "pass"], name, errors);
    if (!(isStrList(raw.over) && raw.over.length)) errors.push(`${name}: "over" must list case ids`);
    parseConditions(raw.pass, name, errors);
  } else if (raw.kind === "dialogue") {
    unknownKeys(raw, [...common, "topic", "state", "messages", "runs", "pass", "checkReplies", "rejectDraft"], name, errors);
    if (!isStr(raw.topic)) errors.push(`${name}: "topic" is required`);
    if (!(isStrList(raw.messages) && raw.messages.length && raw.messages.every(isStr))) errors.push(`${name}: "messages" must list the Learner's messages, in order`);
    if (raw.runs !== undefined && !(Number.isInteger(raw.runs) && (raw.runs as number) >= 1)) errors.push(`${name}: "runs" must be a number of runs from 1`);
    if (raw.checkReplies !== undefined && raw.checkReplies !== true) errors.push(`${name}: "checkReplies" is true or left out`);
    if (raw.rejectDraft !== undefined) {
      const count = Array.isArray(raw.messages) ? raw.messages.length : 0;
      if (!(Number.isInteger(raw.rejectDraft) && (raw.rejectDraft as number) >= 1 && (raw.rejectDraft as number) <= count))
        errors.push(`${name}: "rejectDraft" is the number of one of the messages, from 1`);
      if (raw.checkReplies !== true) errors.push(`${name}: "rejectDraft" needs "checkReplies": true, since only the reply checks reject a draft`);
    }
    checkState(raw.state, name, errors);
    parseConditions(raw.pass, name, errors);
  } else if (raw.kind === "lint") {
    unknownKeys(raw, [...common, "failingFixture"], name, errors);
    if (raw.failingFixture !== undefined && !isStr(raw.failingFixture)) errors.push(`${name}: "failingFixture" must be a folder`);
  } else errors.push(`${name}: "kind" must be live, aggregate, dialogue or lint`);
  if (!errors.length && raw.kind === "live" && raw.opener === true) raw.message = "";
  return errors.length ? { errors } : { case: raw as unknown as EvalCase, errors };
}

const caseOrder = (id: string) => Number(id.replace(/\D/g, "")) || Infinity;

/** Every case file in a folder, sorted T1, T2, … T11, with every problem in any file, and ids that repeat or that an aggregate names but no case has. */
export function loadCases(dir: string): { cases: EvalCase[]; errors: string[] } {
  const errors: string[] = [];
  const cases: EvalCase[] = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const read = parseCase(readFileSync(join(dir, name), "utf8"), name);
    errors.push(...read.errors);
    if (read.case) cases.push(read.case);
  }
  cases.sort((a, b) => caseOrder(a.id) - caseOrder(b.id) || a.id.localeCompare(b.id));
  const ids = cases.map((c) => c.id);
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) errors.push(`case id "${id}" is used twice`);
  for (const c of cases) if (c.kind === "aggregate") for (const id of c.over) if (!ids.includes(id)) errors.push(`${c.id}: "over" names "${id}", which no case has`);
  return { cases, errors };
}
