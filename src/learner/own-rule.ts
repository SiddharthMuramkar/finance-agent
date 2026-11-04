import { and, asc, eq } from "drizzle-orm";
import { noteItems, sessionItems } from "@/db/schema";
import type { Db } from "@/db/types";
import { ownRuleOf, OWN_RULE_SAVED } from "@/tutor/own-rule-item";

/**
 * The Learner's own rule (spec #229, "The Learner's own words"): when the Learner states a rule in their own words, the
 * Tutor's save_learner_rule has code keep those words on the Topic Note. The words are the Learner's, saved as typed,
 * and are one `note_items` row of kind `own_rule`. The Skill of a converted Topic's save rides in the Session item
 * (OWN_RULE_SAVED), not in the row, so the table needs no new column. Every row is one Learner's.
 */

export const MAX_RULE_LENGTH = 300;

export type OwnRule = { id: number; topicId: string; text: string; skillId: string | null; savedAt: Date };

export type SaveOwnRule = { learnerId: number; topicId: string; sessionId: number; turnSeq: number; text: string; skillId: string | null };

/**
 * Saves one own rule. The unique index on a Learner's Topic, kind, Session and turn lets one turn save only one;
 * a second write for the same turn throws. `skillId` is returned with the rule, not stored in the row.
 */
export async function saveOwnRule(db: Db, a: SaveOwnRule, now = new Date()): Promise<OwnRule> {
  const text = a.text.trim();
  if (!text) throw new Error("An own rule needs words.");
  if (text.length > MAX_RULE_LENGTH) throw new Error(`An own rule is at most ${MAX_RULE_LENGTH} characters.`);
  const [row] = await db
    .insert(noteItems)
    .values({ learnerId: a.learnerId, topicId: a.topicId, kind: "own_rule", text, sessionId: a.sessionId, turnSeq: a.turnSeq, createdAt: now, updatedAt: now })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new Error("This turn has already saved a rule.");
  return { id: row.id, topicId: row.topicId, text, skillId: a.skillId, savedAt: row.createdAt };
}

/**
 * This Learner's own rules still on their notes, oldest first, optionally for one Topic. The Skill of each comes from its
 * Session item (the save's), null when the item is gone or the Topic was not converted.
 */
export async function ownRules(db: Db, learnerId: number, topicId?: string): Promise<OwnRule[]> {
  const rows = await db
    .select()
    .from(noteItems)
    .where(and(eq(noteItems.learnerId, learnerId), eq(noteItems.kind, "own_rule"), ...(topicId ? [eq(noteItems.topicId, topicId)] : [])))
    .orderBy(asc(noteItems.id));
  if (!rows.length) return [];
  const items = await db
    .select({ data: sessionItems.data, kind: sessionItems.kind })
    .from(sessionItems)
    .where(and(eq(sessionItems.learnerId, learnerId), eq(sessionItems.kind, OWN_RULE_SAVED)));
  const skillOf = new Map(items.flatMap((i) => (ownRuleOf(i) ? [[ownRuleOf(i)!.noteId, ownRuleOf(i)!.skillId] as const] : [])));
  return rows.map((r) => ({ id: r.id, topicId: r.topicId, text: r.text ?? "", skillId: skillOf.get(r.id) ?? null, savedAt: r.createdAt }));
}
