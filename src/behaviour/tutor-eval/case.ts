/**
 * Live Tutor test cases (spec #229, ticket #236): the Percent Session's real failures, T1 to T11, one JSON file
 * each under cases/. A live case is a Learner's state and their message; an aggregate case applies its
 * conditions to the replies of other cases; the lint case runs the course check. Pure: parsing and validation,
 * no model and no database. The runner (run.live.ts) sets each state up through the real code paths.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Where the suite's own case files live. */
export const CASES_DIR = join(process.cwd(), "src", "behaviour", "tutor-eval", "cases");

export const STEPS = ["story", "concept", "explore", "your_turn", "check"] as const;
export type CaseStep = (typeof STEPS)[number];

export const METHODS = ["restate", "worked", "boxes", "widget", "drill5"] as const;
export type CaseMethod = (typeof METHODS)[number];

export const REPLY_KINDS = ["feedback", "rule", "worked_example", "quick_try", "reteach", "hint", "answer_question", "offer_park", "go_deeper", "simpler"] as const;
export type CaseReplyKind = (typeof REPLY_KINDS)[number];

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
  | { kind: "noDollar" };

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
] as const;
const WITH_VALUE = new Set(["maxWords", "maxLines", "ackMaxWords", "maxMessageSentences"]);

export type QuizState =
  /** An open attempt. `questions` pins its question ids; left out, the attempt code opens is used. */
  | { state: "open"; questions?: string[] }
  /** The last attempt was submitted and missed with this many right; no new attempt is open. */
  | { state: "missed"; questions?: string[]; correct: number };

/** Earlier answers on one Skill, oldest first, and the repair methods already used on it. */
export type SkillSeed = { skill: string; answers: ("right" | "wrong")[]; methodsUsed?: CaseMethod[] };

export type CaseState = {
  /** The Teaching Step the Learner is at. */
  step: CaseStep;
  /** Which Check of the Topic the step is about, from 1. */
  check: number;
  quiz?: QuizState;
  skills?: SkillSeed[];
  /** Earlier turns, replayed through the real Tutor Turn with a scripted model, so they cost nothing. */
  history?: { learner: string; tutor: string }[];
  /** The Reply kind code would pick here; it sets the word cap the reply checks use. */
  replyKind?: CaseReplyKind;
  /** The Topic's currency for made-up examples (default INR) and its Cases' currencies (default none). */
  exampleCurrency?: string;
  caseCurrencies?: string[];
};

type Common = { id: string; title: string; source?: string; notes?: string; /** Why this case cannot run yet; it is reported, never passed. */ pending?: string };

export type LiveCase = Common & {
  kind: "live";
  topic: string;
  state: CaseState;
  message: string;
  /** The Learner's message is an answer on this Skill, recorded with this verdict before the turn (a Quick try). */
  answer?: { skill: string; verdict: "right" | "wrong" };
  pass: Condition[];
  /** Case conditions code cannot tell, asked of the grader as yes-or-no questions beside the rubric. */
  graderChecks?: string[];
};

export type AggregateCase = Common & { kind: "aggregate"; over: string[]; pass: Condition[] };

/** The course check must pass, and the fixture Topics (a folder laid out like the repo's course/) must fail lint L1. */
export type LintCase = Common & { kind: "lint"; failingFixture?: string };

export type EvalCase = LiveCase | AggregateCase | LintCase;

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
  const allowed = ["kind", ...(WITH_VALUE.has(kind) ? ["value"] : []), ...(kind === "noRefusal" ? ["words"] : []), ...(kind === "widget" ? ["mode"] : []), ...(kind === "savedRule" ? ["contains"] : [])];
  unknownKeys(raw, allowed, `${where} ${kind}`, errors);
  if (WITH_VALUE.has(kind) && !(typeof raw.value === "number" && raw.value > 0)) {
    errors.push(`${where}: ${kind} needs a positive number "value"`);
    return null;
  }
  if (kind === "noRefusal" && raw.words !== undefined && !isStrList(raw.words)) errors.push(`${where}: noRefusal "words" must be a list of strings`);
  if (kind === "widget" && raw.mode !== undefined && raw.mode !== "show" && raw.mode !== "practice") errors.push(`${where}: widget "mode" is show or practice`);
  if (kind === "savedRule" && !(isStrList(raw.contains) && raw.contains.length)) errors.push(`${where}: savedRule needs a list "contains"`);
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
  unknownKeys(raw, ["step", "check", "quiz", "skills", "history", "replyKind", "exampleCurrency", "caseCurrencies"], `${where} state`, errors);
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
    unknownKeys(raw, [...common, "topic", "state", "message", "answer", "pass", "graderChecks"], name, errors);
    if (!isStr(raw.topic)) errors.push(`${name}: "topic" is required`);
    if (!isStr(raw.message)) errors.push(`${name}: "message" is required`);
    checkState(raw.state, name, errors);
    if (raw.answer !== undefined && !(isObj(raw.answer) && isStr(raw.answer.skill) && (raw.answer.verdict === "right" || raw.answer.verdict === "wrong")))
      errors.push(`${name}: "answer" needs "skill" and "verdict" (right or wrong)`);
    if (raw.graderChecks !== undefined && !(isStrList(raw.graderChecks) && raw.graderChecks.every(isStr))) errors.push(`${name}: "graderChecks" must be questions`);
    parseConditions(raw.pass, name, errors);
  } else if (raw.kind === "aggregate") {
    unknownKeys(raw, [...common, "over", "pass"], name, errors);
    if (!(isStrList(raw.over) && raw.over.length)) errors.push(`${name}: "over" must list case ids`);
    parseConditions(raw.pass, name, errors);
  } else if (raw.kind === "lint") {
    unknownKeys(raw, [...common, "failingFixture"], name, errors);
    if (raw.failingFixture !== undefined && !isStr(raw.failingFixture)) errors.push(`${name}: "failingFixture" must be a folder`);
  } else errors.push(`${name}: "kind" must be live, aggregate or lint`);
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
