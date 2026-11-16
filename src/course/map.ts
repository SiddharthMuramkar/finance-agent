import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { REFERENCE_CASE, REFERENCE_DATASET_IDS } from "../case-data/reference.ts";
import { FORMULA_IDS } from "../finance/formula-ids.ts";
import { markerProblems } from "../finance/formula-markers.ts";
import { impliedPremium, impliedPremiumBlock } from "../finance/implied-erp.ts";
import { matchesPublished, valuationBlock, valueCase, type Levers } from "../finance/valuation-case.ts";
import { isElective, parseOutline, STAGES, type Outline, type OutlineTopic, type Subject } from "./outline.ts";
import { textsIn } from "./topic-texts.ts";
import { guidedTaskTexts, widgetCodeTitle } from "./written-ahead.ts";
import { MISTAKE_FNS } from "../teaching/mistakes.ts";
import { ANSWER_FNS } from "../teaching/quantities.ts";
import { instantiateJudgement } from "../teaching/judgement.ts";
import type { FixedItem, QuestionTemplate, SignRule, Unit } from "../teaching/index.ts";

// This module imports only packages (no "@/" paths), so `scripts/check-course.mjs`
// can run it directly with Node's type stripping.

const id = z.string().regex(/^[a-z0-9-]+$/, "IDs use lower case letters, digits and hyphens");

// ——— The teaching a converted Topic's file holds (spec #229, ADR 0001) ———
// Every field is optional, so a Topic file written before it loads unchanged. A Topic with Skills is converted.

const UNITS = ["points", "bp", "percent", "inr", "years", "ratio", "number"] as const satisfies readonly Unit[];
const SIGN_RULES = ["magnitude", "signed", "either"] as const satisfies readonly SignRule[];

/** A named engine function: the error names the bad one and every allowed name. */
const engineName = <T extends string>(what: string, names: readonly [T, ...T[]]) =>
  z.enum(names as [T, ...T[]], { error: (issue) => `${what} "${String(issue.input)}" is not one of ${names.join(", ")}` });

const answerFn = engineName("answer function", ANSWER_FNS);
const mistakeFn = engineName("mistake function", MISTAKE_FNS);

/**
 * The Workbench recipes (spec B3, B4; ADR 0010), by the ids the four workstreams share: each is a view over the valuation
 * engine with archetype "workbench" in src/widgets/recipes. Listed here so plain Node can check a Topic file names one.
 */
export const WORKBENCH_RECIPES = ["value_levers", "cash_waterfall", "wacc_stack", "terminal_seesaw", "value_bridge", "multiple_decoder"] as const;
export type WorkbenchRecipe = (typeof WORKBENCH_RECIPES)[number];

/** The currency of a Topic's everyday examples: cards, Quick tries, templates, Skills and Widget presets. Case text keeps its own. */
const EXAMPLE_CURRENCIES = ["INR", "USD"] as const;
export type ExampleCurrency = (typeof EXAMPLE_CURRENCIES)[number];

/** One idea a Check tests: its rule in plain words, and at most one analogy, reused. */
const skillSchema = z.object({ id, rule: z.string().trim().min(1), analogy: z.string().trim().min(1).optional() });
export type Skill = z.infer<typeof skillSchema>;

/**
 * A term the Topic introduces, and what it means in plain words. E3 adds how pros say it (`pro`), an everyday
 * example, its emoji name and where it showed up in the story: the making of a Lingo card, all optional so a
 * term written before them still loads.
 */
const termSchema = z.object({
  term: z.string().trim().min(1),
  means: z.string().trim().min(1),
  pro: z.string().trim().min(1).optional(),
  example: z.string().trim().min(1).optional(),
  emoji: z.string().trim().min(1).optional(),
  inStory: z.string().trim().min(1).optional(),
});
export type Term = z.infer<typeof termSchema>;

/**
 * A Story scene's inputs as a Topic file holds them (E3): the cast and beats of the `story_scene` recipe. The
 * shape is kept beside the Topic file so this module stays loadable by plain Node; the recipe itself holds the
 * word caps and story checks, and src/course/scenes.ts builds it under vitest.
 */
const storySceneInputsSchema = z
  .object({
    cast: z
      .array(z.object({ id, emoji: z.string().min(1), name: z.string().trim().min(1), role: z.string().trim().min(1).optional() }).strict())
      .min(1)
      .max(4),
    beats: z
      .array(z.object({ who: z.string().trim().min(1), says: z.string().trim().min(1), emoji: z.string().min(1).optional() }).strict())
      .min(2)
      .max(5),
    caption: z.string().trim().min(1).optional(),
    date: z.string().min(1).optional(),
  })
  .strict();
export type StorySceneInputs = z.infer<typeof storySceneInputsSchema>;

