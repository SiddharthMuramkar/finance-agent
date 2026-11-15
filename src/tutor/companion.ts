import type { Scene, Term, Topic } from "@/course/map";
import type { TeachingStep } from "@/course/navigator";
import { sceneTitle, storyContextFor } from "@/course/scenes";
import { recipeById } from "@/widgets/recipes";
import type { Built } from "@/widgets/recipes/define";
import { buildStoryRecipe, isStoryRecipeId } from "@/widgets/recipes/set-story";
import { paramNumbers } from "./reply-checks";
import { termAt } from "./term-spellings";

export { termAt };

/**
 * The Companion Widget picker (spec 2026-11-12, B6, ADR 0008; amends E4a). A reply changes the Widget only
 * when a better one fits: when the Tutor showed none and code opened none for a step-led reply, code may add one. Pure:
 * no database, no model. The first rule that gives a Widget wins:
 * 1. lingo: only when the Learner asked what a word means (the Choice "What does 'basis point' mean?", G6), a Lingo card
 *    for the Topic term they named, else the first Topic term in the reply (case-insensitive, at word boundaries, a
 *    plural "s" allowed), skipping terms already carded this Session; it answers the question, so it comes first;
 * 2. scene: the current step's own written-ahead scene (`scenes:` matching the step and Check), not yet shown this Session.
 * Nothing else: with neither, the Widget already showing stays. The Running example's scene and the Case's date and
 * title card are no longer Companions (B6); old rows that recorded them (`running_example`, `case`) still read back.
 * A candidate whose text or numbers include an open quiz's Blocked numbers is skipped (as V5 skips a Widget), and so
 * is one that does not build: code never shows a Widget its recipe refuses.
 */

export type CompanionKind = "scene" | "lingo" | "running_example" | "case";

/**
 * Whether the Learner's words ask what a word means: "What does 'basis point' mean?" (the G6 Choice), "what does bp
 * mean", "the meaning of yield". Not "What do you mean?", "What is the answer?" or "What's next?". Only a Choice press or
 * a chip reaches the picker with the Learner's words (an own question gets no Companion, and a code note none).
 */
export function asksWhatAWordMeans(text: string | null | undefined): boolean {
  if (!text) return false;
  return /\bwhat\s+(?:does|do)\s+(?!you\b|i\b|they\b|we\b)[^?]{1,60}?\bmean\b|\bmeaning\s+of\s+\S/iu.test(text);
}

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
  /** The Learner's words this turn (a Choice's words, or what they typed): a Lingo card only answers "what does it mean". */
  learnerText?: string | null;
};

export type CompanionParams = { title: string; inputs: Record<string, unknown>; refs: Record<string, unknown>; facts: Record<string, unknown> };

/** The picked Widget: its rule, the recipe and params code builds it from, and what it shows (a scene id, a term, the Case id). */
export type Companion = { kind: CompanionKind; recipe: string; params: CompanionParams; key: string };

/** The emoji of a Lingo card whose term names none of its own. */
const LINGO_EMOJI = "speech-balloon";

const words = (text: string) => text.split(/\s+/).filter(Boolean);

/** The text cut to at most `max` words and `chars` characters, at a word, with an ellipsis when cut. */
function fit(text: string, max: number, chars: number): string {
  const whole = text.trim();
  let out = words(whole).slice(0, max).join(" ");
  while (out.length > chars - 1 && out.includes(" ")) out = out.slice(0, out.lastIndexOf(" "));
  return out.length < whole.length ? `${out.replace(/[,;:.]$/, "")}…` : out;
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

  // 1. Asked what a word means: the Lingo card for the term they named, else the reply's first term. It answers the
  // question asked, so it comes before the step's scene, which waits for a later step-led reply.
  if (asksWhatAWordMeans(input.learnerText)) {
    const carded = new Set(input.shownThisSession.terms.map((t) => t.toLowerCase()));
    const firstIn = (text: string) =>
      topic.terms
        .filter((t) => !carded.has(t.term.toLowerCase()))
        .map((t) => ({ t, at: termAt(text, t.term) }))
        .filter((x) => x.at >= 0)
        .sort((a, b) => a.at - b.at);
    // A word the Learner named is the one asked about: its card, or none when it is already in the panel, never another
    // word's. Only the nameless "What does that word mean?" falls to the reply's first term.
    const namesATerm = topic.terms.some((t) => termAt(input.learnerText ?? "", t.term) >= 0);
    for (const { t } of namesATerm ? firstIn(input.learnerText ?? "") : firstIn(replyText)) {
      const params = { title: fit(`Lingo: ${t.term}`, 12, 90), inputs: lingoInputs(topic, t, replyText), refs: {}, facts: {} };
      const c: Companion = { kind: "lingo", recipe: "lingo_card", key: t.term, params };
      if (fits(c)) return c;
    }
  }

  // 2. The step's own story scene, once a Session.
  const scene = sceneFor(topic, place);
  if (scene && !input.shownThisSession.scenes.includes(scene.id)) {
    const params = { title: sceneTitle(topic, scene), inputs: scene.inputs, refs: scene.refs ?? {}, facts: scene.facts ?? {} };
    const c: Companion = { kind: "scene", recipe: scene.recipe, key: scene.id, params };
    if (fits(c)) return c;
  }
  return null;
}
