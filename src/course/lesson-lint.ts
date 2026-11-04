import { exactFrom, formatExact, roundTo, sameValue } from "../teaching/answers.ts";
import { markAnswer } from "../teaching/mark.ts";
import { drawTemplate, templateProblems } from "../teaching/templates.ts";
import { isBankId, isConverted, testedSkills, type QuickTry, type Topic, type WidgetPreset } from "./map.ts";
import { presetValueProblems } from "./written-ahead-check.ts";

// The lesson lint (spec #229, ADR 0006): the course check's rules for the teaching a converted Topic's file holds.
// L1 a Check tests only what a card at or before it teaches; L2 enough Quick tries and questions; L3 short cards;
// L4 valid Widget presets; L5 the Topic's currency; L6 no negative stems; L7 Check questions move apart from the
// worked examples; Draws: every template draws and marks its own answer right, and fixed tries are sound.
// Pure, with no "@/" imports, so `scripts/check-course.mjs` runs it under plain Node.

/**
 * Topics the lesson lint does not cover yet: every Topic whose file has no Skills. The list can only shrink: a Topic on
 * it that gains Skills must come off, and a Topic off it without Skills fails. Remove an ID when its Topic is converted;
 * never add one.
 */
export const LESSON_NOT_YET_CONVERTED: readonly string[] = [
  "num-percent-bps",
  "num-compounding",
  "num-probability",
  "present-value",
  "fs-income",
  "fs-balance",
  "fs-cashflow",
  "fs-links",
  "fs-ratios",
  "fs-revenue-runrate",
  "fs-capex-dep",
  "fs-leases-debt",
  "fs-filings",
  "fs-earnings-quality",
  "fs-tax",
  "num-statistics",
  "eco-supply-demand",
  "eco-micro-competition",
  "eco-money-banking",
  "eco-central-banks",
  "eco-inflation-real",
  "eco-gdp-cycles",
  "eco-fiscal-debt",
  "num-econometrics",
  "in-rbi-policy",
  "bond-pricing",
  "bond-yield",
  "bond-yield-curve",
  "bond-duration",
  "bond-credit-spreads",
  "in-gsec",
  "fx-basics",
  "eco-trade",
  "fx-bop",
  "in-economy",
  "fx-regimes-crises",
  "sov-default-country-risk",
  "eq-markets",
  "eq-history",
  "risk-portfolio",
  "risk-capm",
  "mkt-efficiency",
  "mkt-behavioural",
  "cf-capital-budgeting",
  "cf-wacc",
  "cf-capital-structure",
  "cf-payout",
  "credit-analysis",
  "val-dcf",
  "val-multiples",
  "val-young",
  "val-banks",
  "val-distress",
  "val-implied-erp",
  "val-india",
  "cf-venture",
  "mkt-ipo-float",
  "der-forwards",
  "der-options",
  "der-option-pricing",
  "der-rates-fx",
  "der-hedging",
  "bank-regulation",
  "crisis-bank-runs",
  "struct-securitisation",
  "private-credit",
  "funds-passive",
  "ins-risk-transfer",
  "real-assets",
  "hist-macro-regimes",
  "gov-ethics",
  "crisis-leverage",
  "fol-uber-2014",
  "fol-twitter-ipo",
  "fol-tesla-2020",
  "fol-roe",
  "fol-sov-ratings",
  "fol-subprime-ai",
  "fol-systemic-risk",
  "fol-money-trap",
  "fol-erp",
  "jud-rating-boundary",
  "jud-assumptions",
  "jud-narrative-numbers",
  "jud-ipo-forecast",
  "jud-predicted-outcomes",
  "jud-units-periods",
  "jud-filing-vs-claim",
  "jud-rating-conflict",
  "ana-build-valuation",
  "ana-who-pays-whom",
  "ana-commitments-debt",
  "ana-india-transfer",
  "ana-decide-between",
  "ana-anthropic-s1",
];

/** A negative stem: a question that asks which one is wrong, not true, or true except one. Banned outright (L6). */
export const NEGATIVE_STEM = /\b(wrong|not|except)\b/i;