/** The Topic's one Running example, and its numbers: "A savings rate goes from 4% to 5%.", [4, 5]. Its `scene` (E3) is the same example as a Story scene. */
const runningExampleSchema = z.object({ text: z.string().trim().min(1), numbers: z.array(z.number()).min(1), scene: storySceneInputsSchema.optional() });
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

// ——— Judgement questions (spec 2026-11-12, D1 to D5) ———

/**
 * The six judgement kinds, each a tap among two to four choices (D1). Code works out the right choice of a computed kind
 * from the Case's valuation block (D2), so the file holds no answer for it; a written kind keeps its choices and answer
 * in the file like any other question.
 */
export const COMPUTED_KINDS = ["which_lever", "price_assumes", "predict"] as const;
export const WRITTEN_KINDS = ["direction", "cannot_hold", "price_or_value"] as const;
export const JUDGEMENT_KINDS = [...COMPUTED_KINDS, ...WRITTEN_KINDS] as const;
export type ComputedKind = (typeof COMPUTED_KINDS)[number];
export type WrittenKind = (typeof WRITTEN_KINDS)[number];
export type JudgementKind = (typeof JUDGEMENT_KINDS)[number];

/** The most choices a judgement question shows (D1), and the most changes a computed one may list, the rest a pool for Reviews (D5). */
export const MAX_JUDGEMENT_CHOICES = 4;
export const MAX_COMPUTED_CHANGES = 8;

/**
 * Value levers settings (spec B3), as `applyLevers` in src/finance/valuation-case.ts takes them: percents like the valuation
 * block, revenue in the block's unit. A lever left out keeps the Case's own figure.
 */
const leversSchema = z
  .object({
    revenueYear10: z.number().positive().optional(),
    marginTarget: z.number().optional(),
    salesToCapital: z.number().positive().optional(),
    costOfCapitalGrowing: z.number().optional(),
    failureChance: z.number().min(0).max(100).optional(),
    // The Terminal seesaw's and Value bridge's levers (spec B4), so Spine Topics 8 and 9 can ask computed questions on them.
    growthAfter: z.number().optional(),
    costOfCapitalAfter: z.number().optional(),
    cash: z.number().min(0).optional(),
    debt: z.number().min(0).optional(),
    options: z.number().min(0).optional(),
  })
  .strict();
const asLevers = (l: z.output<typeof leversSchema>) => l satisfies Levers;
void asLevers;

/** One change from the preset (which lever, predict), or one whole story (what the price assumes): the words on its choice, and the levers it sets. */
const leverChangeSchema = z
  .object({
    id,
    label: z.string().trim().min(1),
    levers: leversSchema.refine((l) => Object.keys(l).length > 0, "a change sets at least one lever"),
  })
  .strict();

/**
 * A band a predict question's result can land in, as a share of the value at the preset: 1 is unchanged, 0.5 is half,
 * 0 is nothing left. The result is in the band when it is at least `min` and below `max`; one of the two may be left out.
 */
const bandSchema = z
  .object({ id, label: z.string().trim().min(1), min: z.number().optional(), max: z.number().optional() })
  .strict()
  .refine((b) => b.min !== undefined || b.max !== undefined, "a band needs min, max or both")
  .refine((b) => b.min === undefined || b.max === undefined || b.min < b.max, "a band's min must be below its max");

/**
 * What code needs to work out a computed question (D2): the Case whose valuation block it values, where the levers start,
 * and the changes or stories its choices are made of. Which lever and what the price assumes show `shown` of the changes
 * (all of them, up to four, when left out) and draw a fresh set for each Review from the rest (D5). Predict shows one
 * change and its bands as the choices; the Learner's tap is kept and shown beside the result, never marked wrong.
 */
const computedSchema = z
  .object({
    /** The id of one of this Topic's Cases; it must have a valuation block. */
    case: id,
    /** The levers the question starts from; the Case's own story when left out. */
    preset: leversSchema.optional(),
    changes: z.array(leverChangeSchema).min(1).max(MAX_COMPUTED_CHANGES),
    shown: z.number().int().min(2).max(MAX_JUDGEMENT_CHOICES).optional(),
    bands: z.array(bandSchema).min(2).max(MAX_JUDGEMENT_CHOICES).optional(),
  })
  .strict();

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
const fixedQuickTrySchema = z
  .object({ ...fixedItemShape, halfDone: z.string().trim().min(1).optional() })
  .strict()
  .transform((q): FixedQuickTry => q);

/** The judgement kinds a Quick try may compute: a predict tap is never marked, so it is no Quick try (D1). */
export const COMPUTED_TRY_KINDS = ["which_lever", "price_assumes"] as const;
export type ComputedTry = { kind: (typeof COMPUTED_TRY_KINDS)[number] } & z.output<typeof computedSchema>;

