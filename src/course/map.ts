import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { REFERENCE_CASE, REFERENCE_DATASET_IDS } from "../case-data/reference.ts";
import { FORMULA_IDS } from "../finance/formula-ids.ts";
import { markerProblems } from "../finance/formula-markers.ts";
import { parseOutline, STAGES, type Outline, type OutlineTopic, type Subject } from "./outline.ts";
import { guidedTaskTexts, widgetCodeTitle } from "./written-ahead.ts";
import { MISTAKE_FNS } from "../teaching/mistakes.ts";
import { ANSWER_FNS } from "../teaching/quantities.ts";
import type { FixedItem, QuestionTemplate, SignRule, Unit } from "../teaching/index.ts";

// This module imports only packages (no "@/" paths), so `scripts/check-course.mjs`
// can run it directly with Node's type stripping.

const id = z.string().regex(/^[a-z0-9-]+$/, "IDs use lower case letters, digits and hyphens");

// ——— The teaching a converted Topic's file holds (spec #229, ADR 0006) ———
// Every field is optional, so a Topic file written before it loads unchanged. A Topic with Skills is converted.

const UNITS = ["points", "bp", "percent", "inr", "years", "ratio", "number"] as const satisfies readonly Unit[];
const SIGN_RULES = ["magnitude", "signed", "either"] as const satisfies readonly SignRule[];

/** A named engine function: the error names the bad one and every allowed name. */
const engineName = <T extends string>(what: string, names: readonly [T, ...T[]]) =>
  z.enum(names as [T, ...T[]], { error: (issue) => `${what} "${String(issue.input)}" is not one of ${names.join(", ")}` });

const answerFn = engineName("answer function", ANSWER_FNS);
const mistakeFn = engineName("mistake function", MISTAKE_FNS);

/** The currency of a Topic's everyday examples: cards, Quick tries, templates, Skills and Widget presets. Case text keeps its own. */
const EXAMPLE_CURRENCIES = ["INR", "USD"] as const;
export type ExampleCurrency = (typeof EXAMPLE_CURRENCIES)[number];

/** One idea a Check tests: its rule in plain words, and at most one analogy, reused. */
const skillSchema = z.object({ id, rule: z.string().trim().min(1), analogy: z.string().trim().min(1).optional() });
export type Skill = z.infer<typeof skillSchema>;

/** A term the Topic introduces, and what it means in plain words. */
const termSchema = z.object({ term: z.string().trim().min(1), means: z.string().trim().min(1) });
export type Term = z.infer<typeof termSchema>;

/** The Topic's one Running example, and its numbers: "A savings rate goes from 4% to 5%.", [4, 5]. */
const runningExampleSchema = z.object({ text: z.string().trim().min(1), numbers: z.array(z.number()).min(1) });
export type RunningExample = z.infer<typeof runningExampleSchema>;

/**
 * The Widget a Concept card opens, already set: a Widget recipe and its inputs (rate_move { old, new, mode }), or one of
 * the Topic's written-ahead Widgets and its sliders' values (keys are slider names, "$" optional).
 */
const widgetPresetSchema = z.union([
  z.object({ recipe: z.string().min(1), inputs: z.record(z.string(), z.unknown()), title: z.string().trim().min(1).optional() }).strict(),
  z.object({ widget: id, values: z.record(z.string(), z.number()) }).strict(),
]);
export type WidgetPreset = { recipe: string; inputs: Record<string, unknown>; title?: string } | { widget: string; values: Record<string, number> };

/** A Concept card: at most five plain lines with one worked example, one line to write down, and the Skills it teaches. */
const conceptCardSchema = z.object({
  title: z.string().trim().min(1),
  lines: z.array(z.string().min(1)).min(1),
  writeDown: z.string().trim().min(1),
  skills: z.array(id).min(1),
  /** The worked example's numbers, when it is not the Running example. */
  example: z.array(z.number()).min(1).optional(),
  widget: widgetPresetSchema.optional(),
});
export type ConceptCard = { title: string; lines: string[]; writeDown: string; skills: string[]; example?: number[]; widget?: WidgetPreset };

/** A fixed item's Known mistake: a wrong answer the file predicts, with its one-line fix. */
const fixedMistakeSchema = z.object({ answer: z.union([z.number(), z.boolean()]), fix: z.string().trim().min(1), tag: z.string().min(1).optional() });

/** A written-out choice: its id, its words, and for a wrong one the Known mistake it stands for. */
const fixedChoiceSchema = z.object({
  id,
  text: z.string().trim().min(1),
  mistake: z.object({ tag: z.string().min(1), fix: z.string().trim().min(1) }).optional(),
});

/** A Quick try written in full: a number (shown as choices), True or False, or a choice written out, in the engine's FixedItem shape. */
const fixedItemShape = {
  id,
  skill: id,
  ask: z.string().trim().min(1),
  kind: z.enum(["number", "truth", "choice"]),
  answer: z.union([z.number(), z.boolean(), z.string()]),
  choices: z.array(fixedChoiceSchema).min(2).max(4).optional(),
  label: z.string().trim().min(1).optional(),
  unit: z.enum(UNITS).optional(),
  decimals: z.number().int().min(0).optional(),
  sign: z.enum(SIGN_RULES).optional(),
  mistakes: z.array(fixedMistakeSchema).optional(),
};

