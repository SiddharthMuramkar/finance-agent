import type { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
// @ts-expect-error the eval's reads are a plain .mjs script with no types
import { openTurns, readDelight, readLane, tutorSteps } from "../../../scripts/eval-reads.mjs";
import { learners, messages, OWNER_LEARNER_ID, replyChecks, sessionItems, sessions, turns, usageRows } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";

/**
 * Seam S3: what the Delight eval reads from the test branch after one prompt, on the real migrations. The prompt starts
 * after `promptSeq`, the opener's last message, so anything stored at that seq (the opener's own Choices, the opener's
 * Widget) belongs to the opener, not to the prompt's reply. The judges read only what the Learner saw.
 */

const me = OWNER_LEARNER_ID;
const text = (t: string) => [{ type: "text", text: t }];
const choices = (...labels: string[]) => ({ choices: labels.map((label) => ({ label })) });

/** A Session whose opener finished at seq 2 (so promptSeq is 2), with the opener's Choices and Widget stored after it. */
async function opened(): Promise<{ db: Db; pool: PGlite; sessionId: number; promptSeq: number }> {
  const db = await testDb();
  const [s] = await db.insert(sessions).values({ learnerId: me, instructions: "i", tools: [], model: "claude-opus-5-5", effort: "low", fingerprint: "f", topicId: "num-percent-bps" }).returning({ id: sessions.id });
  await db.insert(messages).values([
    { sessionId: s.id, seq: 1, role: "user", content: "(start the Topic)" },
    { sessionId: s.id, seq: 2, role: "assistant", content: text("Picture a bank quoting a rate.") },
  ]);
  await db.insert(sessionItems).values([
    { learnerId: me, sessionId: s.id, afterSeq: 2, kind: "reply_choices", data: choices("Opener A", "Opener B", "Opener C") },
    { learnerId: me, sessionId: s.id, afterSeq: 2, kind: "widget_shown", data: { code: "root = Card()", title: "Opener Widget", recipe: "story" } },
  ]);
  return { db, pool: (db as unknown as { $client: PGlite }).$client, sessionId: s.id, promptSeq: 2 };
}

describe("[S3] the Delight eval reads only the prompt's own turn", () => {
  it("counts no Choices when the prompt's turn stored none, even though the opener's sit at promptSeq", async () => {
    const { db, pool, sessionId, promptSeq } = await opened();
    await db.insert(messages).values([
      { sessionId, seq: 3, role: "user", content: "what even is a basis point lol" },
      { sessionId, seq: 4, role: "assistant", content: text("A basis point is a hundredth of a point.") },
    ]);
    const d = await readDelight(pool, sessionId, promptSeq, "none");
    expect(d.choices).toBeNull();
    expect(d.choicesCount).toBeNull();
  });

  it("reads the Choices the prompt's turn stored", async () => {
    const { db, pool, sessionId, promptSeq } = await opened();
    await db.insert(messages).values([
      { sessionId, seq: 3, role: "user", content: "what even is a basis point lol" },
      { sessionId, seq: 4, role: "assistant", content: text("A basis point is a hundredth of a point.") },
    ]);
    await db.insert(sessionItems).values({ learnerId: me, sessionId, afterSeq: 4, kind: "reply_choices", data: choices("Show me", "Next") });
    const d = await readDelight(pool, sessionId, promptSeq, "none");
    expect(d.choices.map((c: { label: string }) => c.label)).toEqual(["Show me", "Next"]);
    expect(d.choicesCount).toBe(2);
  });

  it("finds no Widget lane when only the opener showed one", async () => {
    const { db, pool, promptSeq, sessionId } = await opened();
    await db.insert(messages).values([
      { sessionId, seq: 3, role: "user", content: "show me" },
      { sessionId, seq: 4, role: "assistant", content: text("Here is the idea in words.") },
    ]);
    const lane = await readLane(pool, me, promptSeq);
    expect(lane.lane).toBe("none");
  });

  it("judges the reply the Learner saw: a held-back draft and its correction are left out", async () => {
    const { db, pool, sessionId, promptSeq } = await opened();
    await db.insert(messages).values([
      { sessionId, seq: 3, role: "user", content: "what even is a basis point lol" },
      { sessionId, seq: 4, role: "assistant", content: text("Work out 0.4 % in basis points and type it in.") },
      { sessionId, seq: 5, role: "user", content: "(correction: no sums)" },
      { sessionId, seq: 6, role: "assistant", content: text("Traders say a basis point is a hundredth of a point.") },
    ]);
    await db.insert(replyChecks).values({ sessionId, turnSeq: 3, words: 9, cap: 120, retried: true, rejectedSeqs: [4, 5], shownText: "Traders say a basis point is a hundredth of a point." });
    const d = await readDelight(pool, sessionId, promptSeq, "none");
    expect(d.reply).toBe("Traders say a basis point is a hundredth of a point.");
  });

  it("drops the rejected rows when the record has no shown text to read", async () => {
    const { db, pool, sessionId, promptSeq } = await opened();
    await db.insert(messages).values([
      { sessionId, seq: 3, role: "user", content: "what even is a basis point lol" },
      { sessionId, seq: 4, role: "assistant", content: text("Work out 0.4 % in basis points.") },
      { sessionId, seq: 5, role: "assistant", content: text("A basis point is a hundredth of a point.") },
    ]);
    await db.insert(replyChecks).values({ sessionId, turnSeq: 3, words: 9, cap: 120, rejectedSeqs: [4], shownText: "" });
    const d = await readDelight(pool, sessionId, promptSeq, "none");
    expect(d.reply).toBe("A basis point is a hundredth of a point.");
  });

  it("joins the turn's replies when no reply check was recorded", async () => {
    const { db, pool, sessionId, promptSeq } = await opened();
    await db.insert(messages).values([
      { sessionId, seq: 3, role: "user", content: "what even is a basis point lol" },
      { sessionId, seq: 4, role: "assistant", content: text("A basis point is a hundredth of a point.") },
    ]);
    const d = await readDelight(pool, sessionId, promptSeq, "none");
    expect(d.reply).toBe("A basis point is a hundredth of a point.");
  });
});

describe("[S3] the Widget the prompt's own turn showed (bar 1, A Widget with every reply)", () => {
  it("finds the Widget the prompt's turn stored after its reply, not the opener's", async () => {
    const { db, pool, sessionId, promptSeq } = await opened();
    await db.insert(messages).values([
      { sessionId, seq: 3, role: "user", content: "what even is a basis point lol" },
      { sessionId, seq: 4, role: "assistant", content: text("Here is a basis point on a ruler.") },
    ]);
    await db.insert(sessionItems).values({ learnerId: me, sessionId, afterSeq: 3, kind: "widget_shown", data: { code: "root = Ruler()", title: "Basis point ruler", recipe: "lingo" } });
    const lane = await readLane(pool, me, promptSeq);
    expect(lane.lane).toBe("recipe");
    expect(lane.code).toBe("root = Ruler()");
    expect(lane.title).toBe("Basis point ruler");
    expect(lane.widgetsShown).toBe(1);
  });

  it("names a composed Widget's lane from its source", async () => {
    const { db, pool, sessionId, promptSeq } = await opened();
    await db.insert(messages).values([
      { sessionId, seq: 3, role: "user", content: "draw it" },
      { sessionId, seq: 4, role: "assistant", content: text("Here it is.") },
    ]);
    await db.insert(sessionItems).values({ learnerId: me, sessionId, afterSeq: 4, kind: "widget_shown", data: { code: "root = Chart()", title: "Composed", source: "compose" } });
    const lane = await readLane(pool, me, promptSeq);
    expect(lane.lane).toBe("compose");
    expect(lane.code).toBe("root = Chart()");
  });

  it("never counts a Companion Widget as the Tutor's lane: a reply with only code's Companion has lane none", async () => {
    const { db, pool, sessionId, promptSeq } = await opened();
    await db.insert(messages).values([
      { sessionId, seq: 3, role: "user", content: "what even is a basis point lol" },
      { sessionId, seq: 4, role: "assistant", content: text("A basis point is a hundredth of a point.") },
    ]);
    const lingo = { code: "root = Lingo()", title: "Basis point", recipe: "lingo_card", source: "companion", companion: "lingo", companionKey: "basis point" };
    await db.insert(sessionItems).values({ learnerId: me, sessionId, afterSeq: 4, kind: "widget_shown", data: lingo });
    const lane = await readLane(pool, me, promptSeq);
    expect(lane.lane).toBe("none");
    expect(lane.code).toBeUndefined();
    // The Delight judges still see the Widget the Learner saw.
    expect(lane.companion).toEqual({ kind: "lingo", code: "root = Lingo()", title: "Basis point", recipe: "lingo_card" });
  });

  it("reads the Tutor's own Widget as the lane even when a Companion was stored after it", async () => {
    const { db, pool, sessionId, promptSeq } = await opened();
    await db.insert(messages).values([
      { sessionId, seq: 3, role: "user", content: "draw it" },
      { sessionId, seq: 4, role: "assistant", content: text("Here it is.") },
    ]);
    await db.insert(sessionItems).values([
      { learnerId: me, sessionId, afterSeq: 3, kind: "widget_shown", data: { code: "root = Ruler()", title: "Basis point ruler", recipe: "lingo", source: "recipe" } },
      { learnerId: me, sessionId, afterSeq: 4, kind: "widget_shown", data: { code: "root = Case()", title: "Case", recipe: "case_card", source: "companion", companion: "case" } },
    ]);
    const lane = await readLane(pool, me, promptSeq);
    expect(lane.lane).toBe("recipe");
    expect(lane.code).toBe("root = Ruler()");
    expect(lane.widgetsShown).toBe(1);
  });

  it("gives the lane as the Widget source when reply_checks has no widget_source column, and says so", async () => {
    const { db, pool, sessionId, promptSeq } = await opened();
    await db.insert(messages).values([
      { sessionId, seq: 3, role: "user", content: "what even is a basis point lol" },
      { sessionId, seq: 4, role: "assistant", content: text("Here is a basis point on a ruler.") },
    ]);
    await db.insert(sessionItems).values({ learnerId: me, sessionId, afterSeq: 3, kind: "widget_shown", data: { code: "root = Ruler()", title: "Basis point ruler", recipe: "lingo" } });
    // A branch from before E4a's migration: drop the column here, so the test holds whether or not the real migrations
    // have added it yet (E4b-T3).
    await pool.exec("alter table reply_checks drop column if exists widget_source");
    const lane = await readLane(pool, me, promptSeq);
    const d = await readDelight(pool, sessionId, promptSeq, lane.lane);
    expect(d.widgetSource).toBe("recipe");
    expect(d.widgetSourceFrom).toMatch(/^lane /);
    const none = await readDelight(pool, sessionId, promptSeq, "none");
    expect(none.widgetSource).toBe("none");
  });

  it("reads reply_checks.widget_source for the prompt's turn once the column exists", async () => {
    const { db, pool, sessionId, promptSeq } = await opened();
    await db.insert(messages).values([
      { sessionId, seq: 3, role: "user", content: "what even is a basis point lol" },
      { sessionId, seq: 4, role: "assistant", content: text("A basis point is a hundredth of a point.") },
    ]);
    await pool.exec("alter table reply_checks add column if not exists widget_source text");
    await db.insert(replyChecks).values({ sessionId, turnSeq: 1, words: 6, cap: 120, shownText: "Picture a bank quoting a rate." });
    await db.insert(replyChecks).values({ sessionId, turnSeq: 3, words: 9, cap: 120, shownText: "A basis point is a hundredth of a point." });
    await pool.query("update reply_checks set widget_source = $1 where session_id = $2 and turn_seq = $3", ["story", sessionId, 1]);
    await pool.query("update reply_checks set widget_source = $1 where session_id = $2 and turn_seq = $3", ["lingo", sessionId, 3]);
    const d = await readDelight(pool, sessionId, promptSeq, "none");
    expect(d.widgetSource).toBe("lingo");
    expect(d.widgetSourceFrom).toBe("reply_checks");
  });
});

describe("[S3] the Delight eval reads what a prompt's Tutor turns cost", () => {
  it("returns every step the app recorded for the Learner's Sessions, and no turn totals or other Learner's steps", async () => {
    const { db, pool, sessionId } = await opened();
    const [other] = await db.insert(learners).values({ name: "someone else" }).returning({ id: learners.id });
    const [theirs] = await db.insert(sessions).values({ learnerId: other.id, instructions: "i", tools: [], model: "claude-opus-5-5", effort: "low", fingerprint: "f" }).returning({ id: sessions.id });
    const row = (sid: number, turnSeq: number, kind: "step" | "turn", step: number | null, inputTokens: number) => ({ sessionId: sid, turnSeq, kind, step, model: "claude-opus-5-5", inputTokens, outputTokens: 100, cacheReadTokens: 50, cacheWriteTokens: 25, tools: [], durationMs: 1 });
    await db.insert(usageRows).values([
      row(sessionId, 1, "step", 1, 1000),
      row(sessionId, 1, "step", 2, 2000),
      row(sessionId, 1, "turn", null, 3000),
      row(sessionId, 3, "step", 1, 4000),
      row(theirs.id, 1, "step", 1, 9999),
    ]);
    const steps = await tutorSteps(pool, me);
    expect(steps.map((s: { inputTokens: number }) => s.inputTokens).sort((a: number, b: number) => a - b)).toEqual([1000, 2000, 4000]);
    expect(steps[0]).toEqual({ model: "claude-opus-5-5", inputTokens: expect.any(Number), outputTokens: 100, cacheReadTokens: 50, cacheWriteTokens: 25 });
  });
});

describe("[S3] the Delight eval sees a Learner's turn still running (E4b-C2)", () => {
  it("counts only the Learner's running turns, not ended ones or another Learner's", async () => {
    const { db, pool } = await opened();
    const [other] = await db.insert(learners).values({ name: "someone else" }).returning({ id: learners.id });
    await db.insert(turns).values([
      { learnerId: me, status: "finished", finishedAt: new Date() },
      { learnerId: me, status: "cut_off" },
      { learnerId: other.id, status: "running" },
    ]);
    expect(await openTurns(pool, me)).toBe(0);
    await db.insert(turns).values({ learnerId: me, status: "running" });
    expect(await openTurns(pool, me)).toBe(1);
  });
});
