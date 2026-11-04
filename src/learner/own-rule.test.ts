import { describe, expect, it } from "vitest";
import { noteItems, OWNER_LEARNER_ID, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { OWN_RULE_SAVED } from "@/tutor/own-rule-item";
import { saveItemAfterLatest } from "@/tutor/session-items";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { editLine, loadNotes, removeLine } from "./notes";
import { learnerSummary } from "./memory";
import { MAX_RULE_LENGTH, ownRules, saveOwnRule } from "./own-rule";

const me = OWNER_LEARNER_ID;
const map = presentValueOnly({ withoutQuiz: true });
const topic = map.topic("present-value")!;

async function session(db: Db, topicId: string) {
  const [row] = await db.insert(sessions).values({ learnerId: me, topicId, instructions: "x", tools: [], model: "m", effort: "low", fingerprint: "f", older: false }).returning();
  return row.id;
}
const rule = (db: Db, sessionId: number, text: string, turnSeq = 0, topicId = topic.id) =>
  saveOwnRule(db, { learnerId: me, topicId, sessionId, turnSeq, text, skillId: null }, new Date());

describe("the Learner's own rule", () => {
  it("is saved as a note item with its words, and listed with its Topic", async () => {
    const db = await testDb();
    const saved = await rule(db, await session(db, topic.id), "  change × 100 then divide by original ");
    expect(saved).toMatchObject({ topicId: topic.id, text: "change × 100 then divide by original", skillId: null });
    expect(await ownRules(db, me)).toMatchObject([{ id: saved.id, topicId: topic.id, text: "change × 100 then divide by original" }]);
    expect(await ownRules(db, me, "another-topic")).toEqual([]);
  });

  it("takes one rule per turn and no more than 300 characters", async () => {
    const db = await testDb();
    const s = await session(db, topic.id);
    await rule(db, s, "first");
    await expect(rule(db, s, "second", 0)).rejects.toThrow("already saved a rule");
    await expect(rule(db, s, "x".repeat(MAX_RULE_LENGTH + 1), 1)).rejects.toThrow("at most 300");
    await expect(rule(db, s, "   ", 2)).rejects.toThrow();
  });

  it("shows the Skill the save's Session item carries", async () => {
    const db = await testDb();
    const s = await session(db, topic.id);
    const saved = await rule(db, s, "points times 100", 0);
    await saveItemAfterLatest(db, me, s, { kind: OWN_RULE_SAVED, data: { noteId: saved.id, topicId: topic.id, text: saved.text, skillId: "pts-to-bp" } }, new Date());
    expect((await ownRules(db, me))[0].skillId).toBe("pts-to-bp");
  });

  it("is another Learner's no business: only this Learner's rules are listed, edited and removed", async () => {
    const db = await testDb();
    const saved = await rule(db, await session(db, topic.id), "mine");
    expect(await ownRules(db, me + 99)).toEqual([]);
    expect(await removeLine(db, saved.id, me + 99)).toBe(false);
    expect((await editLine(db, saved.id, "x", new Date(), me + 99)).ok).toBe(false);
  });
});

describe("a Topic Note with the Learner's own rule", () => {
  it("lists the rule among the Topic's lines with ownRule set, before any other note is filled in", async () => {
    const db = await testDb();
    await db.insert(noteItems).values({ learnerId: me, topicId: topic.id, kind: "line", text: "My own line" });
    await rule(db, await session(db, topic.id), "change × 100 then divide by original");
    const note = (await loadNotes(db, map, me)).find((n) => n.topicId === topic.id)!;
    expect(note.passed).toBe(false);
    expect(note.lines.map((l) => [l.text, l.ownRule ?? false])).toEqual([
      ["My own line", false],
      ["change × 100 then divide by original", true],
    ]);
    // A saved reply or Widget list never holds a rule.
    expect(note.saved).toEqual([]);
  });

  it("lets the rule be edited and removed like any line, and removal takes it off the note", async () => {
    const db = await testDb();
    const saved = await rule(db, await session(db, topic.id), "change × 100 then divide");
    const edited = await editLine(db, saved.id, "change × 100 then divide by the old one", new Date(), me);
    expect(edited).toMatchObject({ ok: true, line: { text: "change × 100 then divide by the old one", ownRule: true } });
    expect(await removeLine(db, saved.id, me)).toBe(true);
    expect((await loadNotes(db, map, me)).find((n) => n.topicId === topic.id)!.lines).toEqual([]);
    expect(await removeLine(db, saved.id, me)).toBe(false);
  });

  it("is in the Learner summary, newest five, with the Topic's title", async () => {
    const db = await testDb();
    const s = await session(db, topic.id);
    for (let i = 0; i < 6; i++) await rule(db, s, `rule number ${i}`, i);
    const summary = await learnerSummary(db, map, me);
    const line = summary.split("\n").find((l) => l.startsWith("Rules in the Learner's own words (use them):"))!;
    expect(line).toContain(`${topic.title}: "rule number 5"`);
    expect(line).toContain('"rule number 1"');
    expect(line).not.toContain('"rule number 0"');
  });

  it("adds no rule line to the summary when there is none", async () => {
    const db = await testDb();
    expect(await learnerSummary(db, map, me)).not.toContain("own words");
  });
});
