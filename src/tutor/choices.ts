import { emojiFor, type EmojiName } from "@/emoji/registry";
import { sumAsk } from "@/teaching/no-sums";
import { GO_DEEPER } from "./chips";

/**
 * Choices (spec 2026-11-05, D3a; ADR 0010): the two or three tap-to-answer buttons code puts under every Tutor reply.
 * Code picks them from the Teaching Step; the Tutor may suggest one (suggest_choice), which goes first when it is valid.
 * Pressing one posts its `says` as the Learner's message, a chip turn. Pure, with no server imports, so the browser
 * can draw the same set when a reply has none stored (an older Session).
 */

export type ChoiceId = "next" | "show" | "word" | "life" | "quiz" | "deeper" | "tutor";
export type Choice = { id: ChoiceId; label: string; says: string; emoji: EmojiName };
export type ChoiceStep = "story" | "concept" | "explore" | "your_turn" | "check" | "reveal" | "principle" | "none";

/** Code's set: label, the words the press posts, and the decorative emoji before the label. */
export const CODE_CHOICES: Record<Exclude<ChoiceId, "tutor">, Choice> = {
  next: { id: "next", label: "What happened next?", says: "What happened next?", emoji: "scroll" },
  show: { id: "show", label: "Show me", says: "Show me.", emoji: "eyes" },
  word: { id: "word", label: "What does that word mean?", says: "What does that word mean?", emoji: "thinking-face" },
  life: { id: "life", label: "How does this touch my life?", says: "How does this touch my life?", emoji: "money-with-wings" },
  quiz: { id: "quiz", label: "Quiz me", says: "Quiz me.", emoji: "direct-hit" },
  deeper: { id: "deeper", label: "Go deeper", says: GO_DEEPER, emoji: "magnifying-glass-tilted-left" },
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
  return { id: "tutor", label, says: label, emoji: emojiFor(label) ?? "speech-balloon" };
}

/**
 * The Choices under a reply: the Tutor's valid suggestion first, then the step's set in order, skipping the one the
 * Learner pressed last turn, capped at three. Always two or three.
 */
export function choicesFor(step: ChoiceStep, suggestion: string | null, lastPressed: string | null): Choice[] {
  const tutor = suggestedChoice(suggestion);
  const set = STEP_SETS[step].filter((id) => id !== lastPressed).map((id) => CODE_CHOICES[id]);
  return [...(tutor ? [tutor] : []), ...set].slice(0, 3);
}
