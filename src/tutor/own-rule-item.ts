/**
 * The Session item the Tutor's save_learner_rule stores (spec #229, "The Learner's own words"): a quiet line, "Saved to
 * your notes · Undo · Open notes", under the reply that confirmed the Learner's own rule. No server imports, so the
 * browser can match on the kind (session-item-view.tsx), like shown-widget.ts.
 */

/** The kind of the item stored after the Learner's message when code saved their own rule to the Topic Note. */
export const OWN_RULE_SAVED = "own_rule_saved";

/**
 * The item's data: the saved note's id (Undo deletes it), its Topic, the Learner's words as typed, and the Skill of
 * the right answer that earned the save in a converted Topic (null in an unconverted one).
 */
export type OwnRuleItemData = { noteId: number; topicId: string; text: string; skillId: string | null };

/** The data of an own-rule item, or null for anything else. */
export function ownRuleOf(item: { kind: string; data: Record<string, unknown> }): OwnRuleItemData | null {
  if (item.kind !== OWN_RULE_SAVED) return null;
  const { noteId, topicId, text, skillId } = item.data;
  if (typeof noteId !== "number" || typeof topicId !== "string" || typeof text !== "string") return null;
  return { noteId, topicId, text, skillId: typeof skillId === "string" ? skillId : null };
}

/** The words a turn saved as the Learner's rule, from the items its tools stored; null when it saved none. This is ReplyDraft.savedRule. */
export function savedRuleOf(items: readonly { kind: string; data: Record<string, unknown> }[]): string | null {
  for (const item of items) {
    const rule = ownRuleOf(item);
    if (rule) return rule.text;
  }
  return null;
}