/**
 * A computed Quick try (D1, D2): a which-lever or what-the-price-assumes question written as words and changes, like a
 * computed question. It loads as a fixed choice try whose choices are its shown changes; once every Topic file is read
 * (a Case may borrow its block, `valuationFrom`), parseCourseMap values them from the Case and fills in the right choice
 * and a mix-up fix for each wrong one (src/teaching/judgement.ts). From then on code shows and marks it like any fixed try.
 */
const computedQuickTrySchema = z
  .object({ id, skill: id, kind: z.enum(COMPUTED_TRY_KINDS), ask: z.string().trim().min(1), computed: computedSchema })
  .strict()
  .transform((q): FixedQuickTry => ({ id: q.id, skill: q.skill, ask: q.ask, kind: "choice", answer: "", choices: [], computed: { kind: q.kind, ...q.computed } }));

const quickTrySchema = z.union([fixedQuickTrySchema, computedQuickTrySchema, z.object({ template: id, halfDone: z.literal(true).optional() }).strict()]);
/** A fixed try; `computed` marks one whose choices and answer code worked out from a Case (a computed Quick try). */
export type FixedQuickTry = FixedItem & { halfDone?: string; computed?: ComputedTry };
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
  mistakes: z.array(z.object({ tag: mistakeFn, fix: z.string().trim().min(1), label: z.string().trim().min(1).optional() })).default([]),
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
  /**
   * The Check is about the Learner's own work: on the Spine's last Topic, their own valuation of a company (spec C4). A
   * Topic that ends on such a Check offers no skip ahead (A8), since a quiz cannot stand in for it.
   */
  ownWork: z.boolean().optional(),
  ...checkTeaching,
});

/**
 * A computed judgement question: its words and its changes, never its answer or its figures. Code values each change from
 * the Case, so changing the Case's valuation block changes the right choice and the figure on every choice with no edit here.
 */
const computedQuestion = z
  .object({
    id,
    kind: z.enum(COMPUTED_KINDS),
    prompt: z.string().min(1),
    skill: id.optional(),
    computed: computedSchema,
    /** Words shown after the Learner has answered, beside the figures code adds. No figures of its own. */
    explanation: z.string().trim().min(1).optional(),
    answer: z.never({ error: "a computed question's right choice is worked out by code from the Case (spec D2): remove answer" }).optional(),
    choices: z.never({ error: "a computed question's choices are its computed.changes, valued by code (spec D2): remove choices" }).optional(),
  })
  .strict();

/**
 * A Claude-written quiz question. The key (`answer`, `explanation`) stays on the server until the Learner has answered.
 * `kind` is left out for a question that asks what something is, or names a written judgement kind (D1).
 */
