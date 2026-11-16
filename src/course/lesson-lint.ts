import { exactFrom, formatExact, roundTo, sameValue } from "../teaching/answers.ts";
import { markAnswer } from "../teaching/mark.ts";
import { drawTemplate, templateProblems } from "../teaching/templates.ts";
import { choicesFor } from "../teaching/choices.ts";
import { sumAsk } from "../teaching/no-sums.ts";
import { L10_NOT_YET_STORY } from "./l10-allowlist.ts";
import { judgementProblems } from "../teaching/judgement.ts";
import { isBankId, isComputedQuestion, isConverted, JUDGEMENT_KINDS, testedSkills, type QuickTry, type Topic, type WidgetPreset } from "./map.ts";
import { textsIn } from "./topic-texts.ts";
import { presetValueProblems } from "./written-ahead-check.ts";
import { isIconName } from "../icons/names.ts";

// The lesson lint (spec #229, ADR 0001): the course check's rules for the teaching a converted Topic's file holds.
// L1 a Check tests only what a card at or before it teaches; L2 enough Quick tries and questions; L3 short cards;
// L4 valid Widget presets; L5 the Topic's currency; L6 no negative stems; L7 Check questions move apart from the
// worked examples; L8 every Quick try's Skill is one its own Check tests; L9 template draws move apart from the fixed
// questions and Quick tries of the same Check; L10 no typed number and no sum (ADR 0002); L11 every emoji name in a Topic file is an Icon name; Draws: every template draws and marks its own answer right, and fixed
// tries are sound; L12 every wrong choice has a mix-up fix; L13 a Spine Topic's quiz Check tests judgement (spec
// 2026-11-12 D4); L14 a computed question has a clear right answer, worked out through the valuation engine (D2).
// Pure, with no "@/" imports, so `scripts/check-course.mjs` runs it under plain Node.

/**
 * Topics the lesson lint does not cover yet: every Topic whose file has no Skills. The list can only shrink: a Topic on
 * it that gains Skills must come off, and a Topic off it without Skills fails. Remove an ID when its Topic is converted;
 * never add one.
 */