/** Checks one Widget preset of a Topic; null means valid, otherwise the problem in words. */
export type PresetCheck = (preset: WidgetPreset, topic: Topic) => string | null;

/** How many seeded draws L7 and the Draws rule take of each template. */
const DRAWS = 50;
const MAX_CARD_LINES = 5;
const MAX_SENTENCE_WORDS = 20;

/**
 * The preset check plain Node can run: a written-ahead preset must name one of the Topic's written-ahead Widgets, with
 * slider names it has and values in range and on step. Recipe presets pass here; `lesson-presets.test.ts` builds them.
 */
export const writtenAheadPresetOk: PresetCheck = (preset, topic) => {
  if (!("widget" in preset)) return null;
  const widget = topic.widgets.find((w) => w.id === preset.widget);
  if (!widget) return `"${preset.widget}" is not one of the Topic's written-ahead Widgets`;
  const problems = presetValueProblems(widget.code, preset.values);
  return problems.length ? problems.join("; ") : null;
};

/** Every problem the lesson lint finds in these Topics, each starting with its rule. */
export function lessonLintErrors(topics: Topic[], opts?: { notYet?: readonly string[]; presetOk?: PresetCheck }): string[] {
  const notYet = opts?.notYet ?? LESSON_NOT_YET_CONVERTED;
  const presetOk = opts?.presetOk ?? writtenAheadPresetOk;
  const errors: string[] = [];
  const ids = new Set(topics.map((t) => t.id));
  for (const id of notYet) {
    if (!ids.has(id)) errors.push(`List: "${id}" is on the lesson lint's not-yet-converted list but is not a Topic: remove it from src/course/lesson-lint.ts`);
  }
  for (const t of topics) {
    errors.push(...restructureProblems(t));
    const listed = notYet.includes(t.id);
    if (listed && isConverted(t)) errors.push(`List: Topic "${t.id}" has Skills, so it is converted: remove it from LESSON_NOT_YET_CONVERTED in src/course/lesson-lint.ts`);
    if (!listed && !isConverted(t)) errors.push(`List: Topic "${t.id}" has no Skills, so it must be on LESSON_NOT_YET_CONVERTED (the list only shrinks: convert the Topic instead)`);
    if (!listed && isConverted(t)) errors.push(...topicLint(t, presetOk));
    else errors.push(...ruleFor(t, lintL6)); // L6 alone covers a Topic that is not converted (topicLint already ran it for a converted one)
  }
  return errors;
}

/** A content-only restructure keeps every pass, so no Check of it may be required (a required Check would fall due). */
function restructureProblems(t: Topic): string[] {
  if (t.restructure !== "content-only") return [];
  return t.checks.filter((c) => c.required).map((c) => `Restructure: Check "${c.id}" is required, but Topic "${t.id}" is a content-only restructure, so it would raise a Due Check`);
}

/** Runs one rule over a Topic, with the same message shape as topicLint. */
function ruleFor(t: Topic, rule: (t: Topic, add: Add) => void): string[] {
  const errors: string[] = [];
  rule(t, (r, text) => errors.push(`${r}: ${text} (Topic "${t.id}")`));
  return errors;
}

/** The lint of one converted Topic. */
function topicLint(t: Topic, presetOk: PresetCheck): string[] {
  const errors: string[] = [];
  const add = (rule: string, text: string) => errors.push(`${rule}: ${text} (Topic "${t.id}")`);
  lintL1(t, add);
  lintL2(t, add);
  lintL3(t, add);
  for (const c of t.checks) {
    const preset = c.card?.widget;
    const problem = preset ? presetOk(preset, t) : null;
    if (preset && problem) add("L4", `Check "${c.id}" card's ${"recipe" in preset ? `recipe "${preset.recipe}"` : `Widget "${preset.widget}"`} preset: ${problem}`);
  }
  lintL5(t, add);
  lintL6(t, add);
  lintL7(t, add);
  lintDraws(t, add);
  return errors;
}

type Add = (rule: string, text: string) => void;