/**
 * A Quick try: fixed, or one draw of a question template. A fixed try with `halfDone` is a half-done try (R5), the string
 * being the first step code shows above the ask; a template entry with `halfDone: true` draws the template's half-done
 * variant (drawTemplate(t, seed, { halfDone: true })).
 */
const quickTrySchema = z.union([
  z.object({ ...fixedItemShape, halfDone: z.string().trim().min(1).optional() }).strict(),
  z.object({ template: id, halfDone: z.literal(true).optional() }).strict(),
]);
export type FixedQuickTry = FixedItem & { halfDone?: string };
export type QuickTry = FixedQuickTry | { template: string; halfDone?: true };

const paramRange = z.object({ min: z.number(), max: z.number(), step: z.number() });

/** A question template, in the engine's QuestionTemplate shape: code makes its numbers and answer. */
const templateSchema = z.object({
  id,
  skill: id,
  ask: z.string().trim().min(1),
  params: z.record(z.string(), paramRange),
  derived: z.record(z.string(), z.string()).optional(),
  answer: answerFn,
  unit: z.enum(UNITS),
  decimals: z.number().int().min(0),
  sign: z.enum(SIGN_RULES),
  label: z.string().trim().min(1).optional(),
  mistakes: z.array(z.object({ tag: mistakeFn, fix: z.string().trim().min(1) })).default([]),
  halfDone: z.object({ shows: z.string().trim().min(1), asks: answerFn }).optional(),
  avoid: z.array(z.number()).optional(),
});

// The typed items are the teaching engine's own shapes, so code marks and draws them as they are.
const asTemplate = (t: z.output<typeof templateSchema>) => t satisfies QuestionTemplate;
const asQuickTry = (q: z.output<typeof quickTrySchema>) => q satisfies QuickTry;
const asCard = (c: z.output<typeof conceptCardSchema>) => c satisfies ConceptCard;
void [asTemplate, asQuickTry, asCard];
export type TopicTemplate = z.output<typeof templateSchema>;

/** What each Check gains: its Concept card and its Quick tries. */
const checkTeaching = {
  card: conceptCardSchema.optional(),
  quickTries: z.array(quickTrySchema).default([]),
};

const conversationCheck = z.object({
  id,
  kind: z.literal("conversation"),
  /** A Check added to an already passed Topic is due only if it is required. */
  required: z.boolean().default(false),
  prompt: z.string().min(1),
  passCriteria: z.string().min(1),
  /** The Skills this Check tests, which a Concept card at or before it must teach (lint L1). */
  skills: z.array(id).default([]),
  ...checkTeaching,
});

/** A Claude-written quiz question. The key (`answer`, `explanation`) stays on the server until the Learner has answered. */
const quizQuestion = z.object({
  id,
  prompt: z.string().min(1),
  /** `mistake`: a wrong choice's Known mistake, whose one-line fix the marking shows. */
  choices: z
    .array(z.object({ id, text: z.string().min(1), mistake: z.object({ fix: z.string().trim().min(1), tag: z.string().min(1).optional() }).optional() }))
    .min(2),
  /** The ID of the right choice. */
  answer: id,
  /** Shown only after the Learner has answered. */
  explanation: z.string().min(1),
  /** Where the answer was checked: a citation or URL. */
  source: z.string().min(1),
  /** The Skill the question tests (converted Topics). */
  skill: id.optional(),
});

const quizCheck = z.object({
  id,
  kind: z.literal("quiz"),
  required: z.boolean().default(false),
  /** IDs of questions in the Topic's `questions` list, and of Question Bank questions (`bank:...`). Empty only with `templates`. */
  questions: z.array(z.string().min(1)).default([]),
  /** IDs of the Topic's question templates this Check draws typed questions from, with new numbers each attempt. */
  templates: z.array(id).default([]),
  /** How many questions one attempt shows; defaults to the pass rule's `correct`. */
  perAttempt: z.number().int().min(1).optional(),
  passRule: z.object({ correct: z.number().int().min(1) }),
  ...checkTeaching,
}).refine((c) => c.questions.length + c.templates.length > 0, { message: "A quiz Check lists questions, templates or both", path: ["questions"] });

/**
 * A dated piece by a writer (an essay or blog post) that a Follow, Judge or Analyse Case studies:
 * the story is the piece as published, and the reveal is what happened afterwards. `from` says
 * where the Tutor gets its text: the Library (searched with `librarySource` as the source filter,
 * quoted only in short passages with credit) or the Learner's paste, which is never stored in the
 * Library or the repo.
 */
const pieceSchema = z.object({
  author: z.string().min(1),
  title: z.string().min(1),
  published: z.iso.date(),
  url: z.url(),
  from: z.enum(["library", "paste"]),
  /** The search_library source filter that finds the piece, e.g. "Damodaran". Library pieces only. */
  librarySource: z.string().min(1).optional(),
});

export type Piece = z.infer<typeof pieceSchema>;

const caseSchema = z.object({
  id: id.refine((v) => v !== REFERENCE_CASE, { message: `"${REFERENCE_CASE}" is reserved for reference data and cannot be a Case id` }),
  title: z.string().min(1),
  /** IDs of the Case Data datasets this Case is taught with. The laptop check confirms each one exists. */
  data: z.array(id).default([]),
  /** The story uses only what was known on this date. */
  asOf: z.iso.date(),
  story: z.string().min(1),
  /** Withheld from the Tutor until the reveal Teaching Step. */
  reveal: z.string().min(1),
  /** The dated piece this Case studies, if it is a writer's piece. */
  piece: pieceSchema.optional(),
});

