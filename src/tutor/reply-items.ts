import { and, asc, eq, isNotNull } from "drizzle-orm";
import { turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { turnItems, type LogRow, type StoredBy, type StoredItem } from "./session-items";
import { turnKind } from "./turn-status";

/**
 * Reply items: which stored Session items belong to one Tutor reply, and who stored them. One answer for the one-Widget
 * check (tools.ts), the reply gate's fence check and the Companion gate (turn.ts), Save to Notebook (saved.ts), the
 * thread's Widget numbering (transcript.ts) and the eval's view of a reply (tutor-eval/setup.ts).
 *
 * Since migration 0036 every item carries the turn that was running when it was stored (session_items.turn_id) and who
 * stored it (stored_by), so a reply's items are simply its turn's. A row without a turn (stored before 0036 was applied
 * in production, or outside any turn) is placed by turnItems' rule (session-items.ts): after the turn's first message,
 * and on a Next also what code stored with the Next just before it. Rows of both kinds can sit in one Session.
 */

/** One turn of a Session as this rule reads it: the seq of its first message, its turns row (null when none is known), and whether it was a Next. */
export type ReplyTurn = { turnSeq: number; id: number | null; next: boolean };

/**
 * The items of `turn`'s reply, in stored order. An item stamped with a turn belongs to that turn's reply. One without a
 * turn is the reply's by turnItems' rule, less what the same rule gives `following`, the turn after it (none for the
 * turn being written now): a Next's step Widget, stored after the previous reply's last message, is the Next's.
 * `known`, from a reader that has all the Session's turns (itemsByTurn): their ids. A stamp naming none of them (a turn
 * that failed before its message was stored, then was never retried) is read as no stamp, so some reply still has it.
 */
export function replyItems(items: readonly StoredItem[], rows: readonly LogRow[], turn: ReplyTurn, following?: ReplyTurn | null, known?: ReadonlySet<number>): StoredItem[] {
  const later = new Set(following ? turnItems(items, rows, following.turnSeq, following.next) : []);
  const byRule = new Set(turnItems(items, rows, turn.turnSeq, turn.next).filter((i) => !later.has(i)));
  const stamped = (i: StoredItem) => i.turnId != null && turn.id !== null && (!known || known.has(i.turnId));
  return items.filter((i) => (stamped(i) ? i.turnId === turn.id : byRule.has(i)));
}

/** Who stored an item: `tutor` (a Tutor tool call, as what it was for) or `code`; null on a row stored before migration 0036. */
export const whoStored = (item: StoredItem): StoredBy | null => item.storedBy ?? null;

/**
 * Every turn's reply items, by the seq of the turn's first message: replyItems for each of `inOrder` (all the Session's
 * turns, as loadReplyTurns reads them), with the turn after it. What readers of finished replies ask.
 */
export function itemsByTurn(items: readonly StoredItem[], rows: readonly LogRow[], inOrder: readonly ReplyTurn[]): Map<number, StoredItem[]> {
  const known = new Set(inOrder.flatMap((t) => (t.id === null ? [] : [t.id])));
  return new Map(inOrder.map((turn, k) => [turn.turnSeq, replyItems(items, rows, turn, inOrder[k + 1], known)]));
}

/**
 * A Session's turns in seq order, one per turn seq: those its turns rows record (the latest row for a seq), and any of
 * `seqs` (the turn seqs its replies show) that no row records, as turns of unknown id that were not a Next.
 */
export async function loadReplyTurns(db: Db, sessionId: number, seqs: Iterable<number> = []): Promise<ReplyTurn[]> {
  const rows = await db
    .select({ id: turns.id, turnSeq: turns.turnSeq, input: turns.input })
    .from(turns)
    .where(and(eq(turns.sessionId, sessionId), isNotNull(turns.turnSeq)))
    .orderBy(asc(turns.id));
  const bySeq = new Map<number, ReplyTurn>();
  for (const seq of seqs) bySeq.set(seq, { turnSeq: seq, id: null, next: false });
  for (const r of rows) bySeq.set(r.turnSeq!, { turnSeq: r.turnSeq!, id: r.id, next: turnKind(r) === "next" });
  return [...bySeq.values()].sort((a, b) => a.turnSeq - b.turnSeq);
}