const writtenQuestion = z.object({
  id,
  kind: z.enum(WRITTEN_KINDS).optional(),
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

const quizQuestion = z.discriminatedUnion("kind", [computedQuestion, writtenQuestion]);

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
  /** The Case's valuation inputs and their sources (spec B1, C2), which Workbench Widgets and computed questions value. */
  valuation: valuationBlock.optional(),
  /**
   * The id of another Case, in any Topic file, whose own `valuation:` block this Case uses: a Spine Topic reuses a block
   * written once (Amazon's in val-dcf) instead of copying it. parseCourseMap fills in `valuation` from it, so code reads
   * one field either way; the course check fails on an id that names no Case with a block of its own.
   */
  valuationFrom: id.optional(),
  /**
   * For a Case about the whole market rather than one company (Spine Topic 13, spec C4): the index, its cash yield and
   * growth, from which src/finance/implied-erp.ts solves the return the price implies and the premium over the riskfree
   * rate. The course check holds the solved premium to the published one.
   */
  impliedPremium: impliedPremiumBlock.optional(),
  /**
   * The id of another Case whose imported Case Data this Case reads (a Spine Topic reusing Amazon's datasets, imported once
   * under amazon-dcf-2000), so a new Case id needs no import of its own. Only the datasets this Case lists under `data` are
   * read, under this Case's own as-of date and this Topic's reveal; the course check fails unless the named Case lists them.
   */
  dataFrom: id.optional(),
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
  /**
   * The Insight settled by a tap (ADR 0020, narrowing ADR 0001 and keeping ADR 0002): two to four choices in words, one of
   * them `answer`, each wrong one with a one-line fix. Code marks the tap: the right one finds the Insight, a wrong one
   * releases the next hint, as a typed not-yet does. Without it, the Insight is found in the Learner's own words.
   */
  pick: z
    .object({
      choices: z
        .array(z.object({ id, text: z.string().trim().min(1), mistake: z.object({ fix: z.string().trim().min(1) }).optional() }))
        .min(2)
        .max(MAX_JUDGEMENT_CHOICES),
      answer: id,
    })
    .optional(),
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
  /**
   * The Workbench Widget the explore step uses (spec B2, C2), in place of a written-ahead Widget: one of the shared
   * Workbench recipes, bound to one of the Topic's Cases (whose valuation block it reads) and given its own inputs
   * (Value levers' stories and tasks, the cash waterfall's one-year figures). The recipes are code (ADR 0009).
   */
  workbench: z
    .object({
      recipe: engineName("Workbench recipe", WORKBENCH_RECIPES),
      case: id.optional(),
      title: z.string().trim().min(1).optional(),
      inputs: z.record(z.string(), z.unknown()).default({}),
    })
    .strict()
    .optional(),
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

/** One line of what the Learner found, shown in the Notebook and the Topic complete card once `when` holds. `{value}` in `text` is the saved value. */
const foundSchema = z.object({ when: widgetConditionSchema, text: z.string().trim().min(1) });

export type StepSetting = z.infer<typeof stepSettingSchema>;
export type FoundSpec = z.infer<typeof foundSchema>;

/**
 * A written-ahead story Widget for one Teaching Step (E3): a story recipe and the inputs written in the Topic
 * file, built by src/course/scenes.ts and shown by code or the Tutor. `check` limits it to that Check's steps;
 * `title` names it in the Widget panel. At most one Scene sits on each (step, check) pair.
 */
const sceneSchema = z
  .object({
    id,
    step: z.enum(STEP_KEYS),
    check: id.optional(),
    recipe: z.string().trim().min(1),
    title: z.string().trim().min(1).optional(),
    inputs: z.record(z.string(), z.unknown()),
    refs: z.record(z.string(), z.unknown()).optional(),
    facts: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type Scene = z.infer<typeof sceneSchema>;

/** Repeated scene ids, two Scenes on one (step, check) pair, and Checks no Topic has. Whether a recipe exists and builds is scenes.ts's: plain Node cannot load the recipes (the lesson-presets precedent). */
function sceneProblems(topic: { id: string; scenes?: Scene[]; checks: { id: string }[] }): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const pairs = new Set<string>();
  for (const s of topic.scenes ?? []) {
    const where = `Topic "${topic.id}" Scene "${s.id}"`;
    if (ids.has(s.id)) problems.push(`${where} repeats its id`);
    ids.add(s.id);
    if (s.check && !topic.checks.some((c) => c.id === s.check)) problems.push(`${where} names "${s.check}", but the Topic has no Check "${s.check}"`);
    const pair = `${s.step}/${s.check ?? ""}`;
    if (pairs.has(pair)) problems.push(`Topic "${topic.id}" has two Scenes for step ${s.step}${s.check ? ` of Check "${s.check}"` : ""}`);
    pairs.add(pair);
  }
  return problems;
}

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

/**
 * A Primer (spec C3): a two-minute stop inside a Spine Topic that teaches one idea the Topic needs. At most three lines,
 * one of the Topic's Lingo terms, one Quick try written in full, optionally a Widget preset, and the Elective that teaches
 * the idea in depth. Code shows it at the Teaching Step `at` names; the Learner can press "I know this" to pass over it.
 */
const primerSchema = z
  .object({
    id,
    title: z.string().trim().min(1),
    lines: z.array(z.string().trim().min(1)).min(1).max(3),
    /** The Lingo term it teaches: the `term` of one of the Topic's terms. */
    term: z.string().trim().min(1),
    quickTry: fixedQuickTrySchema,
    widget: widgetPresetSchema.optional(),
    /** The Elective (a Foundation Topic in the outline) that teaches the idea in depth. */
    elective: id,
    /** The Teaching Step where code shows it, such as concept or explore. Never inside a Check. */
    at: z.enum(STEP_KEYS),
  })
  .strict();
export type Primer = z.infer<typeof primerSchema>;

/** The most Primers a Spine Topic holds (spec C2), and the most words in its "why it matters" line (A6). */
export const MAX_PRIMERS = 2;
export const WHY_MAX_WORDS = 30;

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
  /**
   * Why it matters (spec A6): one line, at most thirty words, that links the Topic to valuing a company. The Tutor says it
   * in its own words when the Learner asks why they are learning this. The course check holds its rules (goal-check.ts).
   */
  why: z.string().trim().min(1).optional(),
  /** How long the Topic takes, in whole minutes (spec C2). A Spine Topic's must agree with its outline entry. */
  minutes: z.number().int().positive().optional(),
  /** The Topic's Primers, at most two (spec C3). */
  primers: z.array(primerSchema).max(MAX_PRIMERS).optional(),
  concept: z.string().min(1),
  /**
   * Go deeper material (spec 2026-11-12 H1): an idea beyond the Topic's Checks that the Tutor may use when the Learner
   * presses Go deeper or asks about it. No Check, Skill or Lingo term tests it, so the Tutor never quizzes it. The one
   * text that may hold a typed formula or a Formula Card marker (spec #68, ADR 0003; the course check skips it).
   */
  goDeeper: z.string().trim().min(1).optional(),
  /** The named formulas this Topic teaches, each shown only as a Formula Card (IDs from the formula registry). */
  formulas: z
    .array(z.string().refine((f) => (FORMULA_IDS as readonly string[]).includes(f), { message: `Unknown formula; the formula registry has: ${FORMULA_IDS.join(", ")}` }))
    .default([]),
  principle: z.string().min(1),
  /**
   * The daily-life line (spec #68): one line tying the Topic's idea to something a beginner meets in daily life. Code
   * shows it at the Principle step and on the Topic complete card, and the Topic Note keeps it. Words only.
   */
  dailyLife: z.string().trim().min(1).optional(),
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
  /** What the Learner found, one line each once their saved Widget state shows it (Notebook, Topic complete card). */
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
  /** Written-ahead story Widgets for its Teaching Steps (E3), built through their recipes in scenes.ts. */
  scenes: z.array(sceneSchema).default([]),
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
  // Formula markers ({{formula:...}}) must name a formula on this Topic's own list and give exactly its inputs. They are
  // read in the texts every Topic had before the teaching fields (topic-texts.ts): Cases, questions, concept, principle,
  // Insight, Connections, conversation Checks and the daily-life line, and in Go deeper.
  for (const { text } of textsIn(topic, ["case", "question", "earlier", "deeper"])) {
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
  terms: Term[];
  cases: ValuedCase[];
  primers?: Primer[];
  questions: z.output<typeof quizQuestion>[];
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
    if ("computed" in q) problems.push(...computedProblems(`Question "${q.id}"`, q, topic.cases));
    else {
      if (q.choices.some((c) => c.id === q.answer && c.mistake)) problems.push(`Question "${q.id}" gives its right choice "${q.answer}" a Known mistake`);
      if (q.kind && q.choices.length > MAX_JUDGEMENT_CHOICES) problems.push(`Question "${q.id}" is a judgement question, so it shows ${MAX_JUDGEMENT_CHOICES} choices at most; it has ${q.choices.length}`);
    }
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
      // A computed try's choices and answer are filled in once its Case's block is known (resolveComputedTries).
      if (q.computed) problems.push(...computedProblems(at, { ...q.computed, prompt: q.ask, computed: q.computed }, topic.cases));
      else problems.push(...fixedTryProblems(at, q));
    });
  }
  problems.push(...primerProblems(topic, skill));
  return problems;
}