/**
 * A Topic's Insight (ADR 0001): the surprising consequence of its idea, which the Learner finds at
 * the explore Teaching Step. The written Insight stays on the server until it is found or told.
 */
const insightSchema = z.object({
  /** What the Tutor asks the Learner to work out. Must not give the Insight away. */
  question: z.string().min(1),
  /** The Insight as a sentence. Reaches the Tutor only in a tool result, once found or told. */
  written: z.string().min(1),
  /** How the Tutor tells the Learner has found it. */
  foundWhen: z.string().min(1),
  /** Hint 1, then hint 2, released one per not-yet attempt. */
  hints: z.array(z.string().min(1)).min(1).max(2),
});

/** Where explore sits: after the concept of the named Check, before that Check's your turn. */
const exploreSchema = z.object({
  before: id,
  /** Whether a Learner who already passed the Topic is taken through explore again. */
  requiredWhenPassed: z.boolean().default(false),
  /**
   * The id of the Topic's written-ahead Widget (under `widgets`) that is its explore Widget. Code (not the Tutor)
   * puts it in the Widget panel when explore begins and keeps it there until the Topic is passed; the Tutor can
   * reopen the same Widget later with open_widget. See src/course/explore-widget.ts.
   */
  widget: id.optional(),
});

export type Insight = z.infer<typeof insightSchema>;

/**
 * A written-ahead Widget (spec #119, "Widgets › Written-ahead Widgets"): a Widget written in the Topic file,
 * which the Tutor opens by id with its open_widget tool and never draws a version of its own.
 * See src/course/written-ahead.ts.
 */
const writtenAheadSchema = z.object({
  id,
  /** The Widget in OpenUI code; its title is the one its root Widget("...") gives. */
  code: z.string().min(1),
  /**
   * What a Widget the Tutor draws may not use in this Topic, because this Widget covers it: one of our parts
   * ("AnnuityChart"), a Widget tool ("annuity_schedule") or a calculator id ("cagr").
   */
  parts: z.array(z.string().min(1)).default([]),
  /**
   * The two sliders ($variables) whose rate change the Widget says three ways (Percent): code works out its readouts
   * in points, basis points and percent change for the Tutor with the tested rateChange (src/finance/rate-change.ts).
   */
  rateChange: z.object({ old: z.string().regex(/^\$\w+$/), new: z.string().regex(/^\$\w+$/) }).optional(),
  /**
   * A Guided Task that joins the Widget's GuidedTasks once the Case's reveal has been shown, with the move its
   * dataset made across the Case's as-of date: {before} is the last value on or before it, {after} the first after.
   * Before the reveal the as-of rule withholds the "after" value, so the task does not appear.
   */
  revealTask: z
    .object({
      case: id,
      dataset: id,
      /** The task's words, e.g. "Set the move of February 1994: from {before}% to {after}%". */
      text: z.string().min(1),
      /** Its condition in OpenUI code, e.g. "$old == {before} && $new == {after}". */
      done: z.string().min(1),
      /**
       * A quick button that joins a slider with the task, setting it to the move's {before} value: the slider by its
       * name, and the note after the value on the button, e.g. "3.33% (30-yr Treasury, 24 Oct 2018)".
       */
      quick: z.object({ slider: z.string().min(1), note: z.string().min(1) }).optional(),
    })
    .optional(),
});

export type WrittenAheadSpec = z.infer<typeof writtenAheadSchema>;

const variableName = z.string().regex(/^\$[A-Za-z_]\w*$/, "A $variable name, e.g. $guess");

/**
 * A condition on the saved state of one written-ahead Widget: a Guided Task ticked, a $variable that has a saved value
 * (a Predict's guess locked), or one saved near a target (a Breakeven found). Read from Widget state (src/course/written-ahead.ts).
 */
const widgetConditionSchema = z.discriminatedUnion("kind", [
  /** `task` 1 is the first Guided Task in the Widget's GuidedTasks list. */
  z.object({ kind: z.literal("ticked"), widget: id, task: z.number().int().min(1) }),
  z.object({ kind: z.literal("set"), widget: id, variable: variableName }),
  z.object({ kind: z.literal("near"), widget: id, variable: variableName, value: z.number(), within: z.number().positive() }),
]);

/** The Teaching Steps a step setting may name (the same words as TEACHING_STEPS in navigator.ts; a test keeps them equal). */
export const STEP_KEYS = ["story", "concept", "explore", "your_turn", "check", "reveal", "principle"] as const;

/**
 * What one Teaching Step does by itself. `opens`: the id of a written-ahead Widget that code puts in the Widget panel when
 * the step begins. `doneWhen`: the step counts as done once the Learner's saved Widget state meets the condition, so the
 * Learner can go on without the Tutor finishing it. Never on explore or Check: the Insight is settled only by the
 * Learner's own words (ADR 0001), and a Check only by a saved result. `check` limits the setting to that Check's steps.
 */
const stepSettingSchema = z
  .object({ step: z.enum(STEP_KEYS), check: id.optional(), opens: id.optional(), doneWhen: widgetConditionSchema.optional() })
  .refine((s) => s.opens !== undefined || s.doneWhen !== undefined, "A step setting needs opens or doneWhen");

