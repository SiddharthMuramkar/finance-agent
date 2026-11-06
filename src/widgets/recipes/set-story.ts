import { z } from "zod";
import { isEmojiName } from "@/emoji/registry";
import { sumAsk } from "@/teaching/no-sums";
import { defineRecipe, num, program, str, type Built, type Recipe } from "./define";

/**
 * Story recipes (spec 2026-11-05, ticket E3, ADR 0005/0007/0010): the nine wave-3 story parts, opened by the Tutor
 * with show_widget or written ahead in a Topic file as scenes (src/course/scenes.ts). Text goes in `inputs`; the
 * parts draw no Case Data and no typed figure, so `refs` and `facts` stay empty. Every recipe runs `storyChecks`
 * in its inputs' superRefine; code that knows the Topic (show_widget, the scene check) runs them again with a
 * context through `buildStoryRecipe`, which adds the as-of and currency rules a bare recipe cannot know.
 */

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const capped = (maxWords: number, maxChars = 240) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxChars)
    .refine((t) => words(t) <= maxWords, `at most ${maxWords} words`);
const short = (maxChars = 80) => z.string().trim().min(1).max(maxChars);
const id = z.string().regex(/^[a-z0-9-]+$/, "an id of lower case letters, digits and hyphens");
const isoDate = z.iso.date();
const noRefs = z.object({}).strict();
const noFacts = z.object({}).strict();
const BUDGET = { controls: 0, numbers: 0, visuals: 1, words: 25 } as const;

/** Where a story will show: enough to hold it to the Case's as-of date and the Topic's currencies (V7). */
export type StoryContext = {
  /** The Case's as-of date; several are held to the earliest, so nothing dated later leaks before the reveal. */
  asOf?: string | readonly string[];
  /** The Teaching Step; at `reveal` or later, dates may pass the as-of date. Left out, code holds to the date. */
  step?: string;
  exampleCurrency?: string;
  caseCurrencies?: readonly string[];
};

