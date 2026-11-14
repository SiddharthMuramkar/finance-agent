import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { messages, OWNER_LEARNER_ID, sessions, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { apply0036, testDb, testDbWithout0036 } from "@/test/pglite";
import { itemsByTurn, loadReplyTurns, replyItems, whoStored, type ReplyTurn } from "./reply-items";
import { forgetTurnColumns, loadSessionItems, saveItemAfterLatest, STEP_DIVIDER, type StoredItem } from "./session-items";
import { NEXT_PREFIX } from "./turn-status";

/**
 * Reply items (reply-items.ts): which stored items belong to one reply, and who stored them. Since migration 0036 each
 * item carries the turn that was running when it was stored; a row without one is placed by turnItems' rule. PGlite for
 * the writes, in both states production goes through: before 0036 is applied by hand, and after.
 */

const me = OWNER_LEARNER_ID;
const t0 = new Date("2026-11-04T10:00:00Z");

async function sessionWithTurn(db: Db) {
  const [s] = await db.insert(sessions).values({ learnerId: me, instructions: "i", tools: [], model: "m", effort: "medium", fingerprint: "f" }).returning();
  await db.insert(messages).values([
    { sessionId: s.id, seq: 0, role: "user", content: "Hi" },
    { sessionId: s.id, seq: 1, role: "assistant", content: [{ type: "text", text: "Hello." }] },
  ]);
  const [turn] = await db.insert(turns).values({ learnerId: me, sessionId: s.id, turnSeq: 0, status: "finished", input: "Hi" }).returning();
  return { sessionId: s.id, turnId: turn.id };
}

const kindsOf = (items: StoredItem[]) => items.map((i) => i.kind);

describe("storing an item with its turn", () => {
  afterEach(forgetTurnColumns);

  it("stamps the Learner's running turn and who stored it; an item stored outside a turn has no turn", async () => {
    const db = await testDb();
    const { sessionId, turnId } = await sessionWithTurn(db);
    await saveItemAfterLatest(db, me, sessionId, { kind: "outside", data: {} }, t0);
    await db.update(turns).set({ status: "running" }).where(sql`${turns.id} = ${turnId}`);
    await saveItemAfterLatest(db, me, sessionId, { kind: "by_tool", data: {} }, t0, "tutor");
    await saveItemAfterLatest(db, me, sessionId, { kind: "by_code", data: {} }, t0);
    const items = await loadSessionItems(db, sessionId, me);
    expect(items.map((i) => [i.kind, i.turnId, whoStored(i)])).toEqual([
      ["outside", null, "code"],
      ["by_tool", turnId, "tutor"],
      ["by_code", turnId, "code"],
    ]);
  });

  it("never stamps another Learner's running turn", async () => {
    const db = await testDb();
    const { sessionId } = await sessionWithTurn(db);
    const { rows } = (await db.execute(sql`insert into learners (name) values ('Other') returning id`)) as unknown as { rows: { id: number }[] };
    await db.insert(turns).values({ learnerId: rows[0].id, status: "running", input: "Hi" });
    await saveItemAfterLatest(db, me, sessionId, { kind: "mine", data: {} }, t0);
    expect((await loadSessionItems(db, sessionId, me))[0].turnId).toBeNull();
  });

  it("before migration 0036, stores and reads items without the columns, inside a caller's transaction", async () => {
    // session_items as it was before 0036: no turn_id or stored_by.
    const db = await testDbWithout0036();
    forgetTurnColumns();
    const { sessionId, turnId } = await sessionWithTurn(db);
    await db.update(turns).set({ status: "running" }).where(sql`${turns.id} = ${turnId}`);
    // The process's first look at the columns happens inside the transaction. A statement naming a missing column would
    // abort it: the item and the write after it would both be lost.
    let inTx: StoredItem[] = [];
    await db.transaction(async (tx) => {
      await saveItemAfterLatest(tx as unknown as Db, me, sessionId, { kind: "in_tx", data: {} }, t0, "tutor");
      inTx = await loadSessionItems(tx as unknown as Db, sessionId, me);
      await tx.update(turns).set({ input: "still here" }).where(sql`${turns.id} = ${turnId}`);
    });
    expect(inTx).toEqual([{ afterSeq: 1, kind: "in_tx", data: {} }]);
    const items = await loadSessionItems(db, sessionId, me);
    expect(items).toEqual([{ afterSeq: 1, kind: "in_tx", data: {} }]);
    expect(whoStored(items[0])).toBeNull();
    const [turn] = await db.select({ input: turns.input }).from(turns).where(sql`${turns.id} = ${turnId}`);
    expect(turn.input).toBe("still here");
  });

  it("goes on while 0036 is applied by hand under a running server, and stamps items once the server restarts", async () => {
    const db = await testDbWithout0036();
    forgetTurnColumns();
    const { sessionId, turnId } = await sessionWithTurn(db);
    await db.update(turns).set({ status: "running" }).where(sql`${turns.id} = ${turnId}`);
    await saveItemAfterLatest(db, me, sessionId, { kind: "deployed", data: {} }, t0, "tutor");
    // `npm run db:migrate` on production, while this process still holds its first answer: the columns are missing.
    await apply0036(db);
    await db.transaction(async (tx) => saveItemAfterLatest(tx as unknown as Db, me, sessionId, { kind: "migrated", data: {} }, t0, "tutor"));
    expect(await loadSessionItems(db, sessionId, me)).toEqual([
      { afterSeq: 1, kind: "deployed", data: {} },
      { afterSeq: 1, kind: "migrated", data: {} },
    ]);
    // A restart asks again: the rows from before the migration have no turn, and new ones are stamped.
    forgetTurnColumns();
    await saveItemAfterLatest(db, me, sessionId, { kind: "restarted", data: {} }, t0, "tutor");
    expect((await loadSessionItems(db, sessionId, me)).map((i) => [i.kind, i.turnId, whoStored(i)])).toEqual([
      ["deployed", null, null],
      ["migrated", null, null],
      ["restarted", turnId, "tutor"],
    ]);
  });

  it("a dropped turn (a refused Next) leaves its items without a turn instead of blocking the drop", async () => {
    const db = await testDb();
    const { sessionId, turnId } = await sessionWithTurn(db);
    await db.update(turns).set({ status: "running" }).where(sql`${turns.id} = ${turnId}`);
    await saveItemAfterLatest(db, me, sessionId, { kind: "x", data: {} }, t0);
    await db.delete(turns).where(sql`${turns.id} = ${turnId}`);
    expect((await loadSessionItems(db, sessionId, me))[0].turnId).toBeNull();
  });
});

describe("a reply's items", () => {
  // Turn A (seq 0, reply at 1), then a Next (its note at seq 2, reply at 3) whose divider and Widget sit after seq 1.
  const rows = [
    { seq: 0, role: "user" },
    { seq: 1, role: "assistant" },
    { seq: 2, role: "user" },
    { seq: 3, role: "assistant" },
  ];
  const a: ReplyTurn = { turnSeq: 0, id: 10, next: false };
  const next: ReplyTurn = { turnSeq: 2, id: 11, next: true };
  const item = (kind: string, afterSeq: number, turnId?: number | null): StoredItem => ({ kind, data: {}, afterSeq, ...(turnId !== undefined && { turnId }) });

  it("without turn ids, gives a Next's step items to the Next and the reply's own Choices to the reply before", () => {
    const items = [item("a_widget", 1), item("choices", 1), item(STEP_DIVIDER, 1), item("step_widget", 1), item("next_widget", 3)];
    expect(kindsOf(replyItems(items, rows, a, next))).toEqual(["a_widget", "choices"]);
    expect(kindsOf(replyItems(items, rows, next))).toEqual([STEP_DIVIDER, "step_widget", "next_widget"]);
    expect([...itemsByTurn(items, rows, [a, next]).entries()].map(([seq, is]) => [seq, kindsOf(is)])).toEqual([
      [0, ["a_widget", "choices"]],
      [2, [STEP_DIVIDER, "step_widget", "next_widget"]],
    ]);
  });

  it("with turn ids, follows them, whatever the seqs say; a row without one falls back to the rule", () => {
    // A coming-back divider stored with the Next, before its step divider: the Next's by its turn id, not the rule's.
    const items = [item("a_widget", 1, 10), item("old_row", 1, null), item("coming_back", 1, 11), item(STEP_DIVIDER, 1, 11), item("page_item", 3, null)];
    expect(kindsOf(replyItems(items, rows, a, next))).toEqual(["a_widget", "old_row"]);
    expect(kindsOf(replyItems(items, rows, next))).toEqual(["coming_back", STEP_DIVIDER, "page_item"]);
  });

  it("places a row stamped with a turn the Session does not know by the rule, so some reply still has it", () => {
    // A Next whose turn failed before its message was stored (no turn seq) stamped its step items with that turn; the
    // Learner then typed instead of pressing Retry. The rule gives those items to the reply before, as it always did.
    const typed: ReplyTurn = { turnSeq: 2, id: 11, next: false };
    const items = [item("a_widget", 1, 10), item(STEP_DIVIDER, 1, 99), item("step_widget", 1, 99), item("typed_widget", 3, 11)];
    expect([...itemsByTurn(items, rows, [a, typed]).entries()].map(([seq, is]) => [seq, kindsOf(is)])).toEqual([
      [0, ["a_widget", STEP_DIVIDER, "step_widget"]],
      [2, ["typed_widget"]],
    ]);
  });

  it("reads by the rule alone when the reader does not know the turn's id", () => {
    const items = [item("a_widget", 1, 10), item(STEP_DIVIDER, 1, 11), item("step_widget", 1, 11)];
    expect(kindsOf(replyItems(items, rows, { turnSeq: 0, id: null, next: false }, { turnSeq: 2, id: null, next: true }))).toEqual(["a_widget"]);
  });

  it("knows a Session's turns from its turns rows, and the reply seqs no row records", async () => {
    const db = await testDb();
    const { sessionId, turnId } = await sessionWithTurn(db);
    const [n] = await db.insert(turns).values({ learnerId: me, sessionId, turnSeq: 2, status: "finished", input: `${NEXT_PREFIX} the Learner pressed Next.` }).returning();
    expect(await loadReplyTurns(db, sessionId, [0, 2, 4])).toEqual([
      { turnSeq: 0, id: turnId, next: false },
      { turnSeq: 2, id: n.id, next: true },
      { turnSeq: 4, id: null, next: false },
    ]);
  });
});
