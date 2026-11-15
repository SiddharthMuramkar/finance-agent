import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { integer, jsonb, pgSchema, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { CourseMap } from "@/course/map";
import { stepSequence, type Progress } from "@/course/navigator";
import { messages, sessionItems, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { openWidgetsIn, type OpenWidget } from "@/widgets/check";
import { asFence, shownWidgetOf, WIDGET_SHOWN } from "@/widgets/shown-widget";
import { STEP_DIVIDER, type SessionItem } from "./session-item-kinds";

/**
 * Session items: what the Study Workspace draws between messages and never sends to the model (step
 * dividers, "Picking up" and Due Check dividers (coming-back.ts), Check result cards (check-results.ts), Topic
 * complete cards (topic-complete.ts), Widget opened chips (open_widget in tools.ts) and Widgets code drew from a
 * recipe (show_widget in tools.ts, ADR 0009)). Their kinds are in
 * session-item-kinds.ts, which the browser can import.
 * Each is stored in order, after the message it follows, with a kind and its data; the thread draws
 * each by its kind and skips a kind it does not know. The model's history is read only from the
 * messages table (session-log.ts), so nothing here ever reaches a request.
 */

export { STEP_DIVIDER, type SessionItem };
/** Who stored an item: a Tutor tool call, as what the call was for (a Widget it showed or opened, a verdict card, a saved rule), or code. */
export type StoredBy = "tutor" | "code";
/**
 * A stored item: it sits after the message with seq `afterSeq` in its Session (-1: before the first). `turnId` and
 * `storedBy` are read once migration 0036 adds their columns, and are null on a row stored before that or (`turnId`)
 * outside a turn; reply-items.ts reads them.
 */
export type StoredItem = SessionItem & { afterSeq: number; turnId?: number | null; storedBy?: StoredBy | null };

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

/**
 * session_items as migration 0036 found it, with no turn_id or stored_by. Drizzle names every column of a table in an
 * insert, so a database without 0036 is written through this. Not in schema.ts, so drizzle-kit never sees it. Delete it,
 * and the probe below, once 0036 is applied in production.
 */
const sessionItemsBefore0036 = pgTable("session_items", {
  id: serial("id").primaryKey(),
  learnerId: integer("learner_id").notNull(),
  sessionId: integer("session_id").notNull(),
  afterSeq: integer("after_seq").notNull(),
  kind: text("kind").notNull(),
  data: jsonb("data").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

const infoColumns = pgSchema("information_schema").table("columns", { tableSchema: text("table_schema"), tableName: text("table_name"), columnName: text("column_name") });

let turnColumns: Promise<boolean> | undefined;

/**
 * Whether session_items has migration 0036's turn_id and stored_by. Production deploys before the migration is applied by
 * hand, and a statement naming a missing column would abort the transaction a caller passed in, so this asks Postgres's
 * catalogue once per process (a read that cannot fail on a missing column) and every insert and read then names the
 * columns only when they are there. A process that started before the migration keeps leaving them out until it restarts.
 */
async function hasTurnColumns(db: Db): Promise<boolean> {
  turnColumns ??= db
    .select({ name: infoColumns.columnName })
    .from(infoColumns)
    .where(and(sql`${infoColumns.tableSchema} = current_schema()`, eq(infoColumns.tableName, "session_items"), inArray(infoColumns.columnName, ["turn_id", "stored_by"])))
    .then(
      (found) => {
        if (found.length < 2) console.warn("session_items.turn_id and stored_by are missing (migration 0036 not applied yet): items are stored without their turn.");
        return found.length === 2;
      },
      (error) => {
        turnColumns = undefined;
        throw error;
      },
    );
  return turnColumns;
}

/** For tests that take migration 0036's columns away or put them back: the next insert or read asks the catalogue again. */
export function forgetTurnColumns(): void {
  turnColumns = undefined;
}

/**
 * Stores an item after the Session's latest message (the one it follows), stamped with the Learner's running turn (none
 * outside a turn: turns_one_running allows one) and with who stored it. `storedBy` is `tutor` only from a Tutor tool
 * call storing what the call was for; what code stores on the back of a tool's move (a new step's divider and what
 * entering it shows) is code's.
 */
export async function saveItemAfterLatest(db: Db, learnerId: number, sessionId: number, item: SessionItem, now: Date, storedBy: StoredBy = "code"): Promise<void> {
  const [{ last }] = await db.select({ last: max(messages.seq) }).from(messages).where(eq(messages.sessionId, sessionId));
  const row = { learnerId, sessionId, afterSeq: last ?? -1, kind: item.kind, data: item.data, createdAt: now };
  if (!(await hasTurnColumns(db))) {
    await db.insert(sessionItemsBefore0036).values(row);
    return;
  }
  // Read in the same statement, so the item and the turn it names agree. The row is held (key share) until the caller's
  // transaction ends, so it cannot be deleted under the item. A running turn another request is deleting right now
  // (dropTurn, after a refused Next) is skipped, and the item is stored without its turn: naming it would fail the
  // foreign key once that delete commits.
  const running = db
    .select({ id: turns.id })
    .from(turns)
    .where(and(eq(turns.learnerId, learnerId), eq(turns.status, "running")))
    .for("key share", { skipLocked: true });
  await db.insert(sessionItems).values({ ...row, turnId: sql`(${running})`, storedBy });
}

/** A reply's text with its seq: what drawnWidgets reads Widgets from. */
export type ReplyText = { seq: number; text: string };

/**
 * The Widgets open in a Session (openWidgetsIn): those its replies drew and those code drew from recipes (WIDGET_SHOWN
 * items, ADR 0009), merged in seq order, so a shown Widget updates a drawn one in place and the other way round.
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

/** A stored message row, as much of it as turnItems reads. */
export type LogRow = { seq: number; role: string; content?: unknown };

/** A row the turn itself can add before its first message: a cut-off's tool results, or a refreeze's summary. */
const addedBeforeTurn = (r: LogRow) =>
  Array.isArray(r.content) &&
  r.content.length > 0 &&
  (r.role === "user" ? r.content.every((b) => b?.type === "tool_result") : r.content.some((b) => b?.type === "compaction"));

/**
 * The items of the turn whose first message has seq `turnSeq`: those stored after it, and on a Next also those code
 * stored with the Next just before it (takeLearnersNext: the step's divider, then the Widget the step opens or the
 * Concept card and its preset). Those sit after the previous reply's last message, which may no longer be the row just
 * before `turnSeq`: the turn can add a cut-off's tool results and a refreeze's summary in between (runLockedTurn), so
 * the items after those rows count too. Only the ones from the Next's divider on count: the previous reply's own
 * Widget and Choices stay its own. It reads seqs alone, with no upper end: reply-items.ts asks it for rows stored
 * without their turn (before migration 0036, or outside a turn), less what it gives the turn after.
 */
export function turnItems(items: readonly StoredItem[], rows: readonly LogRow[], turnSeq: number, next: boolean): StoredItem[] {
  let from = turnSeq - 1;
  const bySeq = new Map(rows.map((r) => [r.seq, r]));
  for (let row = bySeq.get(from); row && addedBeforeTurn(row) && from > 0; row = bySeq.get(from)) from--;
  const before = next ? items.filter((i) => i.afterSeq >= from && i.afterSeq < turnSeq) : [];
  const divider = before.findLastIndex((i) => i.kind === STEP_DIVIDER);
  return [...(divider < 0 ? [] : before.slice(divider)), ...items.filter((i) => i.afterSeq >= turnSeq)];
}

/** The Learner's items in one of their Sessions, in order; another Learner's Session has none. */
export async function loadSessionItems(db: Db, sessionId: number, learnerId: number): Promise<StoredItem[]> {
  const columns = { afterSeq: sessionItems.afterSeq, kind: sessionItems.kind, data: sessionItems.data };
  const theirs = and(eq(sessionItems.sessionId, sessionId), eq(sessionItems.learnerId, learnerId));
  const order = [asc(sessionItems.afterSeq), asc(sessionItems.id)];
  if (!(await hasTurnColumns(db))) return db.select(columns).from(sessionItems).where(theirs).orderBy(...order);
  return db
    .select({ ...columns, turnId: sessionItems.turnId, storedBy: sessionItems.storedBy })
    .from(sessionItems)
    .where(theirs)
    .orderBy(...order);
}
