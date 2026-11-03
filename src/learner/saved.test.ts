import { describe, expect, it } from "vitest";
import { parseCourseMap } from "@/course/map";
import { learners, libraryPassages, messages, noteItems, OWNER_LEARNER_ID, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { importLibrary, type LibraryFile } from "@/library/ingest";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { HIDDEN_SOURCE_TITLE } from "@/tutor/citations";
import { declaredSettings } from "@/widgets/settings";
import { saveCheckResult, saveFinishedStep } from "./memory";
import { addLine } from "./notes";
import { loadNotes } from "./notes";
import { EXPLORE_INDEX, loadSaved, removeSaved, saveToNotes } from "./saved";

const map = parseCourseMap([
  {
    name: "pv.yaml",
    text: `
id: pv
title: PV
stage: foundation
path: 1
cases:
  - { id: jackpot, title: A jackpot, asOf: 2018-10-24, story: Then., reveal: Later. }
concept: Idea.
principle: Lesson.
checks:
  - { id: pv-check, kind: conversation, prompt: Explain., passCriteria: Explains. }
`,
  },
]).map!;

const blog: LibraryFile = {
  source: {
    id: "a-blog",
    title: "A blog",
    kind: "dated",
    licence: "All rights reserved; short quotes with credit",
    licenceUrl: "https://example.org/terms",
    credit: "A. Writer, A blog",
    url: "https://example.org/blog",
    fetchedOn: "2026-11-02",
  },
  passages: [
    { ref: "after", heading: "The jackpot winner", url: "https://example.org/blog/2", publishedOn: "2019-03-05", text: "The jackpot winner took the cash option rather than the annuity." },
  ],
};

const WIDGET = `root = Widget("Cash now or later", [rate])
$rate = 5
rate = Slider("rate", "Interest rate", 0, 10, 0.25, $rate, "percent")`;
const fence = (code: string) => ["```openui-lang", code, "```"].join("\n");

/** A Session whose one turn (user at seq 0, reply at seq 1) was taught under the Topic "PV". */
async function session(db: Db, replyContent: unknown, topicTitle = "PV"): Promise<number> {
  const [s] = await db.insert(sessions).values({ instructions: "i", tools: [], model: "m", effort: "medium", fingerprint: "f" }).returning();
  await db.insert(messages).values([
    { sessionId: s.id, seq: 0, role: "user", content: [{ type: "text", text: `Topic: ${topicTitle} (Foundation Stage).\nTeaching Step: concept` }, { type: "text", text: "Explain it." }] },
    { sessionId: s.id, seq: 1, role: "assistant", content: replyContent },
  ]);
  return s.id;
}
const textReply = (text: string) => [{ type: "text", text }];
const noteOf = async (db: Db, m = map) => (await loadNotes(db, m))[0];

describe("Save to notes: replies", () => {
  it("puts a saved reply on the Topic it was taught under, straight away and before the Topic is passed", async () => {
    const db = await testDb();
    const sessionId = await session(db, textReply("Discounting is the price of waiting."));
    const saved = await saveToNotes(db, map, { kind: "reply", sessionId, turnSeq: 0 });
    expect(saved.ok && saved.topicId).toBe("pv");
    const note = await noteOf(db);
    expect(note.passed).toBe(false);
    expect(note.saved).toHaveLength(1);
    expect(note.saved[0]).toMatchObject({ kind: "reply", text: "Discounting is the price of waiting." });
  });

  it("saves from an old Session too, under the Topic that Session was on, and saving twice keeps one", async () => {
    const db = await testDb();
    const old = await session(db, textReply("An older explanation."));
    await session(db, textReply("A newer one."));
    await saveToNotes(db, map, { kind: "reply", sessionId: old, turnSeq: 0 });
    await saveToNotes(db, map, { kind: "reply", sessionId: old, turnSeq: 0 });
    expect((await noteOf(db)).saved.map((i) => i.kind === "reply" && i.text)).toEqual(["An older explanation."]);
  });

  it("saves the first reply after a Course Map jump under the new Topic, whose context line is stored after the Learner's message", async () => {
    const topicYaml = (id: string, title: string, path: number) => ({
      name: `${id}.yaml`,
      text: `
id: ${id}
title: ${title}
stage: foundation
path: ${path}
cases:
  - { id: ${id}-case, title: A case, asOf: 2018-10-24, story: Then., reveal: Later. }
concept: Idea.
principle: Lesson.
checks:
  - { id: ${id}-check, kind: conversation, prompt: Explain., passCriteria: Explains. }
`,
    });
    const two = parseCourseMap([topicYaml("pv", "PV", 1), topicYaml("fv", "FV", 2)]).map!;
    const db = await testDb();
    const [s] = await db.insert(sessions).values({ instructions: "i", tools: [], model: "m", effort: "medium", fingerprint: "f" }).returning();
    await db.insert(messages).values([
      { sessionId: s.id, seq: 0, role: "user", content: [{ type: "text", text: "Topic: PV (Foundation Stage).\nTeaching Step: concept" }, { type: "text", text: "Hi." }] },
      { sessionId: s.id, seq: 1, role: "assistant", content: textReply("About PV.") },
      { sessionId: s.id, seq: 2, role: "user", content: "Take me to FV." },
      { sessionId: s.id, seq: 3, role: "system", content: "Topic: FV (Foundation Stage).\nTeaching Step: concept" },
      { sessionId: s.id, seq: 4, role: "assistant", content: textReply("About FV.") },
    ]);
    const saved = await saveToNotes(db, two, { kind: "reply", sessionId: s.id, turnSeq: 2 });
    expect(saved.ok && saved.topicId).toBe("fv");
    const first = await saveToNotes(db, two, { kind: "reply", sessionId: s.id, turnSeq: 0 });
    expect(first.ok && first.topicId).toBe("pv");
  });

  it("refuses a reply that does not exist", async () => {
    const db = await testDb();
    const sessionId = await session(db, textReply("Hello."));
    expect((await saveToNotes(db, map, { kind: "reply", sessionId, turnSeq: 5 })).ok).toBe(false);
    expect((await saveToNotes(db, map, { kind: "reply", sessionId: 999, turnSeq: 0 })).ok).toBe(false);
  });

  it("applies the as-of rule: a saved reply citing a passage dated after the Case's as-of date shows it hidden until the reveal", async () => {
    const db = await testDb();
    await importLibrary(db, blog);
    const [passage] = await db.select().from(libraryPassages);
    const cited = [{ type: "text", text: "The winner chose cash.", citations: [{ type: "search_result_location", source: `/passages/${passage.id}`, title: "The jackpot winner", start_block_index: 0, end_block_index: 0 }] }];
    const sessionId = await session(db, cited);
    await saveToNotes(db, map, { kind: "reply", sessionId, turnSeq: 0 });

    const before = (await noteOf(db)).saved[0];
    expect(before.kind === "reply" && before.text).toContain(HIDDEN_SOURCE_TITLE);
    expect(before.kind === "reply" && before.text).not.toContain("The jackpot winner");

    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step);
    await saveCheckResult(db, map, { checkId: "pv-check", passed: true, evidence: "Explained.", model: "m", toolCallId: "t1" });
    await saveFinishedStep(db, map, "reveal");

    const after = (await noteOf(db)).saved[0];
    expect(after.kind === "reply" && after.text).toContain("The jackpot winner");
    expect(after.kind === "reply" && after.text).toContain("A. Writer, A blog");
  });
});

