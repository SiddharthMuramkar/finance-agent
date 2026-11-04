import { and, asc, eq, max } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { stepSequence, type Progress } from "@/course/navigator";
import { messages, sessionItems } from "@/db/schema";
import type { Db } from "@/db/types";
import { openWidgetsIn, type OpenWidget } from "@/widgets/check";
import { asFence, shownWidgetOf, WIDGET_SHOWN } from "@/widgets/shown-widget";
import { STEP_DIVIDER, type SessionItem } from "./session-item-kinds";

/**
 * Session items: what the Study Workspace draws between messages and never sends to the model (step
 * dividers, "Picking up" and Due Check dividers (coming-back.ts), Check result cards (check-results.ts), Topic
 * complete cards (topic-complete.ts), Widget opened chips (open_widget in tools.ts) and Widgets code drew from a
 * recipe (show_widget in tools.ts, ADR 0005)). Their kinds are in
 * session-item-kinds.ts, which the browser can import.
 * Each is stored in order, after the message it follows, with a kind and its data; the thread draws
 * each by its kind and skips a kind it does not know. The model's history is read only from the
 * messages table (session-log.ts), so nothing here ever reaches a request.
 */

export { STEP_DIVIDER, type SessionItem };
/** A stored item: it sits after the message with seq `afterSeq` in its Session (-1: before the first). */
export type StoredItem = SessionItem & { afterSeq: number };

/**
 * The divider for the Learner's place in a Topic, numbered and named by the Course Navigator
 * ("Step 3 of 9 · Your turn"), or null when the Topic has no current step (it is passed).
 */
export function stepDivider(map: CourseMap, progress: Progress, topicId: string): SessionItem | null {
  const seq = stepSequence(map, progress, topicId);
  if (!seq || seq.current === null) return null;
  const at = seq.steps[seq.current];
  return { kind: STEP_DIVIDER, data: { step: at.step, number: at.number, label: at.label } };
}

/** Stores an item after the Session's latest message (the one it follows). */
export async function saveItemAfterLatest(db: Db, learnerId: number, sessionId: number, item: SessionItem, now: Date): Promise<void> {
  const [{ last }] = await db.select({ last: max(messages.seq) }).from(messages).where(eq(messages.sessionId, sessionId));
  await db.insert(sessionItems).values({ learnerId, sessionId, afterSeq: last ?? -1, kind: item.kind, data: item.data, createdAt: now });
}

/** A reply's text with its seq: what drawnWidgets reads Widgets from. */
export type ReplyText = { seq: number; text: string };

/**
 * The Widgets open in a Session (openWidgetsIn): those its replies drew and those code drew from recipes (WIDGET_SHOWN
 * items, ADR 0005), merged in seq order, so a shown Widget updates a drawn one in place and the other way round.
 * Replies and items at or after `beforeSeq` are left out.
 */
export function drawnWidgets(replies: readonly ReplyText[], items: readonly StoredItem[], beforeSeq = Infinity): OpenWidget[] {
  const shown = items.flatMap((i) => {
    const widget = i.kind === WIDGET_SHOWN && i.afterSeq < beforeSeq ? shownWidgetOf(i.data) : null;
    return widget ? [{ afterSeq: i.afterSeq, text: asFence(widget.code) }] : [];
  });
  const texts: string[] = [];
  let next = 0;
  // An item stored after message s comes before every reply from s + 1 on.
  for (const reply of [...replies].filter((r) => r.seq < beforeSeq).sort((a, b) => a.seq - b.seq)) {
    while (next < shown.length && shown[next].afterSeq < reply.seq) texts.push(shown[next++].text);
    texts.push(reply.text);
  }
  texts.push(...shown.slice(next).map((s) => s.text));
  return openWidgetsIn(texts);
}

/** The Learner's items in one of their Sessions, in order; another Learner's Session has none. */
export async function loadSessionItems(db: Db, sessionId: number, learnerId: number): Promise<StoredItem[]> {
  return db
    .select({ afterSeq: sessionItems.afterSeq, kind: sessionItems.kind, data: sessionItems.data })
    .from(sessionItems)
    .where(and(eq(sessionItems.sessionId, sessionId), eq(sessionItems.learnerId, learnerId)))
    .orderBy(asc(sessionItems.afterSeq), asc(sessionItems.id));
}