const isFixed = (q: QuickTry): q is Extract<QuickTry, { id: string }> => "id" in q;
const tryName = (q: QuickTry, i: number) => (isFixed(q) ? `"${q.id}"` : `${i + 1} (template "${q.template}")`);
const templateOf = (t: Topic, id: string) => t.templates.find((x) => x.id === id);
const skillOfTry = (t: Topic, q: QuickTry) => (isFixed(q) ? q.skill : templateOf(t, q.template)?.skill);
/** A text as a message quotes it: on one line, and cut at 60 characters. */
const quoted = (text: string) => {
  const line = text.replace(/\s*\n\s*/g, " / ");
  return `"${line.length > 60 ? `${line.slice(0, 57)}...` : line}"`;
};

/** L1: every Skill a Check tests is on a card at or before it; every Check has a card; items carry Skills; terms are listed. */
function lintL1(t: Topic, add: Add) {
  const taught = new Set<string>();
  for (const c of t.checks) {
    if (!c.card) add("L1", `Check "${c.id}" has no Concept card`);
    for (const s of c.card?.skills ?? []) taught.add(s);
    for (const s of testedSkills(t, c)) {
      if (!taught.has(s)) add("L1", `Check "${c.id}" tests Skill "${s}", which no Concept card at or before it teaches`);
    }
    if (c.kind === "conversation" && c.skills.length === 0) add("L1", `Check "${c.id}" is a conversation Check with no skills; list the Skills it tests`);
    if (c.kind === "quiz") {
      for (const qid of c.questions) {
        if (isBankId(qid)) add("L1", `Check "${c.id}" uses Question Bank question "${qid}"; a converted Topic writes its own questions or templates, tagged with Skills`);
        else if (!t.questions.find((q) => q.id === qid)?.skill) add("L1", `Check "${c.id}" question "${qid}" has no Skill`);
      }
    }
    c.quickTries.forEach((q, i) => {
      const s = skillOfTry(t, q);
      if (s && !taught.has(s)) add("L1", `Check "${c.id}" Quick try ${tryName(q, i)} practises Skill "${s}", which no Concept card at or before it teaches`);
    });
  }
  if (t.terms.length === 0) add("L1", "the Topic lists no terms; a converted Topic lists the terms it introduces");
}

/** L2: three Quick tries per Skill (a template is unlimited) with a half-done one, and three attempts' worth of questions. */
function lintL2(t: Topic, add: Add) {
  const count = new Map<string, number>();
  const half = new Set<string>();
  for (const c of t.checks) {
    for (const q of c.quickTries) {
      const s = skillOfTry(t, q);
      if (!s) continue;
      const template = isFixed(q) ? undefined : templateOf(t, q.template);
      count.set(s, template ? Infinity : (count.get(s) ?? 0) + 1);
      if (q.halfDone && (isFixed(q) || template?.halfDone)) half.add(s);
    }
  }
  for (const s of t.skills) {
    const n = count.get(s.id) ?? 0;
    if (n < 3) add("L2", `Skill "${s.id}" has ${n} Quick ${n === 1 ? "try" : "tries"}; it needs at least 3 (a template counts as unlimited)`);
    if (!half.has(s.id)) add("L2", `Skill "${s.id}" has no half-done Quick try (a fixed try with halfDone, or a template entry with halfDone: true)`);
  }
  for (const c of t.checks) {
    if (c.kind !== "quiz" || c.templates.length > 0) continue;
    const shown = c.perAttempt ?? c.passRule.correct;
    const distinct = new Set(c.questions).size;
    if (distinct < 3 * shown) add("L2", `Check "${c.id}" shows ${shown} per attempt, so it needs ${3 * shown} distinct questions or a template for three attempts; it has ${distinct}`);
  }
}

const sentencesOf = (line: string) => line.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
const wordsIn = (sentence: string) => sentence.split(/\s+/).filter(Boolean).length;