describe("Save to notes: Widgets", () => {
  it("keeps the numbers on the sliders, takes the code from the stored reply, and reopens with them", async () => {
    const db = await testDb();
    const sessionId = await session(db, textReply(`Try it.\n\n${fence(WIDGET)}\n\nSee?`));
    const saved = await saveToNotes(db, map, { kind: "widget", sessionId, turnSeq: 0, widgetIndex: 0, settings: { $rate: 8, $evil: 99 } });
    expect(saved.ok).toBe(true);
    const item = (await noteOf(db)).saved[0];
    expect(item.kind).toBe("widget");
    if (item.kind !== "widget") return;
    expect(item.title).toBe("Cash now or later");
    expect(declaredSettings(item.code)).toEqual({ $rate: 8 });
    expect(item.code).toContain('rate = Slider("rate", "Interest rate", 0, 10, 0.25, $rate, "percent")');
  });

  it("saving the same Widget again updates its settings rather than adding another", async () => {
    const db = await testDb();
    const sessionId = await session(db, textReply(fence(WIDGET)));
    await saveToNotes(db, map, { kind: "widget", sessionId, turnSeq: 0, widgetIndex: 0, settings: { $rate: 2 } });
    await saveToNotes(db, map, { kind: "widget", sessionId, turnSeq: 0, widgetIndex: 0, settings: { $rate: 9 } });
    const saved = (await noteOf(db)).saved;
    expect(saved).toHaveLength(1);
    expect(saved[0].kind === "widget" && declaredSettings(saved[0].code)).toEqual({ $rate: 9 });
  });

  it("refuses a Widget the reply does not have", async () => {
    const db = await testDb();
    const sessionId = await session(db, textReply(fence(WIDGET)));
    expect((await saveToNotes(db, map, { kind: "widget", sessionId, turnSeq: 0, widgetIndex: 1 })).ok).toBe(false);
    expect((await saveToNotes(db, map, { kind: "widget", sessionId, turnSeq: 0, widgetIndex: -5 })).ok).toBe(false);
    expect(await db.select().from(noteItems)).toEqual([]);
  });

  it("refuses the explore Widget of a Session that does not exist, rather than failing", async () => {
    const db = await testDb();
    const result = await saveToNotes(db, presentValueOnly(), { kind: "widget", sessionId: 999, widgetIndex: EXPLORE_INDEX });
    expect(result.ok).toBe(false);
  });

  it("saves the explore Widget from the Topic file on the current Topic, with its settings", async () => {
    const db = await testDb();
    const real = presentValueOnly();
    const topic = real.topic("present-value")!;
    const declared = declaredSettings(topic.explore!.widget!);
    const [name, start] = Object.entries(declared)[0];
    const saved = await saveToNotes(db, real, { kind: "widget", widgetIndex: EXPLORE_INDEX, settings: { [name]: start + 1 } });
    expect(saved.ok && saved.topicId).toBe("present-value");
    const item = (await loadSaved(db, real)).get("present-value")![0];
    if (item.kind !== "widget") throw new Error("not a Widget");
    expect(declaredSettings(item.code)[name]).toBe(start + 1);
  });
});