/** A fixed Quick try's own soundness: its answer is of its kind, its Known mistakes too, and a choice item answers one of its choices. */
function fixedTryProblems(at: string, q: FixedQuickTry): string[] {
  const problems: string[] = [];
  const answerKind = { number: "number", truth: "boolean", choice: "string" }[q.kind];
  if (typeof q.answer !== answerKind) problems.push(`${at} is a ${q.kind} item, so its answer must be ${{ number: "a number", truth: "true or false", choice: "a choice id" }[q.kind]}`);
  if ((q.mistakes ?? []).some((m) => typeof m.answer !== typeof q.answer)) problems.push(`${at} has a Known mistake of a different kind from its answer`);
  if (q.kind === "choice") {
    if (!q.choices) problems.push(`${at} is a choice item, so it needs choices`);
    else if (!q.choices.some((c) => c.id === q.answer)) problems.push(`${at} answers "${q.answer}", which is not one of its choices`);
  } else if (q.choices) problems.push(`${at} is a ${q.kind} item, so it takes no choices`);
  return problems;
}

/** What the per-file checks know of a Case's valuation: its own block, or the Case it takes one from (resolved across files later). */
type ValuedCase = { id: string; valuation?: unknown; valuationFrom?: string };

/**
 * A computed question values one of the Topic's Cases that has a valuation block, from changes it can tell apart. A Case
 * whose block comes through `valuationFrom` counts: whether that id holds a block is checked once every file is read.
 */