/** L3: a card's lines and write-down line make five lines or fewer, each one line, with no sentence over 20 words. */
function lintL3(t: Topic, add: Add) {
  for (const c of t.checks) {
    if (!c.card) continue;
    const entries = [...c.card.lines, c.card.writeDown];
    if (entries.length > MAX_CARD_LINES) add("L3", `Check "${c.id}" card has ${entries.length} lines with its write-down line; at most ${MAX_CARD_LINES}`);
    for (const entry of entries) {
      if (/\n/.test(entry.trim())) add("L3", `Check "${c.id}" card line ${quoted(entry)} holds a line break; give each line its own entry`);
      for (const sentence of sentencesOf(entry)) {
        const n = wordsIn(sentence);
        if (n > MAX_SENTENCE_WORDS) add("L3", `Check "${c.id}" card has a sentence of ${n} words, over ${MAX_SENTENCE_WORDS}: ${quoted(sentence)}`);
      }
    }
  }
}

/** Every string anywhere in a value: the words a recipe preset's inputs carry. */
function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsIn);
  return [];
}

/** The texts L5 reads: the Topic's own examples. Case text is never among them. */
function exampleTexts(t: Topic): { where: string; text: string }[] {
  const texts: { where: string; text: string }[] = [];
  if (t.runningExample) texts.push({ where: "the Running example", text: t.runningExample.text });
  for (const x of t.terms) texts.push({ where: `term "${x.term}"`, text: `${x.term}: ${x.means}` });
  for (const s of t.skills) {
    texts.push({ where: `Skill "${s.id}" rule`, text: s.rule });
    if (s.analogy) texts.push({ where: `Skill "${s.id}" analogy`, text: s.analogy });
  }
  for (const x of t.templates) {
    texts.push({ where: `template "${x.id}" ask`, text: x.ask });
    if (x.halfDone) texts.push({ where: `template "${x.id}" half-done step`, text: x.halfDone.shows });
    for (const m of x.mistakes) texts.push({ where: `template "${x.id}" fix for ${m.tag}`, text: m.fix });
  }
  for (const c of t.checks) {
    if (c.card) {
      const card = c.card;
      texts.push({ where: `Check "${c.id}" card title`, text: card.title });
      for (const line of [...card.lines, card.writeDown]) texts.push({ where: `Check "${c.id}" card`, text: line });
      const preset = card.widget;
      if (preset && "recipe" in preset) {
        for (const text of [...(preset.title ? [preset.title] : []), ...stringsIn(preset.inputs)]) texts.push({ where: `Check "${c.id}" card preset`, text });
      }
    }
    c.quickTries.forEach((q) => {
      if (!isFixed(q)) return;
      texts.push({ where: `Check "${c.id}" Quick try "${q.id}" ask`, text: q.ask });
      if (q.halfDone) texts.push({ where: `Check "${c.id}" Quick try "${q.id}" half-done step`, text: q.halfDone });
      for (const m of q.mistakes ?? []) texts.push({ where: `Check "${c.id}" Quick try "${q.id}" fix`, text: m.fix });
    });
  }
  return texts;
}

const WRONG_CURRENCY = {
  INR: { sign: /US\$|\$|USD|€|£/, says: "a rupee Topic" },
  USD: { sign: /₹|\bRs\b/, says: "a dollar Topic" },
} as const;

/** L5: the Topic's examples use its example currency only. */
function lintL5(t: Topic, add: Add) {
  const rule = WRONG_CURRENCY[t.exampleCurrency];
  for (const { where, text } of exampleTexts(t)) {
    const hit = rule.sign.exec(text);
    if (hit) add("L5", `${where} uses "${hit[0]}" in ${rule.says} (exampleCurrency ${t.exampleCurrency}): ${quoted(text)}`);
  }
}

/**
 * L6: no question prompt, template ask or fixed Quick-try ask says "wrong", "not" or "except". It runs on every Topic,
 * converted or not, and reads every question in the file, even one no Check lists. Question Bank items live in the
 * database, so this rule cannot see them.
 */