describe("taking saved items off a note", () => {
  it("removes a saved reply but never the Learner's own lines", async () => {
    const db = await testDb();
    const sessionId = await session(db, textReply("Keep me."));
    const saved = await saveToNotes(db, map, { kind: "reply", sessionId, turnSeq: 0 });
    const line = await addLine(db, map, "pv", "my own line");
    if (!saved.ok || !line.ok) throw new Error("setup");
    expect(await removeSaved(db, line.line.id)).toBe(false);
    expect(await removeSaved(db, saved.id)).toBe(true);
    const note = await noteOf(db);
    expect(note.saved).toEqual([]);
    expect(note.lines.map((l) => l.text)).toEqual(["my own line"]);
  });
});

describe("saved items for two Learners", () => {
  it("another Learner's Session is no Session to save from, and their saved item is no item to remove", async () => {
    const db = await testDb();
    const [row] = await db.insert(learners).values({ name: "second" }).returning();
    const sessionId = await session(db, textReply("The owner's reply."));
    expect(await saveToNotes(db, map, { kind: "reply", sessionId, turnSeq: 0 }, new Date(), row.id)).toMatchObject({ ok: false, status: 404 });
    expect(await saveToNotes(db, map, { kind: "widget", sessionId, widgetIndex: EXPLORE_INDEX }, new Date(), row.id)).toMatchObject({ ok: false, status: 404 });

    const owners = await saveToNotes(db, map, { kind: "reply", sessionId, turnSeq: 0 });
    if (!owners.ok) throw new Error("setup");
    expect(await removeSaved(db, owners.id, row.id)).toBe(false);
    expect((await noteOf(db)).saved.map((s) => s.kind === "reply" && s.text)).toEqual(["The owner's reply."]);
    expect((await loadNotes(db, map, row.id))[0].saved).toEqual([]);
  });

  it("each Learner saves the same explore Widget once on their own note", async () => {
    const db = await testDb();
    const [row] = await db.insert(learners).values({ name: "second" }).returning();
    const real = presentValueOnly();
    const mine = await saveToNotes(db, real, { kind: "widget", widgetIndex: EXPLORE_INDEX }, new Date(), OWNER_LEARNER_ID);
    const theirs = await saveToNotes(db, real, { kind: "widget", widgetIndex: EXPLORE_INDEX }, new Date(), row.id);
    const again = await saveToNotes(db, real, { kind: "widget", widgetIndex: EXPLORE_INDEX }, new Date(), row.id);
    expect(mine.ok && theirs.ok && again.ok).toBe(true);
    if (!mine.ok || !theirs.ok || !again.ok) return;
    expect(theirs.id).not.toBe(mine.id);
    expect(again.id).toBe(theirs.id);
    expect((await loadSaved(db, real, OWNER_LEARNER_ID)).get("present-value")).toHaveLength(1);
    expect((await loadSaved(db, real, row.id)).get("present-value")).toHaveLength(1);
  });
});

describe("saving the same thing at once", () => {
  it("keeps one row when a reply is saved twice together (double click, two tabs)", async () => {
    const db = await testDb();
    const id = await session(db, textReply("It is worth less later."));
    const [a, b] = await Promise.all([saveToNotes(db, map, { kind: "reply", sessionId: id, turnSeq: 0 }), saveToNotes(db, map, { kind: "reply", sessionId: id, turnSeq: 0 })]);
    expect([a, b]).toEqual([expect.objectContaining({ ok: true }), expect.objectContaining({ ok: true })]);
    expect(a.ok && b.ok && a.id === b.id).toBe(true);
    expect(await db.select().from(noteItems)).toHaveLength(1);
  });

  it("does not stop the Learner from writing many own lines on one Topic", async () => {
    const db = await testDb();
    await addLine(db, map, "pv", "one");
    await addLine(db, map, "pv", "two");
    expect(await db.select().from(noteItems)).toHaveLength(2);
  });
});
