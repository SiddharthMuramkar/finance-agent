import type { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
// @ts-expect-error the eval's reads are a plain .mjs script with no types
import { readDelight, readLane } from "../../../scripts/eval-reads.mjs";
import { messages, OWNER_LEARNER_ID, replyChecks, sessionItems, sessions } from "@/db/schema";
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
