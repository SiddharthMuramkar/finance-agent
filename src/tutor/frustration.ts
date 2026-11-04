import type { SkillState } from "@/teaching/ladder";

/**
 * The frustration count (spec #229, "Frustration"; ticket #245). Code counts the Learner's signal phrases and their
 * misses in a row, and when the count is 1 or more the context tells the Tutor to acknowledge it briefly and take a
 * smaller step. The Learner never sees a label.
 */

/** What the count reads, oldest first: the Learner's own messages, and each right answer code marked. */
export type FrustrationEvent = { kind: "learner"; text: string } | { kind: "right" };

/** Phrases that say the Learner is fed up, written without apostrophes and in lower case. */
export const FRUSTRATION_PHRASES = ["get it over with", "too complicated", "over complicated", "dont know any of this"] as const;

/** Only the Learner's last three messages count, so one early phrase in an unconverted Topic does not count for the whole Session. */
const WINDOW = 3;

const plain = (text: string) => text.toLowerCase().replace(/['’‘`]/g, "").replace(/\s+/g, " ");

/**
 * The signal phrases in the Learner's last three messages since their last right code-marked answer, plus 1 when the
 * current Skill (converted Topics only; pass null otherwise) has two or more misses in a row. A right answer resets it.
 */
export function frustrationCount(events: readonly FrustrationEvent[], current: SkillState | null): number {
  const lastRight = events.map((e) => e.kind).lastIndexOf("right");
  const since = events.slice(lastRight + 1).filter((e): e is Extract<FrustrationEvent, { kind: "learner" }> => e.kind === "learner");
  const phrases = since
    .slice(-WINDOW)
    .reduce((n, e) => n + FRUSTRATION_PHRASES.filter((p) => plain(e.text).includes(p)).length, 0);
  return phrases + (current && current.missesInRow >= 2 ? 1 : 0);
}
