import { sumAsk } from "@/teaching/no-sums";
import { GO_DEEPER, wordChoiceWords } from "./chips";
import { firstTermIn } from "./term-spellings";

/**
 * Choices (spec 2026-11-05, D3a; ADR 0008): the two or three tap-to-answer buttons code puts under every Tutor reply.
 * Code picks them from the Teaching Step; the Tutor may suggest one (suggest_choice), which goes first when it is valid.
 * Pressing one posts its `says` as the Learner's message, a chip turn. A Choice is words only (ADR 0008). Pure, with no
 * server imports, so the browser can draw the same set when a reply has none stored (an older Session).
 */

export type ChoiceId = "next" | "show" | "word" | "life" | "quiz" | "deeper" | "tutor";
export type Choice = { id: ChoiceId; label: string; says: string };
export type ChoiceStep = "story" | "concept" | "explore" | "your_turn" | "check" | "reveal" | "principle" | "none";

/** Code's set: the label the button reads, and the words the press posts. */
export const CODE_CHOICES: Record<Exclude<ChoiceId, "tutor">, Choice> = {
  next: { id: "next", label: "What happened next?", says: "What happened next?" },
  show: { id: "show", label: "Show me", says: "Show me." },
  word: { id: "word", label: "What does that word mean?", says: "What does that word mean?" },
  life: { id: "life", label: "How does this touch my life?", says: "How does this touch my life?" },
  quiz: { id: "quiz", label: "Quiz me", says: "Quiz me." },
  deeper: { id: "deeper", label: "Go deeper", says: GO_DEEPER },
};

/** Each step's set, in order. Every set has three, so skipping the last press still leaves two. A Check never offers Quiz me. */
const STEP_SETS: Record<ChoiceStep, Exclude<ChoiceId, "tutor">[]> = {
  story: ["next", "word", "life"],
  concept: ["show", "word", "deeper"],
  explore: ["show", "word", "deeper"],
  your_turn: ["quiz", "show", "word"],
  check: ["word", "show", "deeper"],
  reveal: ["next", "life", "deeper"],
  principle: ["life", "quiz", "deeper"],
  // No Topic (every Topic passed): no story to go on with and nothing to show.
  none: ["word", "life", "deeper"],
};

/**
 * The Choice that stands in when the word Choice is not offered and fewer than two are left (G6): a set holds three, and
 * one skipped for the last press plus the word Choice dropped would leave one. Only steps whose set has the word Choice.
 * With no Topic, Quiz me asks about what was just talked over.
 */
const SPARE: Partial<Record<ChoiceStep, Exclude<ChoiceId, "tutor">>> = {
  story: "deeper",
  concept: "life",
  explore: "life",
  your_turn: "deeper",
  check: "life",
  none: "quiz",
};

/**
 * The term the word Choice names (spec 2026-11-12 G6): the Topic term that comes first in the reply (case-insensitive,
 * at word boundaries, a plural "s" allowed), written as the Topic writes it. A term with a bracketed short form is named
 * by the spelling the reply used: "basis point (bp)" is "basis point", or "bp" when the reply wrote "bps". Null when
 * the reply uses no term of the Topic's.
 */
export const wordChoiceTerm = (terms: readonly { term: string }[], replyText: string): string | null => firstTermIn(replyText, terms);

/** The word Choice naming a term: "What does 'basis point' mean?", its press posting the same words. */
export function wordChoice(term: string): Choice {
  const words = wordChoiceWords(term);
  return { id: "word", label: words, says: words };
}

/** The most words a Tutor's suggestion may have. */
export const SUGGESTION_WORD_LIMIT = 6;

const EMOJI_CHARS = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;
const bare = (s: string) => s.trim().toLowerCase().replace(/[.?!]+$/, "");

/** The Tutor's suggestion as a Choice, or null when it breaks a rule: over six words, an emoji, a sum, or a copy of a set label. */
export function suggestedChoice(suggestion: string | null | undefined): Choice | null {
  const label = suggestion?.trim().replace(/\s+/g, " ") ?? "";
  if (!label) return null;
  if (label.split(" ").length > SUGGESTION_WORD_LIMIT) return null;
  if (EMOJI_CHARS.test(label)) return null;
  if (sumAsk(label) !== null) return null;
  if (Object.values(CODE_CHOICES).some((c) => bare(c.label) === bare(label) || bare(c.says) === bare(label))) return null;
  return { id: "tutor", label, says: label };
}

/**
 * The Choices under a reply: the Tutor's valid suggestion first, then the step's set in order, skipping the one the
 * Learner pressed last turn, capped at three. Always two or three.
 *
 * `word` is the term the word Choice names (`wordChoiceTerm`, G6): a term gives "What does 'basis point' mean?"; null
 * (the reply uses no Topic term) leaves the word Choice out, and the step's spare stands in when fewer than two are
 * left. Left out (undefined), the nameless "What does that word mean?" stays: only for a caller with no reply to read.
 * A Tutor's suggestion with the word Choice's own words is not offered twice.
 */
export function choicesFor(step: ChoiceStep, suggestion: string | null, lastPressed: string | null, word?: string | null): Choice[] {
  const tutor = suggestedChoice(suggestion);
  const choiceOf = (id: Exclude<ChoiceId, "tutor">): Choice | null => (id !== "word" || word === undefined ? CODE_CHOICES[id] : word === null ? null : wordChoice(word));
  const set = STEP_SETS[step]
    .filter((id) => id !== lastPressed)
    .map(choiceOf)
    .filter((c): c is Choice => c !== null && !(tutor && bare(c.label) === bare(tutor.label)));
  const spare = SPARE[step];
  const head = [...(tutor ? [tutor] : []), ...set];
  if (head.length < 2 && spare && spare !== lastPressed && !head.some((c) => c.id === spare)) head.push(CODE_CHOICES[spare]);
  return head.slice(0, 3);
}