/** One line of what the Learner found, shown on Past Sessions and the Topic complete card once `when` holds. `{value}` in `text` is the saved value. */
const foundSchema = z.object({ when: widgetConditionSchema, text: z.string().trim().min(1) });

export type StepSetting = z.infer<typeof stepSettingSchema>;
export type FoundSpec = z.infer<typeof foundSchema>;

/** Problems in a Topic's step settings and found lines: Widgets and Checks that do not exist, and conditions that cannot be met. */
function stepSettingProblems(topic: {
  steps?: StepSetting[];
  found?: FoundSpec[];
  widgets: WrittenAheadSpec[];
  checks: { id: string }[];
  explore?: { widget?: string };
}): string[] {
  const problems: string[] = [];
  const widget = (wid: string) => topic.widgets.find((w) => w.id === wid);
  const condition = (where: string, c: z.infer<typeof widgetConditionSchema>) => {
    const w = widget(c.widget);
    if (!w) problems.push(`${where}: no written-ahead Widget "${c.widget}"`);
    else if (c.kind === "ticked" && c.task > guidedTaskTexts(w.code).length) problems.push(`${where}: Widget "${c.widget}" has no Guided Task ${c.task}`);
  };
  (topic.steps ?? []).forEach((s, i) => {
    const where = `steps.${i} (${s.step})`;
    if (s.check && !topic.checks.some((c) => c.id === s.check)) problems.push(`${where}: no Check "${s.check}"`);
    if (s.opens) {
      if (!widget(s.opens)) problems.push(`${where}: opens "${s.opens}", which is not a written-ahead Widget of this Topic`);
      else if (topic.explore?.widget === s.opens) problems.push(`${where}: "${s.opens}" is the explore Widget, which code shows by itself when the explore step begins`);
    }
    if (s.doneWhen) {
      if (s.step === "explore" || s.step === "check") {
        problems.push(`${where}: a ${s.step} step cannot finish from Widget state (the Insight is settled by the Learner's own words, ADR 0001, and a Check by its saved result)`);
      }
      if (s.step === "principle") problems.push(`${where}: the Topic is completed by the Learner pressing Complete this Topic`);
      condition(`${where} doneWhen`, s.doneWhen);
    }
  });
  (topic.found ?? []).forEach((f, i) => {
    condition(`found.${i}`, f.when);
    if (f.when.kind === "ticked" && f.text.includes("{value}")) problems.push(`found.${i}: a ticked task has no {value}`);
  });
  return problems;
}

export { STAGES };

/** A link from a Topic's idea to others, given at the principle step. Plain words only: figures belong to the Case Data. */
const connectionSchema = z.object({
  text: z.string().min(1),
  /** Outline Topic IDs (written or still coming) this Connection links to. */
  topics: z.array(id).min(1),
});

/**
 * A Topic file. Stage, place and prerequisites belong in `course/outline.yaml`. A file sets them
 * itself only when a map is checked without an outline (as the tests do).
 */
const topicSchema = z.object({
  id,
  title: z.string().min(1),
  stage: z.enum(STAGES).optional(),
  /** Place on the default path; lower comes first. */
  path: z.number().int().optional(),
  prerequisites: z.array(id).optional(),
  cases: z.array(caseSchema).min(1),
  /** The Topic's goal in one line (what the Learner will be able to do), shown in the Topic bar. Words only, never the Insight. */
  goal: z.string().trim().min(1).max(120).optional(),
  concept: z.string().min(1),
  /** The named formulas this Topic teaches, each shown only as a Formula Card (IDs from the formula registry). */
  formulas: z
    .array(z.string().refine((f) => (FORMULA_IDS as readonly string[]).includes(f), { message: `Unknown formula; the formula registry has: ${FORMULA_IDS.join(", ")}` }))
    .default([]),
  principle: z.string().min(1),
  /**
   * You'll learn: two or three short bullets saying what the Topic gives a Learner, shown on the Topic
   * Start card and the Welcome. Drafted from the concept and principle only, in words (no figures, no
   * typed formulas, never the Insight); the course check enforces this (src/course/youll-learn-check.ts).
   */
  youllLearn: z.array(z.string().trim().min(1)).min(2).max(3).optional(),
  /** The Topic's Insight and the explore step that leads the Learner to it; both or neither. */
  insight: insightSchema.optional(),
  explore: exploreSchema.optional(),
  /** The Topic's written-ahead Widgets, which the Tutor opens by id (src/course/written-ahead.ts). */
  widgets: z.array(writtenAheadSchema).default([]),
  /** What a Teaching Step does by itself: opens a Widget when it begins, and is done once the Learner's Widget state says so. */
  steps: z.array(stepSettingSchema).optional(),
  /** What the Learner found, one line each once their saved Widget state shows it (Past Sessions, Topic complete card). */
  found: z.array(foundSchema).optional(),
  /** Two or three Connections the Tutor gives at the principle step. Optional. */
  connections: z
    .array(connectionSchema)
    .max(3)
    .refine((c) => c.length !== 1, "give two or three Connections, or none")
    .optional(),
  /** Claude-written quiz questions that this Topic's quiz Checks draw on. */
  questions: z.array(quizQuestion).default([]),
  /** The currency of the Topic's everyday examples; rupees unless the file says otherwise. Case text keeps its own. */
  exampleCurrency: z.enum(EXAMPLE_CURRENCIES).default("INR"),
  runningExample: runningExampleSchema.optional(),
  /** The terms the Topic introduces (converted Topics list them). */
  terms: z.array(termSchema).default([]),
  /** The Topic's Skills. A Topic with any is converted: its Concept steps show cards. */
  skills: z.array(skillSchema).default([]),
  /** Question templates its Quick tries and quiz Checks draw from. */
  templates: z.array(templateSchema).default([]),
  /**
   * A content-only restructure: new cards and Quick tries with every Check id kept, so passes stay and Learners keep
   * their step. The lesson lint fails such a Topic if any Check is required, so no Due Check appears.
   */
  restructure: z.literal("content-only").optional(),
  /**
   * The Widget code opens, already set, when a converted Topic's reveal begins: a recipe whose inputs written "{before}"
   * or "{after}" take the move one of the Case's datasets made across its as-of date (read from Case Data, never typed).
   */
  revealWidget: z
    .object({
      recipe: z.string().min(1),
      title: z.string().trim().min(1).optional(),
      case: id,
      dataset: id,
      inputs: z.record(z.string(), z.unknown()),
    })
    .strict()
    .optional(),
  checks:z.array(z.discriminatedUnion("kind", [conversationCheck, quizCheck])),
}).superRefine((topic, ctx) => {
  // Formula markers ({{formula:...}}) must name a formula on this Topic's own list and give exactly its inputs.
  const texts = [
    ...topic.cases.flatMap((c) => [c.story, c.reveal]),
    topic.concept,
    topic.principle,
    ...(topic.connections ?? []).map((c) => c.text),
    ...topic.questions.flatMap((q) => [q.prompt, q.explanation, ...q.choices.map((c) => c.text)]),
    ...topic.checks.flatMap((c) => (c.kind === "conversation" ? [c.prompt, c.passCriteria] : [])),
  ];
  for (const text of texts) {
    for (const problem of markerProblems(text, topic.formulas)) ctx.addIssue({ code: "custom", message: `formula marker ${problem}` });
  }
  for (const problem of stepSettingProblems(topic)) ctx.addIssue({ code: "custom", message: problem });
  for (const problem of teachingProblems(topic)) ctx.addIssue({ code: "custom", message: problem });
});

