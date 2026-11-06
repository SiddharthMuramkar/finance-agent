import type { Scene, Term, Topic } from "@/course/map";
import type { TeachingStep } from "@/course/navigator";
import { RUNNING_SCENE_TITLE, sceneTitle, storyContextFor } from "@/course/scenes";
import { recipeById } from "@/widgets/recipes";
import type { Built } from "@/widgets/recipes/define";
import { buildStoryRecipe, isStoryRecipeId } from "@/widgets/recipes/set-story";
import { paramNumbers } from "./reply-checks";

/**
 * The Companion Widget picker (spec 2026-11-05, E4a, ADR 0010): every Tutor reply comes with exactly one Widget, and
 * when the Tutor showed none and code opened none for the step, code adds one. Pure: no database, no model. The
 * first rule that gives a Widget wins:
 * 1. scene: the current step's written-ahead scene (`scenes:` matching the step and Check), not yet shown this Session;
 * 2. lingo: a Lingo card for the Topic term that comes first in the reply text (case-insensitive, at word boundaries,
 *    a plural "s" allowed), skipping terms already carded this Session;
 * 3. running_example: the Topic's Running-example scene, which may repeat (ADR 0007);
 * 4. case: the safety net every Topic has, a one-beat timeline of the Case's as-of date and its title.
 * A candidate whose text or numbers include an open quiz's Blocked numbers is skipped (as V5 skips a Widget), and so
 * is one that does not build: code never shows a Widget its recipe refuses.
 */

export type CompanionKind = "scene" | "lingo" | "running_example" | "case";

export type CompanionInput = {
  topic: Topic;
  /** The Learner's step, and the id of the Check it is about (null when none). */
  place: { step: TeachingStep; check: string | null };
  /** The reply the Learner sees. */
  replyText: string;
  /** Scene ids already shown in this Session, and terms already carded (any case). */
  shownThisSession: { scenes: readonly string[]; terms: readonly string[] };
  /** An open quiz's Blocked numbers (`blockedNumbersFrom`). */
  blocked: readonly (string | number)[];
};

export type CompanionParams = { title: string; inputs: Record<string, unknown>; refs: Record<string, unknown>; facts: Record<string, unknown> };

/** The picked Widget: its rule, the recipe and params code builds it from, and what it shows (a scene id, a term, the Case id). */
export type Companion = { kind: CompanionKind; recipe: string; params: CompanionParams; key: string };

/** The emoji of a Lingo card whose term names none of its own, and of the Case card. */
const LINGO_EMOJI = "speech-balloon";
const CASE_EMOJI = "spiral-calendar";

const words = (text: string) => text.split(/\s+/).filter(Boolean);

/** The text cut to at most `max` words and `chars` characters, at a word, with an ellipsis when cut. */
function fit(text: string, max: number, chars: number): string {
  const whole = text.trim();
  let out = words(whole).slice(0, max).join(" ");
  while (out.length > chars - 1 && out.includes(" ")) out = out.slice(0, out.lastIndexOf(" "));
  return out.length < whole.length ? `${out.replace(/[,;:.]$/, "")}…` : out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The ways a term is written: "compound annual growth rate (CAGR)" is found as the phrase or as "CAGR". */
function spellings(term: string): string[] {
  const inner = term.match(/\(([^)]+)\)/)?.[1]?.trim();
  const outer = term.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return [outer, ...(inner ? [inner] : [])].filter(Boolean);
}

/** Where a term first appears in the text (case-insensitive, at word boundaries, a plural "s" allowed), or -1. */
export function termAt(text: string, term: string): number {
  let at = -1;
  for (const s of spellings(term)) {
    const m = new RegExp(`(?<![\\p{L}\\p{N}])${escape(s)}s?(?![\\p{L}\\p{N}])`, "iu").exec(text);
    if (m && (at < 0 || m.index < at)) at = m.index;
  }
  return at;
}

/** The reply's plain sentences that use the term (never its ask), shortest-fitting first in reply order. */
function sentencesWith(text: string, term: string): string[] {
  return text
    .split(/(?<=[.!])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s && !s.endsWith("?") && termAt(s, term) >= 0);
}

/**
 * A term's Lingo card inputs: the Topic file's own words first. Where the file gives no `pro` line, the reply's own
 * sentence that uses the term says it like a pro; where it gives no example, the Running example does (the Topic's
 * everyday example), else a second sentence of the reply.
 */
