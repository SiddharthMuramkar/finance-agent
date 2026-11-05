/**
 * Which choice a typed answer stands for. No Learner path calls this: Learners tap. The tutor-eval cases and older
 * tests were written as typed answers ("50", "0.5"), so they pass through here once and the app marks the tap.
 */
import { choiceSet } from "./choices.ts";
import { markAnswer, type FixedItem } from "./mark.ts";
import type { DrawnItem } from "./templates.ts";

/**
 * The id of the choice a typed answer picks: the right one when it marks right, the choice that carries the same Known
 * mistake when it marks as one, else a wrong choice with no mistake (or any wrong one). The text itself when the item
 * has no choices, or when it is already a choice id.
 */
export function choiceForTyped(item: FixedItem | DrawnItem, typed: string): string {
  const set = choiceSet(item);
  if (!set || set.choices.some((c) => c.id === typed)) return typed;
  const verdict = markAnswer(item, typed);
  if (verdict.verdict === "right") return set.answer;
  const wrong = set.choices.filter((c) => c.id !== set.answer);
  const hit = verdict.verdict === "known_mistake" ? wrong.find((c) => c.mistake?.tag === verdict.tag) : wrong.find((c) => !c.mistake);
  return (hit ?? wrong[0])?.id ?? typed;
}