/** References in a Topic's teaching that do not resolve (Skills, templates, written-ahead Widgets), and items that contradict themselves. */
function teachingProblems(topic: {
  skills: Skill[];
  templates: TopicTemplate[];
  widgets: { id: string }[];
  questions: { id: string; skill?: string; answer: string; choices: { id: string; mistake?: unknown }[] }[];
  checks: { id: string; skills?: string[]; templates?: string[]; card?: ConceptCard; quickTries: QuickTry[] }[];
}): string[] {
  const problems: string[] = [];
  const skillIds = new Set<string>();
  for (const s of topic.skills) {
    if (skillIds.has(s.id)) problems.push(`Skill "${s.id}" is listed twice`);
    skillIds.add(s.id);
  }
  const skill = (where: string, sid: string) => {
    if (!skillIds.has(sid)) problems.push(`${where} names Skill "${sid}", which the Topic does not list under skills`);
  };
  const templates = new Map(topic.templates.map((t) => [t.id, t]));
  for (const t of topic.templates) skill(`Template "${t.id}"`, t.skill);
  for (const q of topic.questions) {
    if (q.skill) skill(`Question "${q.id}"`, q.skill);
    if (q.choices.some((c) => c.id === q.answer && c.mistake)) problems.push(`Question "${q.id}" gives its right choice "${q.answer}" a Known mistake`);
  }
  for (const c of topic.checks) {
    const where = `Check "${c.id}"`;
    for (const sid of c.skills ?? []) skill(where, sid);
    for (const tid of c.templates ?? []) if (!templates.has(tid)) problems.push(`${where} draws from template "${tid}", which the Topic does not have`);
    if (c.card) {
      for (const sid of c.card.skills) skill(`${where} card`, sid);
      const preset = c.card.widget;
      if (preset && "widget" in preset && !topic.widgets.some((w) => w.id === preset.widget)) {
        problems.push(`${where} card opens Widget "${preset.widget}", which is not one of the Topic's written-ahead Widgets`);
      }
    }
    c.quickTries.forEach((q, i) => {
      if ("template" in q) {
        const t = templates.get(q.template);
        if (!t) problems.push(`${where} Quick try ${i + 1} draws from template "${q.template}", which the Topic does not have`);
        else if (q.halfDone && !t.halfDone) problems.push(`${where} Quick try ${i + 1} asks for the half-done variant of template "${q.template}", which has none`);
        return;
      }
      const at = `${where} Quick try "${q.id}"`;
      skill(at, q.skill);
      const answerKind = { number: "number", truth: "boolean", choice: "string" }[q.kind];
      if (typeof q.answer !== answerKind) problems.push(`${at} is a ${q.kind} item, so its answer must be ${{ number: "a number", truth: "true or false", choice: "a choice id" }[q.kind]}`);
      if ((q.mistakes ?? []).some((m) => typeof m.answer !== typeof q.answer)) problems.push(`${at} has a Known mistake of a different kind from its answer`);
      if (q.kind === "choice") {
        if (!q.choices) problems.push(`${at} is a choice item, so it needs choices`);
        else if (!q.choices.some((c) => c.id === q.answer)) problems.push(`${at} answers "${q.answer}", which is not one of its choices`);

      } else if (q.choices) problems.push(`${at} is a ${q.kind} item, so it takes no choices`);
    });
  }
  return problems;
}

