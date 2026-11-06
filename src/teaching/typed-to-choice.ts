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
  // A written choice item (E6a turned Percent and Compounding's typed tries into these): a bare number picks the one
  // choice whose words start with that number ("0.3" picks "0.3 bp", "50" picks "50%").
  if (!("templateId" in item) && item.kind === "choice") {
    const wanted = Number(typed.replace(/,/g, "").trim());
    if (typed.trim() !== "" && Number.isFinite(wanted)) {
      const hits = set.choices.filter((c) => Number(/^[₹$]?(-?\d[\d,]*(?:\.\d+)?)/.exec(c.text)?.[1]?.replace(/,/g, "")) === wanted);
      if (hits.length === 1) return hits[0].id;
    }
  }
  const verdict = markAnswer(item, typed);
  if (verdict.verdict === "right") return set.answer;
  const wrong = set.choices.filter((c) => c.id !== set.answer);
  const hit = verdict.verdict === "known_mistake" ? wrong.find((c) => c.mistake?.tag === verdict.tag) : wrong.find((c) => !c.mistake);
  return (hit ?? wrong[0])?.id ?? typed;
}
