import { describe, expect, it } from "vitest";
import { insightAttempts, misconceptions, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { addLine, editLine, loadNotes, removeLine } from "./notes";

const map = presentValueOnly({ withConnections: true });
const topic = map.topic("present-value")!;
const insight = topic.insight!;

async function pass(db: Db) {
  await db.insert(topicProgress).values({ topicId: topic.id, step: "principle", status: "passed" });
}
async function settle(db: Db, released: "found" | "told", words: string) {
  await db.insert(insightAttempts).values({ topicId: topic.id, reported: released === "found" ? "found" : "asked_to_be_told", released, words, toolCallId: `t-${released}` });
}
const note = async (db: Db) => (await loadNotes(db, map)).find((n) => n.topicId === topic.id)!;

describe("a Topic Note", () => {
  it("lists every Topic in course order and fills in nothing before the Topic is passed", async () => {
    const db = await testDb();
    await db.insert(topicProgress).values({ topicId: topic.id, step: "concept", status: "in_progress" });
    await settle(db, "found", "Waiting makes it worth less");
    const notes = await loadNotes(db, map);
    expect(notes.map((n) => n.topicId)).toEqual(map.topics.map((t) => t.id));
    expect(notes[0].passed).toBe(false);
    expect(notes[0].filled).toBeUndefined();
  });

  it("is filled in by code once the Topic is passed: Formula Cards with example numbers, principle, Connections and mistakes", async () => {
    const db = await testDb();
    await pass(db);
    await db.insert(misconceptions).values({ topicId: topic.id, description: "Added the interest instead of dividing", model: "m", toolCallId: "mc1" });
    const filled = (await note(db)).filled!;
    expect(filled.formulas.map((f) => f.formulaId)).toEqual(topic.formulas);
    expect(filled.formulas.length).toBeGreaterThan(0);
    // Every card carries a number for each of its symbols, so it can be drawn and worked out by code.
    for (const f of filled.formulas) expect(Object.keys(f.values).length).toBeGreaterThan(0);
    expect(filled.principle).toBe(topic.principle);
    expect(filled.connections.map((c) => c.text)).toEqual(topic.connections.map((c) => c.text));
    expect(filled.connections.length).toBeGreaterThan(0);
    expect(filled.connections[0].titles.length).toBeGreaterThan(0);
    expect(filled.mistakes).toEqual(["Added the interest instead of dividing"]);
  });

  it("shows the Learner's own words for an Insight they found, without the written Insight", async () => {
    const db = await testDb();
    await pass(db);
    await settle(db, "found", "Waiting makes it worth less");
    const filled = (await note(db)).filled!;
    expect(filled.insight).toEqual({ ownWords: "Waiting makes it worth less" });
  });

  it("shows the written Insight beside the Learner's words when the Tutor had to tell it", async () => {
    const db = await testDb();
    await pass(db);
    await settle(db, "told", "Just tell me");
    const filled = (await note(db)).filled!;
    expect(filled.insight).toEqual({ ownWords: "Just tell me", written: insight.written });
  });

  it("is built from the current Topic file on every read", async () => {
    const db = await testDb();
    await pass(db);
    const edited = presentValueOnly({ withConnections: true });
    edited.topic("present-value")!.principle = "A new principle.";
    expect((await loadNotes(db, edited))[0].filled!.principle).toBe("A new principle.");
    expect((await note(db)).filled!.principle).toBe(topic.principle);
  });
});

describe("the Learner's own lines", () => {
  it("are added to, edited on and deleted from any Topic, passed or not", async () => {
    const db = await testDb();
    const added = await addLine(db, map, topic.id, "  Discount rate is the price of waiting  ");
    expect(added.ok && added.line.text).toBe("Discount rate is the price of waiting");
    if (!added.ok) throw new Error("not added");
    expect((await note(db)).lines.map((l) => l.text)).toEqual(["Discount rate is the price of waiting"]);
    expect((await note(db)).filled).toBeUndefined();

    const edited = await editLine(db, added.line.id, "Rate = price of waiting");
    expect(edited.ok && edited.line.text).toBe("Rate = price of waiting");
    expect((await note(db)).lines.map((l) => l.text)).toEqual(["Rate = price of waiting"]);

    expect(await removeLine(db, added.line.id)).toBe(true);
    expect((await note(db)).lines).toEqual([]);
    expect(await removeLine(db, added.line.id)).toBe(false);
  });

  it("refuse empty or over-long text, an unknown Topic and an unknown line", async () => {
    const db = await testDb();
    expect((await addLine(db, map, topic.id, "   ")).ok).toBe(false);
    expect((await addLine(db, map, topic.id, "x".repeat(2001))).ok).toBe(false);
    expect((await addLine(db, map, "no-such-topic", "hello")).ok).toBe(false);
    expect((await editLine(db, 999, "hello")).ok).toBe(false);
    const added = await addLine(db, map, topic.id, "keep");
    if (!added.ok) throw new Error("not added");
    expect((await editLine(db, added.line.id, "")).ok).toBe(false);
    expect((await note(db)).lines.map((l) => l.text)).toEqual(["keep"]);
  });
});