const SUM_KEYS = new Set(["question", "says", "choice", "claim"]);
const DIGIT_KEYS = new Set(["outcomeLine", "words"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REVEALED = new Set(["reveal", "principle"]);

/**
 * The shared story checks (E3), over one recipe's `inputs` (or any piece of them): every emoji name is in the
 * registry, no `question`, `says`, `choice` or `claim` asks for a sum, and a TwoPaths `outcomeLine` or a MoneyJar
 * `words` line carries no digit. With a context: every ISO date is on or before the Case's as-of date unless the
 * step is the reveal or later, and a currency sign matches the Topic's example currency or a Case currency.
 */
export function storyChecks(value: unknown, ctx: StoryContext = {}): string[] {
  const problems: string[] = [];
  const texts: string[] = [];
  const asOfs = ctx.asOf === undefined ? [] : typeof ctx.asOf === "string" ? [ctx.asOf] : [...ctx.asOf].sort();
  const limit = asOfs[0];
  const emojiName = (name: string) => {
    if (!isEmojiName(name)) problems.push(`emoji "${name}" is not in src/emoji/registry.ts`);
  };
  const walk = (v: unknown, key?: string) => {
    if (typeof v === "string") {
      texts.push(v);
      if (key === "emoji" || key === "unit" || key === "outcome") emojiName(v);
      if (key && SUM_KEYS.has(key)) {
        const phrase = sumAsk(v);
        if (phrase) problems.push(`${key} asks for a sum ("${phrase}"): story Widgets ask about the story and the words, never for a sum`);
      }
      if (key && DIGIT_KEYS.has(key) && /\d/.test(v)) problems.push(`${key} must use words, not digits`);
      if (limit && ISO_DATE.test(v) && !(ctx.step && REVEALED.has(ctx.step)) && v > limit) {
        problems.push(`date ${v} is after the Case's as-of date ${limit}, which may not be shown before the reveal step`);
      }
      return;
    }
    if (Array.isArray(v)) for (const item of v) walk(item, key);
    else if (v && typeof v === "object") for (const [k, item] of Object.entries(v)) walk(item, k);
  };
  walk(value);
  if (ctx.exampleCurrency) {
    const allows = (code: string) => ctx.exampleCurrency === code || (ctx.caseCurrencies ?? []).includes(code);
    const all = texts.join("\n");
    if (!allows("USD") && (/\$\s?\d/.test(all) || /\bUSD\b/.test(all))) problems.push(`a dollar ($) amount is not in this Topic's currencies (its examples use ${ctx.exampleCurrency} and no Case gives dollars)`);
    if (!allows("INR") && (/₹\s?\d/.test(all) || /\bINR\b/.test(all) || /\bRs\.?\s?\d/.test(all))) problems.push(`a rupee (₹) amount is not in this Topic's currencies (its examples use ${ctx.exampleCurrency} and no Case gives rupees)`);
  }
  return [...new Set(problems)];
}

/** `storyChecks` as a superRefine, run by every story recipe even with no Topic context. */
const refineStory = (value: unknown, ctx: z.RefinementCtx) => {
  for (const message of storyChecks(value)) ctx.addIssue({ code: "custom", message });
};

/** Builds a story recipe held to a Topic context: as-of dates and currencies first, then the recipe itself. */
export function buildStoryRecipe(recipe: Recipe, raw: unknown, ctx: StoryContext = {}): Built {
  const inputs = raw && typeof raw === "object" ? (raw as { inputs?: unknown }).inputs : undefined;
  const problems = storyChecks(inputs, ctx);
  if (problems.length) return { ok: false, error: problems.join("; ") };
  return recipe.build(raw);
}

/** An OpenUI Lang literal for a parsed story value: strings, numbers, booleans, lists and plain objects. */
function lit(v: unknown): string {
  if (typeof v === "string") return str(v);
  if (typeof v === "number") return num(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return `[${v.map(lit).join(", ")}]`;
  if (v && typeof v === "object") {
    return `{${Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => `${k}: ${lit(x)}`)
      .join(", ")}}`;
  }
  return str("");
}

const storySceneInputs = z
  .object({
    cast: z
      .array(z.object({ id, emoji: short(40), name: capped(3, 60), role: short(80).optional() }).strict())
      .min(1)
      .max(4),
    beats: z
      .array(z.object({ who: short(40), says: capped(16, 160), emoji: short(40).optional() }).strict())
      .min(2)
      .max(5),
    caption: capped(14, 140).optional(),
    date: isoDate.optional(),
  })
  .strict()
  .superRefine(refineStory)
  .superRefine((p, ctx) => {
    const ids = new Set(p.cast.map((c) => c.id));
    if (ids.size !== p.cast.length) ctx.addIssue({ code: "custom", message: "cast ids must be different" });
    for (const beat of p.beats) {
      if (beat.who !== "narrator" && !ids.has(beat.who)) ctx.addIssue({ code: "custom", message: `a beat is told by "${beat.who}", who is not in the cast (or "narrator")` });
    }
  });

export const storyScene = defineRecipe({
  id: "story_scene",
  archetype: "Story",
  summary: "A short story told one beat at a time by a cast of emoji characters (cast 1-4, beats 2-5 of at most 16 words, an optional caption and ISO date stamp). Emoji are registry names such as bank or woman.",
  params: { inputs: storySceneInputs, refs: noRefs, facts: noFacts },
  budget: { ...BUDGET },
  examples: [
    {
      title: "The day before the decision",
      inputs: {
        cast: [
          { id: "fed", emoji: "bank", name: "The central bank", role: "sets the rate" },
          { id: "saver", emoji: "woman", name: "Asha", role: "owns bonds" },
        ],
        beats: [
          { who: "narrator", says: "It is February, and everyone expects calm.", emoji: "calendar" },
          { who: "narrator", says: "Tomorrow, the central bank gives its decision." },
          { who: "saver", says: "If the rate rises, my old bonds lose their shine.", emoji: "worried-face" },
        ],
        caption: "Everyone waits for tomorrow's decision",
        date: "1994-02-03",
      },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs: p }) => program(title, ["scene"], [`scene = StoryScene(${lit(p.cast)}, ${lit(p.beats)}, ${str(p.caption ?? "")}, ${str(p.date ?? "")})`]),
});

export const lingoCard = defineRecipe({
  id: "lingo_card",
  archetype: "Lingo",
  summary: "One piece of lingo: the term, how to say it like a pro (at most 14 words), its plain meaning and an everyday example (at most 20 words each), an emoji name, and optionally the word in the story.",
  params: {
    inputs: z
      .object({ term: short(60), pro: capped(14, 160), means: capped(20, 200), example: capped(20, 200), emoji: short(40), inStory: capped(20, 200).optional() })
      .strict()
      .superRefine(refineStory),
    refs: noRefs,
    facts: noFacts,
  },
  budget: { ...BUDGET },
  examples: [
    {
      title: "A word traders use",
      inputs: {
        term: "Yield",
        pro: "A bond's yield is the income it pays each year.",
        means: "The income you get for lending your money, compared with what you paid.",
        example: "Rent on a flat, compared with the price of the flat.",
        emoji: "house",
        inStory: "In the story, bond prices fell, so the yield rose.",
      },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs: p }) =>
    program(title, ["card"], [`card = LingoCard(${str(p.term)}, ${str(p.pro)}, ${str(p.means)}, ${str(p.example)}, ${str(p.emoji)}, ${str(p.inStory ?? "")})`]),
});

export const timeline = defineRecipe({
  id: "timeline",
  archetype: "History",
  summary: "Moments on a line, oldest first: 2 to 7 beats of an ISO date, a label of at most 8 words and an emoji name. An optional hideAfter ISO date draws later beats locked.",
  params: {
    inputs: z
      .object({
        beats: z
          .array(z.object({ date: isoDate, label: capped(8, 80), emoji: short(40) }).strict())
          // One beat is the Companion Widget's Case card (E4a): the Case's date and title, nothing invented.
          .min(1)
          .max(7),
        hideAfter: isoDate.optional(),
      })
      .strict()
      .superRefine(refineStory),
    refs: noRefs,
    facts: noFacts,
  },
  budget: { ...BUDGET },
  examples: [
    {
      title: "How the story unfolded",
      inputs: {
        beats: [
          { date: "1993-12-01", label: "Calm markets", emoji: "sun" },
          { date: "1994-02-04", label: "The rate goes up", emoji: "bank" },
          { date: "1994-05-09", label: "Prices keep falling", emoji: "chart-decreasing" },
        ],
        hideAfter: "1994-02-03",
      },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs: p }) => program(title, ["line"], [`line = TimelineStrip(${lit(p.beats)}, ${str(p.hideAfter ?? "")})`]),
});

const pathInputs = z
  .object({ emoji: short(40), name: short(60), choice: capped(10, 100), outcome: z.array(short(40)).min(1).max(6), outcomeLine: capped(14, 140) })
  .strict();

export const twoPaths = defineRecipe({
  id: "two_paths",
  archetype: "Story",
  summary: "Two characters who chose differently: a question (at most 20 words) and two paths, each a character, their choice and an outcome shown as 1 to 6 emoji with a line in words, never numbers.",
  params: {
    inputs: z.object({ question: capped(20, 200), left: pathInputs, right: pathInputs }).strict().superRefine(refineStory),
    refs: noRefs,
    facts: noFacts,
  },
  budget: { ...BUDGET },
  examples: [
    {
      title: "Two savers, two choices",
      inputs: {
        question: "What happens to two people who chose differently?",
        left: { emoji: "woman", name: "Asha", choice: "Kept her bonds", outcome: ["chart-decreasing", "worried-face"], outcomeLine: "Her bonds lost value for a while." },
        right: { emoji: "man", name: "Ravi", choice: "Waited with cash", outcome: ["money-bag", "slightly-smiling-face"], outcomeLine: "He bought later at better prices." },
      },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs: p }) => program(title, ["paths"], [`paths = TwoPaths(${str(p.question)}, ${lit(p.left)}, ${lit(p.right)})`]),
});

export const moneyJar = defineRecipe({
  id: "money_jar",
  archetype: "Grow",
  summary: "A jar that fills or drains one object at a time: a label, start and end counts of 0 to 20 objects, the unit emoji name, what each is worth (at most 6 words) and the size in words, no digits.",
  params: {
    inputs: z
      .object({
        label: short(80),
        start: z.number().int().min(0).max(20),
        end: z.number().int().min(0).max(20),
        unit: short(40),
        each: capped(6, 80).optional(),
        words: capped(12, 120),
      })
      .strict()
      .superRefine(refineStory),
    refs: noRefs,
    facts: noFacts,
  },
  budget: { ...BUDGET },
  examples: [
    {
      title: "Asha's savings jar",
      inputs: { label: "Asha's savings", start: 3, end: 6, unit: "coin", each: "each coin is ₹1 lakh", words: "about twice as full" },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs: p }) => program(title, ["jar"], [`jar = MoneyJar(${str(p.label)}, ${num(p.start)}, ${num(p.end)}, ${str(p.unit)}, ${str(p.each ?? "")}, ${str(p.words)})`]),
});

export const whoPaysWhom = defineRecipe({
  id: "who_pays_whom",
  archetype: "Chain",
  summary: "Who pays whom: 2 to 4 actors and 1 to 4 flows between their ids, each what moves in at most 6 words with an emoji name. Each flow draws an arrow and replays on a tap.",
  params: {
    inputs: z
      .object({
        actors: z.array(z.object({ id, emoji: short(40), name: short(60) }).strict()).min(2).max(4),
        flows: z
          .array(z.object({ from: short(40), to: short(40), what: capped(6, 80), emoji: short(40) }).strict())
          .min(1)
          .max(4),
      })
      .strict()
      .superRefine(refineStory)
      .superRefine((p, ctx) => {
        const ids = new Set(p.actors.map((a) => a.id));
        if (ids.size !== p.actors.length) ctx.addIssue({ code: "custom", message: "actor ids must be different" });
        for (const flow of p.flows) {
          if (!ids.has(flow.from) || !ids.has(flow.to)) ctx.addIssue({ code: "custom", message: `a flow names "${!ids.has(flow.from) ? flow.from : flow.to}", who is not one of the actors` });
        }
      }),
    refs: noRefs,
    facts: noFacts,
  },
  budget: { ...BUDGET },
  examples: [
    {
      title: "Who pays whom on a savings account",
      inputs: {
        actors: [
          { id: "bank", emoji: "bank", name: "The bank" },
          { id: "saver", emoji: "woman", name: "The saver" },
        ],
        flows: [
          { from: "saver", to: "bank", what: "a deposit", emoji: "coin" },
          { from: "bank", to: "saver", what: "interest", emoji: "money-bag" },
        ],
      },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs: p }) => program(title, ["flow"], [`flow = WhoPaysWhom(${lit(p.actors)}, ${lit(p.flows)})`]),
});

export const mythOrFact = defineRecipe({
  id: "myth_or_fact",
  archetype: "Check",
  summary: "Myth or fact practice: 2 to 4 cards, each a claim of at most 16 words, whether it is a fact, and why (at most 20 words). Practice only, marked in the browser.",
  params: {
    inputs: z
      .object({
        cards: z
          .array(z.object({ claim: capped(16, 170), isFact: z.boolean(), why: capped(20, 210), emoji: short(40).optional() }).strict())
          .min(2)
          .max(4),
      })
      .strict()
      .superRefine(refineStory),
    refs: noRefs,
    facts: noFacts,
  },
  budget: { ...BUDGET },
  examples: [
    {
      title: "Myth or fact: bonds",
      inputs: {
        cards: [
          { claim: "When interest rates rise, older bonds lose value.", isFact: true, why: "New bonds pay more, so old ones look less attractive.", emoji: "chart-decreasing" },
          { claim: "A bond always pays back more than you lent.", isFact: false, why: "If you sell early, the price can be lower than you paid.", emoji: "dollar-banknote" },
        ],
      },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs: p }) => program(title, ["cards"], [`cards = MythOrFact(${lit(p.cards)})`]),
});

/**
 * A period front page. The recipe itself takes the written-ahead text, because code builds it from a Topic
 * scene; the Tutor may never give that text. `parseHeadlineRef` and `headlineParamsForScene` below are the
 * Tutor's door: show_widget accepts `inputs: {scene}` only and swaps in the scene's own inputs (tools.ts).
 */
export const headline = defineRecipe({
  id: "headline",
  archetype: "History",
  summary: "A period front page, always written ahead in a Topic scene: the paper's name (at most 4 words), an ISO date, a headline (at most 12 words), an optional deck and a source URL.",
  params: {
    inputs: z
      .object({ paper: capped(4, 60), date: isoDate, headline: capped(12, 140), deck: capped(20, 220).optional(), source: z.url() })
      .strict()
      .superRefine(refineStory),
    refs: noRefs,
    facts: noFacts,
  },
  budget: { ...BUDGET },
  examples: [
    {
      title: "The morning rates moved",
      inputs: {
        paper: "The morning paper",
        date: "1994-02-04",
        headline: "Central bank tightens pressure on reserve positions",
        deck: "An imagined front page. No number was announced; traders read one in.",
        source: "https://www.federalreserve.gov/fomc/19940204default.htm",
      },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs: p }) => program(title, ["paper"], [`paper = Headline(${str(p.paper)}, ${str(p.date)}, ${str(p.headline)}, ${str(p.deck ?? "")}, ${str(p.source)})`]),
});

const HEADLINE_REF_ERROR = 'headline takes inputs {scene: "<sceneId>"} only: a front page is written ahead as a Topic scene, never written by the Tutor. Give the id of a headline scene of this Topic.';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The Tutor's headline call: only `inputs: {scene: "<sceneId>"}`. Anything else, above all inline text, is refused. */
export function parseHeadlineRef(raw: unknown): { ok: true; scene: string } | { ok: false; error: string } {
  if (!isRecord(raw) || !isRecord(raw.inputs)) return { ok: false, error: HEADLINE_REF_ERROR };
  const keys = Object.keys(raw.inputs);
  if (keys.length !== 1 || keys[0] !== "scene" || typeof raw.inputs.scene !== "string" || !raw.inputs.scene.trim()) return { ok: false, error: HEADLINE_REF_ERROR };
  return { ok: true, scene: raw.inputs.scene.trim() };
}

/** A Topic scene as far as the headline door needs it: its id, recipe, optional title and the inputs written ahead. */
export type HeadlineSceneLike = { id: string; recipe: string; title?: string; inputs: Record<string, unknown> };

/**
 * Params for the headline recipe, from a Tutor scene reference and the Topic's scenes: the scene's own text, never the
 * Tutor's. Also the scene's id, kept on the shown Widget so a Session shows each scene once (E4a's Companion rule 1).
 */
export function headlineParamsForScene(
  scenes: readonly HeadlineSceneLike[],
  raw: unknown,
): { ok: true; scene: string; params: { title: string; inputs: Record<string, unknown>; refs: Record<string, unknown>; facts: Record<string, unknown> } } | { ok: false; error: string } {
  const ref = parseHeadlineRef(raw);
  if (!ref.ok) return ref;
  const headlines = scenes.filter((s) => s.recipe === "headline");
  const scene = headlines.find((s) => s.id === ref.scene);
  if (!scene) {
    return { ok: false, error: `this Topic has no headline scene "${ref.scene}". Its headline scenes: ${headlines.map((s) => s.id).join(", ") || "none"}.` };
  }
  const given = isRecord(raw) ? raw : {};
  const title = typeof given.title === "string" && given.title.trim() ? given.title : (scene.title ?? "From the front page");
  return {
    ok: true,
    scene: scene.id,
    params: { title, inputs: scene.inputs, refs: isRecord(given.refs) ? given.refs : {}, facts: isRecord(given.facts) ? given.facts : {} },
  };
}

export const choiceCards = defineRecipe({
  id: "choice_cards",
  archetype: "Check",
  summary: "Tap-to-choose cards: a question (at most 25 words), 2 to 4 choices of at most 10 words each (a wrong one may carry a mix-up fix), and the right choice's id. Practice only.",
  params: {
    inputs: z
      .object({
        question: capped(25, 260),
        choices: z
          .array(z.object({ id, text: capped(10, 110), emoji: short(40).optional(), fix: capped(20, 210).optional() }).strict())
          .min(2)
          .max(4),
        answer: short(40),
      })
      .strict()
      .superRefine(refineStory)
      .superRefine((p, ctx) => {
        const ids = new Set(p.choices.map((c) => c.id));
        if (ids.size !== p.choices.length) ctx.addIssue({ code: "custom", message: "choice ids must be different" });
        if (!ids.has(p.answer)) ctx.addIssue({ code: "custom", message: `the answer "${p.answer}" is not one of the choices` });
      }),
    refs: noRefs,
    facts: noFacts,
  },
  budget: { ...BUDGET },
  examples: [
    {
      title: "A bond puzzle",
      inputs: {
        question: "Why did older bonds lose value when the central bank raised rates?",
        choices: [
          { id: "a", text: "New bonds paid more", emoji: "chart-increasing" },
          { id: "b", text: "Nobody wanted any bond", emoji: "worried-face", fix: "People still bought bonds. They wanted the better ones." },
          { id: "c", text: "The bank printed the old ones", emoji: "bank", fix: "Old bonds did not change. The new ones did." },
        ],
        answer: "a",
      },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs: p }) => program(title, ["pick"], [`pick = ChoiceCards(${str(p.question)}, ${lit(p.choices)}, ${str(p.answer)})`]),
});

/** The story recipes, in catalogue order. */
export const SET_STORY: Recipe[] = [storyScene, lingoCard, timeline, twoPaths, moneyJar, whoPaysWhom, mythOrFact, headline, choiceCards];

export const STORY_RECIPE_IDS = SET_STORY.map((r) => r.id);

export const isStoryRecipeId = (recipeId: string) => STORY_RECIPE_IDS.includes(recipeId);