function lingoInputs(topic: Topic, term: Term, replyText: string): Record<string, unknown> {
  const name = term.term.charAt(0).toUpperCase() + term.term.slice(1);
  const said = sentencesWith(replyText, term.term);
  const short = (max: number) => said.filter((s) => words(s).length <= max);
  const pro = term.pro ?? short(14)[0] ?? `"${name}" is the word pros use.`;
  const example = term.example ?? topic.runningExample?.text ?? short(20).find((s) => s !== pro) ?? said.find((s) => s !== pro) ?? term.means;
  return {
    term: fit(name, 10, 60),
    pro: fit(pro, 14, 160),
    means: fit(term.means, 20, 200),
    example: fit(example, 20, 200),
    emoji: term.emoji ?? LINGO_EMOJI,
    ...(term.inStory && { inStory: fit(term.inStory, 20, 200) }),
  };
}

/** The scene for the step: one written for this step and Check, else one for the step with no Check. */
function sceneFor(topic: Topic, place: CompanionInput["place"]): Scene | undefined {
  const atStep = (topic.scenes ?? []).filter((s) => s.step === place.step);
  return atStep.find((s) => s.check && s.check === place.check) ?? atStep.find((s) => !s.check);
}

/** Every number a built candidate shows, in its title and params, read as V5 reads a Widget's (a date's parts count). */
const shownNumbers = (built: Extract<Built, { ok: true }>) => paramNumbers([built.title, built.params]);

export function pickCompanion(input: CompanionInput): Companion | null {
  const { topic, place, replyText } = input;
  const blocked = new Set(input.blocked.flatMap((n) => paramNumbers(n)));
  const story = storyContextFor(topic, place.step);
  const fits = (c: Companion): boolean => {
    const recipe = recipeById(c.recipe);
    if (!recipe) return false;
    const built = isStoryRecipeId(recipe.id) ? buildStoryRecipe(recipe, c.params, story) : recipe.build(c.params);
    return built.ok && !shownNumbers(built).some((n) => blocked.has(n));
  };

  // 1. The step's story scene, once a Session.
  const scene = sceneFor(topic, place);
  if (scene && !input.shownThisSession.scenes.includes(scene.id)) {
    const params = { title: sceneTitle(topic, scene), inputs: scene.inputs, refs: scene.refs ?? {}, facts: scene.facts ?? {} };
    const c: Companion = { kind: "scene", recipe: scene.recipe, key: scene.id, params };
    if (fits(c)) return c;
  }

  // 2. A Lingo card for the first term in the reply that is not carded yet.
  const carded = new Set(input.shownThisSession.terms.map((t) => t.toLowerCase()));
  const named = topic.terms
    .filter((t) => !carded.has(t.term.toLowerCase()))
    .map((t) => ({ t, at: termAt(replyText, t.term) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at);
  for (const { t } of named) {
    const params = { title: fit(`Lingo: ${t.term}`, 12, 90), inputs: lingoInputs(topic, t, replyText), refs: {}, facts: {} };
    const c: Companion = { kind: "lingo", recipe: "lingo_card", key: t.term, params };
    if (fits(c)) return c;
  }

  // 3. The Running-example scene; it may repeat.
  const running = topic.runningExample?.scene;
  if (running) {
    const c: Companion = { kind: "running_example", recipe: "story_scene", key: "running-example", params: { title: RUNNING_SCENE_TITLE(topic), inputs: running, refs: {}, facts: {} } };
    if (fits(c)) return c;
  }

  // 4. The safety net: the earliest Case's date and title on a one-beat timeline. Before the reveal, story recipes are held
  // to the earliest Case asOf (storyContextFor), so a later Case's date would fail the build and leave the reply bare.
  const first = [...topic.cases].sort((a, b) => a.asOf.localeCompare(b.asOf))[0];
  if (first) {
    const beats = [{ date: first.asOf, label: fit(first.title, 8, 80), emoji: CASE_EMOJI }];
    const c: Companion = { kind: "case", recipe: "timeline", key: first.id, params: { title: fit(first.title, 16, 90), inputs: { beats }, refs: {}, facts: {} } };
    if (fits(c)) return c;
  }
  return null;
}