/** A Connection with the titles of its linked Topics filled in by code. */
export type Connection = { text: string; topics: string[]; titles: string[] };

export type Topic = Omit<z.infer<typeof topicSchema>, "stage" | "path" | "prerequisites" | "connections"> & {
  /** Empty when the Topic has none. */
  connections: Connection[];
  stage: (typeof STAGES)[number];
  /** The field a Foundation Topic belongs to (from the outline); none for later Stages. */
  subject?: Subject;
  /** Place on the default path; lower comes first. */
  path: number;
  prerequisites: string[];
};
export type Check = Topic["checks"][number];
export type QuizCheck = Extract<Check, { kind: "quiz" }>;
export type QuizQuestion = Topic["questions"][number];
export type ConversationCheck = Extract<Check, { kind: "conversation" }>;

export { isConverted, testedSkills } from "./tested-skills.ts";

export type CourseMap = {
  /** Topics in default-path order. */
  topics: Topic[];
  topic(id: string): Topic | undefined;
  check(id: string): (Check & { topicId: string }) | undefined;
  /** A quiz question by ID, from whichever Topic holds it. */
  question(id: string): QuizQuestion | undefined;
  /** A question template by ID, from whichever Topic holds it. */
  template(id: string): (TopicTemplate & { topicId: string }) | undefined;
  /** Topics in the outline that are not written yet, in default-path order. Not teachable, shown as coming. */
  coming: OutlineTopic[];
};

export type TopicFile = { name: string; text: string };

/**
 * Parses and validates Topic files. Returns every problem found, not just the first.
 * With an `outline`, each file must match an outline entry, which supplies its Stage, place and
 * prerequisites (the written ones only); outline Topics with no file come back as `coming`.
 */