function computedProblems(
  where: string,
  q: { kind: ComputedKind; prompt: string; computed: z.output<typeof computedSchema>; explanation?: string },
  cases: ValuedCase[],
): string[] {
  const problems: string[] = [];
  const { computed } = q;
  const c = cases.find((x) => x.id === computed.case);
  if (!c) problems.push(`${where} values Case "${computed.case}", which is not one of the Topic's Cases`);
  else if (!c.valuation && !c.valuationFrom) problems.push(`${where} values Case "${computed.case}", which has no valuation block`);
  const ids = computed.changes.map((x) => x.id);
  if (new Set(ids).size !== ids.length) problems.push(`${where} repeats a change id`);
  if (q.kind === "predict") {
    if (!computed.bands) problems.push(`${where} is a predict question, so it needs bands for the Learner to choose from`);
    else if (new Set(computed.bands.map((b) => b.id)).size !== computed.bands.length) problems.push(`${where} repeats a band id`);
    if (computed.shown !== undefined) problems.push(`${where} is a predict question, which shows one change at a time, so it takes no shown`);
    // A Review shows another change from the pool (D5), so the prompt must say which one is shown.
    if (computed.changes.length > 1 && !q.prompt.includes("{change}")) problems.push(`${where} is a predict question with ${computed.changes.length} changes, so its prompt names the one shown with {change}`);
  } else {
    if (computed.bands) problems.push(`${where} is a ${q.kind} question, so it takes no bands (only predict does)`);
    if (computed.changes.length < 2) problems.push(`${where} is a ${q.kind} question, so it needs at least two changes to choose between`);
    if (computed.shown !== undefined && computed.shown > computed.changes.length) problems.push(`${where} shows ${computed.shown} changes but lists only ${computed.changes.length}`);
  }
  if (q.explanation && FIGURE.test(q.explanation)) problems.push(`${where} types a figure in its explanation; code adds the figures to a computed question (spec D2)`);
  return problems;
}

/** A Primer teaches one of the Topic's terms, with a sound Quick try on one of its Skills and, if any, a preset of its own Widget. */
function primerProblems(topic: { terms: Term[]; widgets: { id: string }[]; primers?: Primer[] }, skill: (where: string, sid: string) => void): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const p of topic.primers ?? []) {
    const where = `Primer "${p.id}"`;
    if (ids.has(p.id)) problems.push(`${where} repeats its id`);
    ids.add(p.id);
    if (!topic.terms.some((t) => t.term === p.term)) problems.push(`${where} teaches the term "${p.term}", which is not one of the Topic's terms`);
    if (p.at === "check") problems.push(`${where} is shown at the check step; a Primer comes before or after a Check, never inside one`);
    skill(`${where} Quick try "${p.quickTry.id}"`, p.quickTry.skill);
    problems.push(...fixedTryProblems(`${where} Quick try "${p.quickTry.id}"`, p.quickTry));
    const preset = p.widget;
    if (preset && "widget" in preset && !topic.widgets.some((w) => w.id === preset.widget)) {
      problems.push(`${where} opens Widget "${preset.widget}", which is not one of the Topic's written-ahead Widgets`);
    }
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
  /** Place in the outline; lower comes first. The default path is worked out from it and the Stage (navigator.ts defaultPath). */
  path: number;
  prerequisites: string[];
  /** A Spine Topic's number, 1 to SPINE_LENGTH (from the outline, ADR 0020); none off the Spine. */
  spine?: number;
  /** The Topics a Spine Topic is built from (from the outline). Not prerequisites. */
  drawsOn?: string[];
};
export type Check = Topic["checks"][number];
export type QuizCheck = Extract<Check, { kind: "quiz" }>;
/** Any question a Topic file holds: written (a choice list and its answer) or computed from a Case (spec D2). */
export type QuizQuestion = Topic["questions"][number];
export type ComputedQuestion = Extract<QuizQuestion, { kind: ComputedKind }>;
export type WrittenQuestion = Exclude<QuizQuestion, ComputedQuestion>;
export type ConversationCheck = Extract<Check, { kind: "conversation" }>;

/** Whether code works out the question's choices and right answer from a Case's valuation block (spec D2). */
export const isComputedQuestion = (q: QuizQuestion): q is ComputedQuestion => "computed" in q;

/** A Topic's written questions, in file order: those whose choices and answer the file holds. */
export const writtenQuestions = (topic: Pick<Topic, "questions">): WrittenQuestion[] => topic.questions.filter((q): q is WrittenQuestion => !isComputedQuestion(q));

export { isConverted, testedSkills } from "./tested-skills.ts";

