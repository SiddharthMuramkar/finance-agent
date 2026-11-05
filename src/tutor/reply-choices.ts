import type { CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import type { Turn } from "./turn-status";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { choicesFor, suggestedChoice } from "./choices";
import { REPLY_CHOICES, type ReplyChoicesData } from "./session-item-kinds";
import { loadSessionItems, saveItemAfterLatest, type StoredItem } from "./session-items";
import { currentTopicId, liveSession } from "./session-log";

/**
 * The Choices of a Tutor Turn (spec 2026-11-05, D3a; ADR 0010): code stores two or three after every checked reply as a
 * reply_choices item, and resolves a press from the stored item, so the words posted are always the words shown.
 */

type Row = { seq: number; role: string; content?: unknown };

const choicesOf = (item: StoredItem | undefined) => ((item?.data as ReplyChoicesData | undefined)?.choices ?? []) as ReplyChoicesData["choices"];

/** The latest stored Choices in a Session before `beforeSeq` (all of them when left out). */
function latestChoicesIn(items: readonly StoredItem[], beforeSeq = Infinity): ReplyChoicesData["choices"] {
  return choicesOf(items.filter((i) => i.kind === REPLY_CHOICES && i.afterSeq < beforeSeq).at(-1));
}

/** The words the Learner's press of Choice `index` posts: from the latest Choices in their current Topic's Session, or null. */
export async function pressedChoiceWords(db: Db, map: CourseMap, learnerId: number, index: number): Promise<string | null> {
  const session = await liveSession(db, learnerId, await currentTopicId(db, map, learnerId));
  if (!session) return null;
  const choice = latestChoicesIn(await loadSessionItems(db, session.id, learnerId))[index];
  return choice?.says ?? null;
}

/**
 * Whether a turn's message is a press of one of the Choices shown under the reply before it (or the same words typed):
 * then, like a chip, it is never an Insight attempt and never the Learner's own rule. Covers the Tutor's suggested
 * Choice, whose words are not one of the fixed chip messages.
 */
export async function isChoicePress(db: Db, turn: Pick<Turn, "input" | "sessionId" | "turnSeq" | "learnerId">): Promise<boolean> {
  if (!turn.input || turn.sessionId === null || turn.turnSeq === null) return false;
  const choices = latestChoicesIn(await loadSessionItems(db, turn.sessionId, turn.learnerId), turn.turnSeq);
  return choices.some((c) => c.says === turn.input!.trim());
}

/** The label of the Tutor's last suggest_choice call in the reply written after `fromSeq`, if any. */
export function suggestionAfter(rows: readonly Row[], fromSeq: number): string | null {
  const calls = rows
    .filter((r) => r.seq > fromSeq && r.role === "assistant" && Array.isArray(r.content))
    .flatMap((r) => (r.content as { type?: string; name?: string; input?: { label?: unknown } }[]).filter((b) => b?.type === "tool_use" && b.name === "suggest_choice"));
  const label = calls.at(-1)?.input?.label;
  return typeof label === "string" ? label : null;
}

/**
 * Picks and stores the Choices for the reply of the turn at `turnSeq`: the Learner's step after the turn, the Tutor's
 * suggestion, and the Choice pressed to start the turn (skipped). Returns the item, and the suggestion code dropped.
 */
export async function storeReplyChoices(
  db: Db,
  map: CourseMap,
  o: { learnerId: number; sessionId: number; turnSeq: number; input: string | null; rows: readonly Row[]; now: Date },
): Promise<{ item: { kind: string; data: Record<string, unknown> }; dropped: string | null }> {
  const items = await loadSessionItems(db, o.sessionId, o.learnerId);
  const pressed = latestChoicesIn(items, o.turnSeq).find((c) => c.says === o.input?.trim())?.id ?? null;
  const step = navigate(map, await loadProgress(db, o.learnerId))?.step ?? "none";
  const suggestion = suggestionAfter(o.rows, o.turnSeq);
  const dropped = suggestion !== null && suggestedChoice(suggestion) === null ? suggestion : null;
  const data: ReplyChoicesData = { choices: choicesFor(step, suggestion, pressed), ...(dropped !== null && { dropped }) };
  const item = { kind: REPLY_CHOICES, data };
  await saveItemAfterLatest(db, o.learnerId, o.sessionId, item, o.now);
  return { item, dropped };
}