function lintL6(t: Topic, add: Add) {
  const say = (where: string, text: string) => {
    const hit = NEGATIVE_STEM.exec(text);
    if (hit) add("L6", `${where} says "${hit[0]}"; ask "Which one is true?" instead: ${quoted(text)}`);
  };
  for (const q of t.questions) say(`question "${q.id}" prompt`, q.prompt);
  for (const x of t.templates) say(`template "${x.id}" ask`, x.ask);
  for (const c of t.checks) for (const q of c.quickTries) if (isFixed(q)) say(`Check "${c.id}" Quick try "${q.id}" ask`, q.ask);
}

/** Every number written in a text, read without its sign or thousands commas. */
const numbersIn = (text: string) => [...text.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "")));
const holdsAll = (text: string, example: number[]) => {
  const found = numbersIn(text);
  return example.every((n) => found.some((f) => Math.abs(f - n) < 1e-9));
};

/** L7: no question a Check lists, and no draw of a template it lists, holds all the numbers of a worked example. */
function lintL7(t: Topic, add: Add) {
  const examples = [
    ...(t.runningExample ? [{ name: "the Running example", numbers: t.runningExample.numbers }] : []),
    ...t.checks.flatMap((c) => (c.card?.example ? [{ name: `Check "${c.id}" card's example`, numbers: c.card.example }] : [])),
  ];
  const clash = (text: string) => examples.find((e) => holdsAll(text, e.numbers));
  for (const c of t.checks) {
    if (c.kind !== "quiz") continue;
    for (const qid of c.questions) {
      const q = t.questions.find((x) => x.id === qid);
      const e = q && clash(q.prompt);
      if (e) add("L7", `Check "${c.id}" question "${qid}" uses the numbers of ${e.name} (${e.numbers.join(", ")}); give it a different move`);
    }
    for (const tid of c.templates) {
      const template = templateOf(t, tid);
      if (!template) continue;
      for (let i = 0; i < DRAWS; i++) {
        let prompt: string;
        try {
          prompt = drawTemplate(template, `lint-${i}`).prompt;
        } catch {
          break; // the Draws rule reports a template that cannot draw
        }
        const e = clash(prompt);
        if (e) {
          add("L7", `Check "${c.id}" template "${tid}" draws ${quoted(prompt)}, which uses the numbers of ${e.name} (${e.numbers.join(", ")}); add them to its avoid list`);
          break;
        }
      }
    }
  }
}

/** Draws: every template draws and marks its own answer right; a fixed try's answer is exact and no Known mistake equals it. */
function lintDraws(t: Topic, add: Add) {
  for (const x of t.templates) {
    const problems = templateProblems(x);
    for (const p of problems) add("Draws", `template "${x.id}": ${p}`);
    if (problems.length) continue;
    for (const halfDone of x.halfDone ? [false, true] : [false]) {
      for (let i = 0; i < DRAWS; i++) {
        try {
          const item = drawTemplate(x, `lint-${i}`, { halfDone });
          const typed = formatExact(item.answer, item.unit);
          const marked = markAnswer(item, typed);
          if (marked.verdict !== "right") {
            add("Draws", `template "${x.id}" draw ${item.id} marks its own answer ${typed} as ${marked.verdict}`);
            break;
          }
        } catch (error) {
          add("Draws", `template "${x.id}" cannot draw seed lint-${i}${halfDone ? " (half-done)" : ""}: ${(error as Error).message}`);
          break;
        }
      }
    }
  }
  for (const c of t.checks) {
    for (const q of c.quickTries) {
      if (!isFixed(q)) continue;
      const at = `Check "${c.id}" Quick try "${q.id}"`;
      if (q.kind === "number" && typeof q.answer === "number" && q.decimals !== undefined) {
        const answer = exactFrom(q.answer);
        if (!sameValue(roundTo(answer, q.decimals), answer)) add("Draws", `${at} answer ${q.answer} is not exact at its ${q.decimals} decimals`);
      }
      if (markAnswer(q, String(q.answer)).verdict !== "right") add("Draws", `${at} does not mark its own answer ${q.answer} right`);
      for (const m of q.mistakes ?? []) {
        if (m.answer === q.answer || markAnswer(q, String(m.answer)).verdict === "right") add("Draws", `${at} has a Known mistake ${m.answer} that equals its answer`);
      }
    }
  }
}