export type CourseMap = {
  /** Topics in outline order (the default path is navigator.ts defaultPath). */
  topics: Topic[];
  topic(id: string): Topic | undefined;
  check(id: string): (Check & { topicId: string }) | undefined;
  /**
   * A written quiz question by ID, from whichever Topic holds it. A computed question (spec D2) is not found here: its
   * choices and answer exist only once code has valued them from the Case, which `computedKeyedQuestion` in quiz.ts does
   * (and `questionLookup` in src/bank/lookup.ts, which every quiz and Review path reads questions through).
   */
  question(id: string): WrittenQuestion | undefined;
  /** A question template by ID, from whichever Topic holds it. */
  template(id: string): (TopicTemplate & { topicId: string }) | undefined;
  /** Topics in the outline that are not written yet, in outline order. Not teachable, shown as coming. */
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
      const caseErrors = result.data.cases.flatMap(caseProblems);
      if (caseErrors.length) {
        errors.push(...caseErrors.map((e) => `${file.name}: ${e}`));
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

  errors.push(...resolveValuationFrom(topics), ...dataFromProblems(topics));
  resolveComputedTries(topics);

  const seen = new Set<string>();
  for (const t of topics) {
    const fixedTries = [...t.checks.flatMap((c) => c.quickTries.flatMap((q) => ("id" in q ? [q.id] : []))), ...(t.primers ?? []).map((p) => p.quickTry.id)];
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
    errors.push(...connectionProblems(t, titles), ...primerElectiveProblems(t, outline ? outline.topics : topics), ...valuationProblems(t));
    if (t.checks.length === 0) errors.push(`Topic "${t.id}" has no Checks`);
    errors.push(...quizProblems(t), ...insightProblems(t), ...writtenAheadProblems(t), ...revealWidgetProblems(t), ...sceneProblems(t));
    for (const p of t.prerequisites) {
      if (!byId.has(p)) errors.push(`Topic "${t.id}" requires "${p}", which is not on the Course Map`);
    }
  }
  const loop = findLoop(topics, byId);
  if (loop) errors.push(`Prerequisite loop: ${loop.join(" -> ")}`);
  if (errors.length) return { errors };

  const sorted = [...topics].sort((a, b) => a.path - b.path || a.id.localeCompare(b.id));
  const checks = new Map(topics.flatMap((t) => t.checks.map((c) => [c.id, { ...c, topicId: t.id }] as const)));
  const questions = new Map(topics.flatMap((t) => t.questions.flatMap((q) => (isComputedQuestion(q) ? [] : [[q.id, q] as const]))));
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

/** A Case's own soundness: one source for its valuation block, and a studied piece that fits its as-of date. */
function caseProblems(c: z.infer<typeof caseSchema>): string[] {
  const p = c.piece;
  const problems: string[] = [];
  if (c.valuation && c.valuationFrom) problems.push(`Case "${c.id}" has a valuation block and takes one from "${c.valuationFrom}"; give one`);
  if (c.impliedPremium) {
    // Within a hundredth of a percentage point of what the source printed.
    const solved = impliedPremium(c.impliedPremium).premium * 100;
    if (Math.abs(solved - c.impliedPremium.published.premiumPercent) > 0.01) {
      problems.push(`Case "${c.id}" publishes an implied premium of ${c.impliedPremium.published.premiumPercent}%, but its inputs give ${solved.toFixed(2)}%`);
    }
  }
  if (!p) return problems;
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
  if (file.minutes !== undefined && planned.minutes !== undefined && file.minutes !== planned.minutes) {
    return `the Topic file says it takes ${file.minutes} minutes and the outline says ${planned.minutes}; give one length`;
  }
  return {
    ...file,
    connections: unresolved(file),
    stage: planned.stage,
    subject: planned.subject,
    path: planned.path,
    prerequisites: planned.prerequisites,
    ...(file.minutes === undefined && planned.minutes !== undefined ? { minutes: planned.minutes } : {}),
    ...(planned.spine !== undefined ? { spine: planned.spine, drawsOn: planned.drawsOn ?? [] } : {}),
  };
}

/**
 * Fills in the valuation block of every Case that names another Case under `valuationFrom`, from that Case's own block, so
 * Widgets and computed questions read `valuation` either way. The named Case must hold a block itself: a chain of
 * borrowed blocks would hide where the figures and their sources are written.
 */
function resolveValuationFrom(topics: Topic[]): string[] {
  const all = new Map(topics.flatMap((t) => t.cases.map((c) => [c.id, c] as const)));
  const problems: string[] = [];
  for (const t of topics) {
    for (const c of t.cases) {
      if (!c.valuationFrom) continue;
      const from = all.get(c.valuationFrom);
      const where = `Topic "${t.id}" Case "${c.id}" takes its valuation from "${c.valuationFrom}"`;
      if (!from) problems.push(`${where}, which is not a Case on the Course Map`);
      else if (!from.valuation || from.valuationFrom) problems.push(`${where}, which has no valuation block of its own`);
      else c.valuation = from.valuation;
    }
  }
  return problems;
}

/**
 * A Case that reads another Case's Case Data (`dataFrom`) names a Case on the map that holds the data itself, and lists only
 * datasets that Case lists: the data is imported once, under the named Case's id (src/case-data/case-data.ts).
 */
function dataFromProblems(topics: Topic[]): string[] {
  const all = new Map(topics.flatMap((t) => t.cases.map((c) => [c.id, c] as const)));
  return topics.flatMap((t) =>
    t.cases.flatMap((c) => {
      if (!c.dataFrom) return [];
      const where = `Topic "${t.id}" Case "${c.id}" reads its Case Data from "${c.dataFrom}"`;
      const from = all.get(c.dataFrom);
      if (!from) return [`${where}, which is not a Case on the Course Map`];
      if (from.dataFrom) return [`${where}, which reads its own from "${from.dataFrom}"; name the Case that holds the data`];
      if (!c.data.length) return [`${where} but lists no datasets under data`];
      return c.data.filter((d) => !from.data.includes(d)).map((d) => `${where}, which does not list dataset "${d}"`);
    }),
  );
}

/**
 * Fills in each computed Quick try's choices, right choice and mix-up fixes from its Case's valuation block (D2, D3), once
 * borrowed blocks are in. A try the engine cannot serve (no story near the price, a change it cannot value) keeps no
 * choices, so code never shows it, and lesson lint L14 names the reason.
 */
function resolveComputedTries(topics: Topic[]): void {
  for (const t of topics) {
    for (const c of t.checks) {
      for (const q of c.quickTries) {
        if (!("id" in q) || !q.computed) continue;
        const block = t.cases.find((x) => x.id === q.computed!.case)?.valuation;
        const served = block ? instantiateJudgement({ id: q.id, kind: q.computed.kind, prompt: q.ask, computed: q.computed }, block) : null;
        if (!served?.ok) continue;
        q.answer = served.instance.answer;
        q.choices = served.instance.choices.map((x) => ({ id: x.id, text: x.text, ...(x.mistake && { mistake: x.mistake }) }));
      }
    }
  }
}

/**
 * A valuation block's `reproduces` says whether the engine comes within 2% of the published value a share; the engine
 * decides it, so a block cannot claim a match it does not have (or hide one it has). A borrowed block is checked once,
 * on the Case that writes it.
 */
function valuationProblems(t: Topic): string[] {
  return t.cases.flatMap((c) => {
    if (!c.valuation || c.valuationFrom || c.valuation.reproduces === matchesPublished(c.valuation)) return [];
    const valued = valueCase(c.valuation);
    const engine = valued.ok ? `the engine gives ${valued.valuePerShare.toFixed(2)} a share` : `the engine cannot value it (${valued.error})`;
    return [`Topic "${t.id}" Case "${c.id}" says reproduces: ${c.valuation.reproduces}, but ${engine} against the published ${c.valuation.published.valuePerShare}`];
  });
}

/**
 * A Primer links to an Elective: a Foundation Topic in the outline, written or coming. Without an outline (as the tests
 * check maps), a written Foundation Topic.
 */
function primerElectiveProblems(t: Topic, known: readonly { id: string; stage: Topic["stage"] }[]): string[] {
  return (t.primers ?? []).flatMap((p) => {
    const elective = known.find((x) => x.id === p.elective);
    if (!elective) return [`Topic "${t.id}" Primer "${p.id}" links to "${p.elective}", which is not in the outline`];
    return isElective(elective) ? [] : [`Topic "${t.id}" Primer "${p.id}" links to "${p.elective}", which is not an Elective (a Foundation Topic)`];
  });
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

/**
 * The explore Widget names one of the Topic's written-ahead Widgets, whose code the written-ahead rules check, or is a
 * Workbench bound to one of the Topic's own Cases; never both, since explore shows one Widget.
 */
function exploreWidgetProblems(t: Pick<Topic, "id" | "explore" | "widgets" | "cases">): string[] {
  const problems: string[] = [];
  const id = t.explore?.widget;
  const bench = t.explore?.workbench;
  if (id && !t.widgets.some((w) => w.id === id)) problems.push(`Topic "${t.id}" explore Widget "${id}" is not one of the Topic's written-ahead Widgets (under widgets:)`);
  if (id && bench) problems.push(`Topic "${t.id}" explore names both a written-ahead Widget and a Workbench; explore shows one Widget`);
  if (bench?.case && !t.cases.some((c) => c.id === bench.case)) problems.push(`Topic "${t.id}" explore Workbench reads Case "${bench.case}", which is not one of the Topic's Cases`);
  return problems;
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
    const pick = t.insight.pick;
    if (pick) {
      const ids = pick.choices.map((c) => c.id);
      if (new Set(ids).size !== ids.length) problems.push(`Topic "${t.id}" insight.pick repeats a choice id`);
      if (!ids.includes(pick.answer)) problems.push(`Topic "${t.id}" insight.pick has answer "${pick.answer}", which is not one of its choices`);
      for (const c of pick.choices) {
        if (c.id !== pick.answer && !c.mistake) problems.push(`Topic "${t.id}" insight.pick choice "${c.id}" is wrong but has no fix; give it mistake.fix`);
      }
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
    if (isComputedQuestion(q)) continue; // its choices are made by code (computedProblems checks what the file holds)
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