export const LESSON_NOT_YET_CONVERTED: readonly string[] = [
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
/** How many seeded draws L9 takes of each template: more, because one clash can be a single pair of numbers. */
const APART_DRAWS = 1000;
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
export function lessonLintErrors(topics: Topic[], opts?: { notYet?: readonly string[]; l10NotYet?: readonly string[]; presetOk?: PresetCheck }): string[] {
  const notYet = opts?.notYet ?? LESSON_NOT_YET_CONVERTED;
  const l10NotYet = opts?.l10NotYet ?? L10_NOT_YET_STORY;
  const presetOk = opts?.presetOk ?? writtenAheadPresetOk;
  const errors: string[] = [];
  const ids = new Set(topics.map((t) => t.id));
  for (const id of notYet) {
    if (!ids.has(id)) errors.push(`List: "${id}" is on the lesson lint's not-yet-converted list but is not a Topic: remove it from src/course/lesson-lint.ts`);
  }
  for (const id of l10NotYet) {
    if (!ids.has(id)) errors.push(`List: "${id}" is on L10_NOT_YET_STORY but is not a Topic: remove it from src/course/l10-allowlist.ts`);
  }
  for (const t of topics) {
    errors.push(...restructureProblems(t));
    const listed = notYet.includes(t.id);
    if (listed && isConverted(t)) errors.push(`List: Topic "${t.id}" has Skills, so it is converted: remove it from LESSON_NOT_YET_CONVERTED in src/course/lesson-lint.ts`);
    if (!listed && !isConverted(t)) errors.push(`List: Topic "${t.id}" has no Skills, so it must be on LESSON_NOT_YET_CONVERTED (the list only shrinks: convert the Topic instead)`);
    if (!listed && isConverted(t)) errors.push(...topicLint(t, presetOk));
    else errors.push(...ruleFor(t, lintL6)); // L6 alone covers a Topic that is not converted (topicLint already ran it for a converted one)
    errors.push(...ruleFor(t, lintL11)); // L11 covers every Topic, converted or not
    errors.push(...ruleFor(t, lintL12)); // so does L12
    errors.push(...ruleFor(t, lintL13)); // L13 reads every Spine Topic
    errors.push(...ruleFor(t, lintL14)); // L14 every computed question and computed Quick try, on any Topic
    // L10 covers every Topic too; an allowlisted Topic is skipped, and must still have a hit (the list only shrinks).
    const hits = ruleFor(t, lintL10);
    if (l10NotYet.includes(t.id)) {
      if (!hits.length) errors.push(`List: Topic "${t.id}" is on L10_NOT_YET_STORY but has no L10 hit: remove it from src/course/l10-allowlist.ts`);
    } else errors.push(...hits);
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
  lintL8(t, add);
  lintL9(t, add);
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
    // A Spine Topic has exactly one Concept card (spec C2), so a Check after it (the conversation Check) teaches from it.
    const sharesSpineCard = t.stage === "spine" && taught.size > 0;
    if (!c.card && !sharesSpineCard) add("L1", `Check "${c.id}" has no Concept card`);
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
    // A Spine Topic's Check draws its four from at least six judgement questions, its computed ones drawing fresh sets on a
    // retry (L13, spec D4), in place of three attempts' worth.
    if (c.kind !== "quiz" || c.templates.length > 0 || t.stage === "spine") continue;
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

const WRONG_CURRENCY = {
  INR: { sign: /US\$|\$|USD|€|£/, says: "a rupee Topic" },
  USD: { sign: /₹|\bRs\b/, says: "a dollar Topic" },
} as const;

/**
 * L5: the Topic's examples use its example currency only. It reads only the `example` texts of `topic-texts.ts`: a Case,
 * a question and what follows them (a question's mix-up fixes, a term's line from the story) keep the Case's currency,
 * and scenes have the story checks' own currency rule.
 */
function lintL5(t: Topic, add: Add) {
  const rule = WRONG_CURRENCY[t.exampleCurrency];
  for (const { where, text } of textsIn(t, ["example"])) {
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

/**
 * L8: every Quick try practises a Skill its own Check tests. Your turn picks tries only for the Check's tested Skills
 * (`nextQuickTry`), so a try on any other Skill is never shown.
 */
function lintL8(t: Topic, add: Add) {
  for (const c of t.checks) {
    const tested = testedSkills(t, c);
    c.quickTries.forEach((q, i) => {
      const s = skillOfTry(t, q);
      if (!s || tested.includes(s)) return;
      add(
        "L8",
        `Check "${c.id}" Quick try ${tryName(q, i)} practises Skill "${s}", which the Check does not test (it tests ${tested.join(", ") || "nothing"}), so the try is never shown; add a question or template on "${s}" to the Check`,
      );
    });
  }
}

/** The numbers a draw put into a template's ask: those in the drawn prompt, less the ones the ask itself writes. */
function drawnNumbers(ask: string, prompt: string): number[] {
  const fixed = numbersIn(ask.replace(/\{\w+\}/g, " "));
  return numbersIn(prompt).filter((n) => {
    const at = fixed.findIndex((f) => Math.abs(f - n) < 1e-9);
    if (at < 0) return true;
    fixed.splice(at, 1);
    return false;
  });
}

/**
 * L9: no draw of a template a Check uses (its quiz templates and its template Quick tries) repeats a fixed question or
 * fixed Quick try of the same Check: a draw whose every drawn number is in that item's text asks the same thing again.
 */
function lintL9(t: Topic, add: Add) {
  for (const c of t.checks) {
    const fixed = [
      ...(c.kind === "quiz" ? c.questions.flatMap((qid) => t.questions.filter((q) => q.id === qid).map((q) => ({ name: `question "${q.id}"`, text: q.prompt }))) : []),
      ...c.quickTries.filter(isFixed).map((q) => ({ name: `Quick try "${q.id}"`, text: q.ask })),
    ];
    if (!fixed.length) continue;
    const used = [...(c.kind === "quiz" ? c.templates : []), ...c.quickTries.flatMap((q) => (isFixed(q) ? [] : [q.template]))];
    for (const tid of new Set(used)) {
      const template = templateOf(t, tid);
      if (!template) continue;
      const seen = new Set<string>();
      for (let i = 0; i < APART_DRAWS; i++) {
        let prompt: string;
        try {
          prompt = drawTemplate(template, `apart-${i}`).prompt;
        } catch {
          break; // the Draws rule reports a template that cannot draw
        }
        if (seen.has(prompt)) continue;
        seen.add(prompt);
        const drawn = drawnNumbers(template.ask, prompt);
        const item = drawn.length ? fixed.find((f) => holdsAll(f.text, drawn)) : undefined;
        if (item) {
          add("L9", `Check "${c.id}" template "${tid}" draws ${quoted(prompt)}, which repeats the numbers of ${item.name} (${drawn.join(", ")}); add one of them to the template's avoid list`);
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
      // A computed try the engine could not serve has no choices; L14 says why.
      if (!isFixed(q) || (q.computed && !q.choices?.length)) continue;
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

/** Every value of an `emoji` key anywhere inside `value` (a scene's cast and beats, a term, the Running example's scene). */
function emojiNamesIn(value: unknown, out: string[]): string[] {
  if (Array.isArray(value)) for (const v of value) emojiNamesIn(v, out);
  else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (key === "emoji" && typeof v === "string") out.push(v);
      else emojiNamesIn(v, out);
    }
  }
  return out;
}

/** The emoji names a Topic file uses: `scenes:`, `terms[].emoji`, `runningExample.scene` and `questions[].speaker`. */
export function topicEmojiNames(t: Topic): string[] {
  const loose = t as unknown as { scenes?: unknown; terms?: unknown; runningExample?: { scene?: unknown }; questions?: { speaker?: unknown }[] };
  const speakers = (loose.questions ?? []).map((q) => q.speaker);
  return [...new Set([...emojiNamesIn(loose.scenes, []), ...emojiNamesIn(loose.terms, []), ...emojiNamesIn(loose.runningExample?.scene, []), ...emojiNamesIn(speakers, [])])];
}

/** L11: every emoji name in the Topic file is an Icon name (`src/icons/names.ts`). The key stays `emoji` because that is what the Topic file writes. */
function lintL11(t: Topic, add: Add) {
  for (const name of topicEmojiNames(t)) {
    if (!isIconName(name)) add("L11", `emoji "${name}" is not an Icon name (src/icons/names.ts)`);
  }
}

/**
 * L12 (spec §3.3, #485): every wrong choice carries a mix-up fix, one line naming the slip, so a wrong tap always shows
 * it. It reads every question in the file and every fixed `kind: choice` Quick try, on every Topic.
 */
function lintL12(t: Topic, add: Add) {
  const say = (where: string, answer: string, choices: { id: string; mistake?: { fix?: string } }[]) => {
    for (const c of choices) {
      if (c.id !== answer && !c.mistake?.fix?.trim()) add("L12", `${where} wrong choice "${c.id}" has no mix-up fix; give it mistake: { tag, fix } with one line naming the slip (spec §3.3)`);
    }
  };
  // A computed question's choices are made by code, which writes each fix from the figures (spec D3).
  for (const q of t.questions) if (!isComputedQuestion(q)) say(`question "${q.id}"`, q.answer, q.choices);
  for (const c of t.checks) for (const q of c.quickTries) if (isFixed(q) && q.kind === "choice" && q.choices) say(`Check "${c.id}" Quick try "${q.id}"`, String(q.answer), q.choices);
}

/** How many seeded draws L10 takes of each template. */
const L10_DRAWS = 20;

/**
 * L10 (ADR 0002): the Learner never types a number and a stem never asks for a sum. It fails a Quick try with kind
 * number, a template whose draws do not each give two distinct choices, and any question prompt, Quick-try ask, template
 * ask, conversation Check prompt or conversation Check passCriteria that `sumAsk` matches. It runs on every Topic; `L10_NOT_YET_STORY` lists those still
 * to be rewritten.
 */
function lintL10(t: Topic, add: Add) {
  const say = (where: string, text: string) => {
    const hit = sumAsk(text);
    if (hit) add("L10", `${where} asks for a sum ("${hit}"); ask about the story or the words instead (ADR 0002): ${quoted(text)}`);
  };
  for (const q of t.questions) say(`question "${q.id}" prompt`, q.prompt);
  for (const x of t.templates) {
    say(`template "${x.id}" ask`, x.ask);
    if (templateProblems(x).length) continue; // the Draws rule reports a template that cannot draw
    for (const halfDone of x.halfDone ? [false, true] : [false]) {
      let bad: string | null = null;
      for (let i = 0; i < L10_DRAWS && !bad; i++) {
        try {
          const item = drawTemplate(x, `l10-${i}`, { halfDone });
          if (!choicesFor(item, `l10-${i}`)) bad = item.prompt;
        } catch {
          break; // the Draws rule reports it
        }
      }
      if (bad) {
        add("L10", `template "${x.id}" gives fewer than 2 distinct choices${halfDone ? " (half-done)" : ""} when it draws ${quoted(bad)}; add a Known mistake that gives another value (ADR 0002)`);
        break;
      }
    }
  }
  for (const c of t.checks) {
    if (c.kind === "conversation") {
      say(`Check "${c.id}" prompt`, c.prompt);
      say(`Check "${c.id}" passCriteria`, c.passCriteria);
    }
    for (const q of c.quickTries) {
      if (!isFixed(q)) continue;
      if (q.kind === "number") add("L10", `Quick try "${q.id}" is typed (kind: number): make it kind: choice (ADR 0002)`);
      say(`Quick try "${q.id}" ask`, q.ask);
    }
  }
}

/** How many questions a Spine Topic's quiz Check draws from, how many of them are judgement kinds, and how many computed (D4). */
export const SPINE_CHECK_QUESTIONS = 6;
export const SPINE_CHECK_JUDGEMENT = 4;
export const SPINE_CHECK_COMPUTED = 1;

/**
 * A question that asks what a term is called: "What is the result called?", "the name for", "What is the term", "Which
 * word". A Spine Check asks for judgement; Lingo is practised in Quick tries and Lingo cards (D4).
 */
export const NAME_ASK = /\bcalled\b|\bthe name for\b|\bwhat is the term\b|\bwhich word\b/i;

/**
 * L13 (spec 2026-11-12, D4): a Spine Topic's quiz Check draws from at least six of the Topic's questions, at least four
 * of them judgement kinds and at least one computed from the Case (when a Case is valued), and none asks what a term is called. Bank questions
 * and templates do not count: a Spine Check is written in the Topic file, and a template draws a typed number.
 */
function lintL13(t: Topic, add: Add) {
  if (t.stage !== "spine") return;
  for (const c of t.checks) {
    if (c.kind !== "quiz") continue;
    const questions = [...new Set(c.questions)].flatMap((qid) => t.questions.filter((q) => q.id === qid));
    const judgement = questions.filter((q) => q.kind !== undefined && (JUDGEMENT_KINDS as readonly string[]).includes(q.kind));
    const computed = questions.filter(isComputedQuestion);
    const where = `Spine Check "${c.id}"`;
    if (questions.length < SPINE_CHECK_QUESTIONS) add("L13", `${where} draws from ${questions.length} of the Topic's questions; it needs at least ${SPINE_CHECK_QUESTIONS}`);
    if (judgement.length < SPINE_CHECK_JUDGEMENT) add("L13", `${where} has ${judgement.length} judgement questions (a kind from D1); it needs at least ${SPINE_CHECK_JUDGEMENT}`);
    // A computed question is valued from a Case's valuation block, so a Topic with no valued Case (the lottery Topic: an
    // annuity, not a business) asks none (spec #68 story 55: lottery questions only in the lottery Topic).
    const valued = t.cases.some((x) => x.valuation);
    if (valued && computed.length < SPINE_CHECK_COMPUTED) add("L13", `${where} has no computed question (which_lever, price_assumes or predict); it needs at least ${SPINE_CHECK_COMPUTED}`);
    for (const q of questions) {
      const hit = NAME_ASK.exec(q.prompt);
      if (hit) add("L13", `${where} question "${q.id}" asks what a term is called ("${hit[0]}"); practise Lingo in Quick tries and Lingo cards, and ask for judgement here: ${quoted(q.prompt)}`);
    }
  }
}

/**
 * L14 (spec 2026-11-12, D2): every computed question and computed Quick try, valued through the engine at check time from
 * its Case's block. A which-lever or what-the-price-assumes question fails when another choice it shows comes within 5% of
 * the right one, and a what-the-price-assumes one when none comes within 5% of the price; a predict question when a change
 * lands in no band or in two (src/teaching/judgement.ts). A Case with no block is the Topic schema's to report.
 */
function lintL14(t: Topic, add: Add) {
  const check = (where: string, input: Parameters<typeof judgementProblems>[0]) => {
    const block = t.cases.find((c) => c.id === input.computed.case)?.valuation;
    if (!block) return;
    for (const problem of judgementProblems(input, block)) add("L14", `${where}: ${problem}`);
  };
  for (const q of t.questions) if (isComputedQuestion(q)) check(`question "${q.id}"`, q);
  for (const c of t.checks) {
    for (const q of c.quickTries) {
      if (isFixed(q) && q.computed) check(`Check "${c.id}" Quick try "${q.id}"`, { id: q.id, kind: q.computed.kind, prompt: q.ask, computed: q.computed });
    }
  }
}