export function parseCourseMap(files: TopicFile[], outline?: Outline): { map?: CourseMap; errors: string[] } {
  const errors: string[] = [];
  const topics: Topic[] = [];
  for (const file of files) {
    try {
      const result = topicSchema.safeParse(parse(file.text));
      if (!result.success) {
        errors.push(...result.error.issues.map((i) => `${file.name}: ${i.path.join(".") || "(file)"}: ${i.message}`));
        continue;
      }
      const pieceErrors = result.data.cases.flatMap(pieceProblems);
      if (pieceErrors.length) {
        errors.push(...pieceErrors.map((e) => `${file.name}: ${e}`));
        continue;
      }
      const resolved = resolveTopic(result.data, outline);
      if (typeof resolved === "string") errors.push(`${file.name}: ${resolved}`);
      else topics.push(resolved);
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length) return { errors };
  if (outline) {
    // Only written Topics can be passed, so a prerequisite that is still Coming is left out of the teachable map.
    const written = new Set(topics.map((t) => t.id));
    for (const t of topics) t.prerequisites = t.prerequisites.filter((p) => written.has(p));
  }

  const seen = new Set<string>();
  for (const t of topics) {
    const fixedTries = t.checks.flatMap((c) => c.quickTries.flatMap((q) => ("id" in q ? [q.id] : [])));
    const keys = [t.id, ...t.cases.map((c) => c.id), ...t.checks.map((c) => c.id), ...t.questions.map((q) => q.id), ...t.templates.map((x) => x.id), ...fixedTries];
    for (const key of keys) {
      if (seen.has(key)) errors.push(`Duplicate ID "${key}"`);
      seen.add(key);
    }
  }

  const byId = new Map(topics.map((t) => [t.id, t]));
  // With an outline a Connection may name any planned Topic, written or coming; without one, written Topics only.
  const titles = new Map((outline ? outline.topics : topics).map((t) => [t.id, t.title] as const));
  for (const t of topics) {
    errors.push(...connectionProblems(t, titles));
    if (t.checks.length === 0) errors.push(`Topic "${t.id}" has no Checks`);
    errors.push(...quizProblems(t), ...insightProblems(t), ...writtenAheadProblems(t), ...revealWidgetProblems(t));
    for (const p of t.prerequisites) {
      if (!byId.has(p)) errors.push(`Topic "${t.id}" requires "${p}", which is not on the Course Map`);
    }
  }
  const loop = findLoop(topics, byId);
  if (loop) errors.push(`Prerequisite loop: ${loop.join(" -> ")}`);
  if (errors.length) return { errors };

  const sorted = [...topics].sort((a, b) => a.path - b.path || a.id.localeCompare(b.id));
  const checks = new Map(topics.flatMap((t) => t.checks.map((c) => [c.id, { ...c, topicId: t.id }] as const)));
  const questions = new Map(topics.flatMap((t) => t.questions.map((q) => [q.id, q] as const)));
  const templates = new Map(topics.flatMap((t) => t.templates.map((x) => [x.id, { ...x, topicId: t.id }] as const)));
  return {
    errors,
    map: {
      topics: sorted,
      topic: (k) => byId.get(k),
      check: (k) => checks.get(k),
      question: (k) => questions.get(k),
      template: (k) => templates.get(k),
      coming: outline ? outline.topics.filter((t) => !byId.has(t.id)) : [],
    },
  };
}

function pieceProblems(c: z.infer<typeof caseSchema>): string[] {
  const p = c.piece;
  if (!p) return [];
  const problems: string[] = [];
  if (p.published > c.asOf) problems.push(`Case "${c.id}" studies a piece published ${p.published}, after its as-of date ${c.asOf}`);
  if (p.from === "library" && !p.librarySource) problems.push(`Case "${c.id}" reads its piece from the Library, so it needs librarySource`);
  if (p.from === "paste" && p.librarySource) problems.push(`Case "${c.id}" has a pasted piece, which is never in the Library, so it cannot name a librarySource`);
  return problems;
}

/** Connections before their Topic titles are looked up (done once every Topic is read). */
const unresolved = (file: z.infer<typeof topicSchema>): Connection[] => (file.connections ?? []).map((c) => ({ ...c, titles: [] }));

/** A Connection's or Insight's text may not hold a figure: numbers come only from Case Data and the calculators. */
const FIGURE = /[0-9%$€£₹]/;

/** Checks each Connection against the known Topic titles, and fills in the titles of the Topics it links to. */
function connectionProblems(t: Topic, known: Map<string, string>): string[] {
  const problems: string[] = [];
  t.connections.forEach((c, i) => {
    const n = i + 1;
    if (FIGURE.test(c.text)) problems.push(`Topic "${t.id}" Connection ${n} contains a figure; Connections are written in words`);
    for (const target of c.topics) {
      if (target === t.id) problems.push(`Topic "${t.id}" Connection ${n} links to the Topic itself`);
      else if (!known.has(target)) problems.push(`Topic "${t.id}" Connection ${n} links to "${target}", which is not in the outline`);
    }
    c.titles = c.topics.map((x) => known.get(x) ?? x);
  });
  return problems;
}

/** Fills in Stage, place and prerequisites. Returns a problem message when the file and outline disagree. */
function resolveTopic(file: z.infer<typeof topicSchema>, outline: Outline | undefined): Topic | string {
  if (!outline) {
    if (file.stage === undefined || file.path === undefined) return "stage and path are required";
    return { ...file, connections: unresolved(file), stage: file.stage, path: file.path, prerequisites: file.prerequisites ?? [] };
  }
  const planned = outline.topics.find((t) => t.id === file.id);
  if (!planned) return `Topic "${file.id}" is not in the outline`;
  if (file.stage !== undefined || file.path !== undefined || file.prerequisites !== undefined) {
    return `stage, path and prerequisites belong in the outline, not in the Topic file`;
  }
  return { ...file, connections: unresolved(file), stage: planned.stage, subject: planned.subject, path: planned.path, prerequisites: planned.prerequisites };
}

/** A Case Data reference, "caseId/datasetId", written as a string in Widget code. */
const CASE_DATA_REFERENCE = /"([a-z0-9-]+)\/([a-z0-9-]+)"/g;

/** Case Data references in a Topic Widget's code that do not belong to the Topic's own Cases and their datasets. */
function widgetReferenceProblems(t: Pick<Topic, "id" | "cases">, code: string, where: string): string[] {
  return [...code.matchAll(CASE_DATA_REFERENCE)].flatMap(([, caseId, datasetId]) => {
    if (caseId === REFERENCE_CASE) {
      return REFERENCE_DATASET_IDS.includes(datasetId) ? [] : [`${where} reads "${caseId}/${datasetId}", but there is no reference dataset "${datasetId}"`];
    }
    const c = t.cases.find((x) => x.id === caseId);
    if (!c) return [`${where} reads "${caseId}/${datasetId}", but "${caseId}" is not one of the Topic's Cases`];
    return c.data.includes(datasetId) ? [] : [`${where} reads "${caseId}/${datasetId}", but Case "${caseId}" does not list dataset "${datasetId}"`];
  });
}

/** The explore Widget names one of the Topic's written-ahead Widgets, whose code the written-ahead rules check. */
function exploreWidgetProblems(t: Pick<Topic, "id" | "explore" | "widgets">): string[] {
  const id = t.explore?.widget;
  if (!id || t.widgets.some((w) => w.id === id)) return [];
  return [`Topic "${t.id}" explore Widget "${id}" is not one of the Topic's written-ahead Widgets (under widgets:)`];
}

/** A reveal Widget reads one of the Topic's own Cases and a dataset that Case lists. */
function revealWidgetProblems(t: Topic): string[] {
  const r = t.revealWidget;
  if (!r) return [];
  const c = t.cases.find((x) => x.id === r.case);
  if (!c) return [`Topic "${t.id}" reveal Widget reads Case "${r.case}", which is not one of the Topic's Cases`];
  return c.data.includes(r.dataset) ? [] : [`Topic "${t.id}" reveal Widget reads dataset "${r.dataset}", which Case "${r.case}" does not list`];
}

/** Problems in a Topic's written-ahead Widgets that the file alone shows; whether each draws is the course check's job. */
function writtenAheadProblems(t: Topic): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const titles = new Set<string>();
  for (const w of t.widgets) {
    const where = `Topic "${t.id}" written-ahead Widget "${w.id}"`;
    if (ids.has(w.id)) problems.push(`${where} repeats its id`);
    ids.add(w.id);
    const title = widgetCodeTitle(w.code);
    if (!title) problems.push(`${where} has no root = Widget("Title", [...]) line`);
    else if (titles.has(title)) problems.push(`${where} repeats the title "${title}"`);
    if (title) titles.add(title);
    problems.push(...widgetReferenceProblems(t, w.code, where));
    for (const name of w.rateChange ? [w.rateChange.old, w.rateChange.new] : []) {
      if (!new RegExp(`^\\${name} = `, "m").test(w.code)) problems.push(`${where} works out a rate change from ${name}, which its code does not declare`);
    }
    const task = w.revealTask;
    if (!task) continue;
    const c = t.cases.find((x) => x.id === task.case);
    if (!c) problems.push(`${where} reads its reveal task from "${task.case}", which is not one of the Topic's Cases`);
    else if (!c.data.includes(task.dataset)) problems.push(`${where} reads its reveal task from dataset "${task.dataset}", which Case "${task.case}" does not list`);
    if ((w.code.match(/GuidedTasks\(\[/g) ?? []).length !== 1) problems.push(`${where} has a reveal task, so it needs exactly one GuidedTasks([...]) for it to join`);
    if (task.quick && !w.code.includes(`Slider("${task.quick.slider}",`)) problems.push(`${where} has a reveal quick button for slider "${task.quick.slider}", which it does not have`);
  }
  return problems;
}

/** An Insight is written in words too: a figure would hand the Learner a number to look for. */
function insightProblems(t: Topic): string[] {
  const problems: string[] = [];
  if (t.insight && !t.explore) problems.push(`Topic "${t.id}" has an insight but no explore`);
  if (t.explore && !t.insight) problems.push(`Topic "${t.id}" has explore but no insight`);
  if (t.explore && !t.checks.some((c) => c.id === t.explore!.before)) {
    problems.push(`Topic "${t.id}" explores before Check "${t.explore.before}", which it does not have`);
  }
  problems.push(...exploreWidgetProblems(t));
  if (t.insight) {
    const { question, written, foundWhen, hints } = t.insight;
    const fields: [string, string][] = [["question", question], ["written", written], ["foundWhen", foundWhen], ...hints.map((h, i): [string, string] => [`hints.${i}`, h])];
    for (const [field, text] of fields) {
      if (FIGURE.test(text)) problems.push(`Topic "${t.id}" has a figure in insight.${field}; write the Insight in words`);
    }
  }
  return problems;
}

/** The ID prefix of a Question Bank question. Bank questions live in the database, so the file cannot hold them. */
export const BANK_PREFIX = "bank:";
export const isBankId = (questionId: string) => questionId.startsWith(BANK_PREFIX);

function quizProblems(t: Topic): string[] {
  const problems: string[] = [];
  for (const q of t.questions) {
    const choiceIds = q.choices.map((c) => c.id);
    if (new Set(choiceIds).size !== choiceIds.length) problems.push(`Question "${q.id}" repeats a choice ID`);
    if (!choiceIds.includes(q.answer)) problems.push(`Question "${q.id}" has answer "${q.answer}", which is not one of its choices`);
  }
  const known = new Set(t.questions.map((q) => q.id));
  for (const c of t.checks) {
    if (c.kind !== "quiz") continue;
    for (const q of c.questions) if (!isBankId(q) && !known.has(q)) problems.push(`Check "${c.id}" uses question "${q}", which Topic "${t.id}" does not have`);
    if (new Set(c.questions).size !== c.questions.length) problems.push(`Check "${c.id}" lists a question twice`);
    const shown = c.perAttempt ?? c.passRule.correct;
    // A template draws new numbers every attempt, so it counts as an unlimited pool.
    if (c.templates.length === 0 && shown > c.questions.length) problems.push(`Check "${c.id}" shows ${shown} questions per attempt but lists only ${c.questions.length}`);
    if (c.passRule.correct > shown) problems.push(`Check "${c.id}" needs ${c.passRule.correct} correct but shows only ${shown} per attempt`);
  }
  return problems;
}

/** Depth-first search for a cycle through prerequisites. */
function findLoop(topics: Topic[], byId: Map<string, Topic>): string[] | undefined {
  const done = new Set<string>();
  const visit = (t: Topic, trail: string[]): string[] | undefined => {
    if (trail.includes(t.id)) return [...trail.slice(trail.indexOf(t.id)), t.id];
    if (done.has(t.id)) return undefined;
    for (const p of t.prerequisites) {
      const next = byId.get(p);
      const loop = next && visit(next, [...trail, t.id]);
      if (loop) return loop;
    }
    done.add(t.id);
    return undefined;
  };
  for (const t of topics) {
    const loop = visit(t, []);
    if (loop) return loop;
  }
  return undefined;
}

/** Reads every Topic file in `course/topics`. Paths stay literal so Next traces only that folder. */
export function readTopicFiles(): TopicFile[] {
  return readdirSync(join(process.cwd(), "course", "topics"))
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(process.cwd(), "course", "topics", name), "utf8") }));
}

/** Reads the outline of every planned Topic. */
export function readOutlineText(): string {
  return readFileSync(join(process.cwd(), "course", "outline.yaml"), "utf8");
}

let cached: CourseMap | undefined;

/** Loads the real Course Map from `course/topics` and `course/outline.yaml`, throwing if either is invalid. */
export function loadCourseMap(): CourseMap {
  if (cached) return cached;
  const planned = parseOutline(readOutlineText());
  if (!planned.outline) throw new Error(`Invalid Course Map outline:\n${planned.errors.join("\n")}`);
  const { map, errors } = parseCourseMap(readTopicFiles(), planned.outline);
  if (!map) throw new Error(`Invalid Course Map:\n${errors.join("\n")}`);
  cached = map;
  return map;
}
