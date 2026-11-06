import { describe, expect, it } from "vitest";
import { parseCourseMap } from "@/course/map";
import { checkResults, learners, messages, noteItems, OWNER_LEARNER_ID, sessions, topicProgress, widgetState } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { restartTopic } from "./restart";
import { addLine } from "./notes";
import { loadNotebook } from "./notebook";
import { saveToNotes } from "./saved";

/**
 * Seam 2 (spec 2026-11-05 B2a): the Notebook has one row per Topic, in course order, for the Topics with a Session or a
 * note (all of them with `all`). Four Topics, one Older session and a second Learner, on in-memory Postgres.
 */

const topicYaml = (id: string, path: number, extra = "") => `
id: ${id}
title: Topic ${id.toUpperCase()}
stage: foundation
path: ${path}
cases:
  - { id: ${id}-case, title: A case, asOf: 2018-10-24, story: Then., reveal: Later. }
concept: Idea.
principle: Lesson.
checks:
  - { id: ${id}-check, kind: conversation, prompt: Explain., passCriteria: Explains. }
${extra}`;

const WIDGET = `widgets:
  - id: w
    code: |
      root = Widget("Play", [a, b])
      $a = 1
      $b = 2
      a = Slider("a", "A", 0, 10, 1, $a, "percent")
      b = Slider("b", "B", 0, 10, 1, $b, "percent")
found:
  - { when: { kind: set, widget: w, variable: $a }, text: You moved the first slider. }
  - { when: { kind: set, widget: w, variable: $b }, text: You moved the second slider. }`;

const map = parseCourseMap([
  { name: "a.yaml", text: topicYaml("a", 1, WIDGET) },
  { name: "b.yaml", text: topicYaml("b", 2) },
  { name: "c.yaml", text: topicYaml("c", 3) },
  { name: "d.yaml", text: topicYaml("d", 4) },
]).map!;

async function session(db: Db, topicId: string | null, learnerId: number, opts: { older?: boolean; at?: Date } = {}): Promise<number> {
  const [s] = await db
    .insert(sessions)
    .values({ learnerId, topicId, older: opts.older ?? false, instructions: "i", tools: [], model: "m", effort: "medium", fingerprint: "f", ...(opts.at && { createdAt: opts.at }) })
    .returning();
  const title = topicId ? `Topic ${topicId.toUpperCase()}` : "none";
  await db.insert(messages).values([
    { sessionId: s.id, seq: 0, role: "user", content: [{ type: "text", text: `Topic: ${title} (Foundation Stage).\nTeaching Step: concept` }, { type: "text", text: "Explain it." }] },
    { sessionId: s.id, seq: 1, role: "assistant", content: [{ type: "text", text: "Here is the idea." }] },
  ]);
  return s.id;
}

async function seed() {
  const db = await testDb();
  const [second] = await db.insert(learners).values({ name: "second" }).returning();
  // A: passed, a Session, two found lines, one saved reply.
  const a = await session(db, "a", OWNER_LEARNER_ID);
  await db.insert(topicProgress).values({ learnerId: OWNER_LEARNER_ID, topicId: "a", step: "principle", status: "passed" });
  await db.insert(widgetState).values({ sessionId: a, widgetKey: "w", learnerId: OWNER_LEARNER_ID, values: { $a: 3, $b: 4 }, ticked: [] });
  expect(await saveToNotes(db, map, { kind: "reply", sessionId: a, turnSeq: 0 }, new Date(), OWNER_LEARNER_ID)).toMatchObject({ ok: true });
  // B: in progress with a Session.
  const b = await session(db, "b", OWNER_LEARNER_ID);
  await db.insert(topicProgress).values({ learnerId: OWNER_LEARNER_ID, topicId: "b", step: "concept", status: "in_progress" });
  // C: no Session, one own line. D: untouched.
  await addLine(db, map, "c", "My own line", new Date(), OWNER_LEARNER_ID);
  const older = await session(db, null, OWNER_LEARNER_ID, { older: true, at: new Date("2026-09-05T08:00:00Z") });
  // Learner 2 has Topic A in progress, and a line on D.
  await session(db, "a", second.id);
  await db.insert(topicProgress).values({ learnerId: second.id, topicId: "a", step: "concept", status: "in_progress" });
  await addLine(db, map, "d", "Second learner's line", new Date(), second.id);
  return { db, a, b, older, second };
}

describe("the Notebook", () => {
  it("has one row per Topic with a Session or a note, in course order", async () => {
    const { db, a, b, older } = await seed();
    const nb = await loadNotebook(db, map, OWNER_LEARNER_ID, { all: false });
    expect(nb.rows.map((r) => r.topicId)).toEqual(["a", "b", "c"]);
    const [ra, rb, rc] = nb.rows;
    expect(ra).toMatchObject({ title: "Topic A", status: "passed", action: "read", sessionId: a });
    expect(ra.found).toEqual(["You moved the first slider.", "You moved the second slider."]);
    expect(ra.note.saved).toHaveLength(1);
    expect(rb).toMatchObject({ status: "in_progress", action: "resume", sessionId: b });
    expect(rc).toMatchObject({ status: "not_started", action: null, sessionId: null });
    expect(rc.note.lines.map((l) => l.text)).toEqual(["My own line"]);
    expect(nb.older.map((o) => o.id)).toEqual([older]);
  });

  it("lists every Topic with all, so a line can be added to one not reached yet", async () => {
    const { db } = await seed();
    const nb = await loadNotebook(db, map, OWNER_LEARNER_ID, { all: true });
    expect(nb.rows.map((r) => r.topicId)).toEqual(["a", "b", "c", "d"]);
    expect(nb.rows[3]).toMatchObject({ action: null, sessionId: null, status: "not_started" });
  });

  it("never shows another Learner's data", async () => {
    const { db, second } = await seed();
    const mine = await loadNotebook(db, map, OWNER_LEARNER_ID, { all: true });
    expect(JSON.stringify(mine)).not.toContain("Second learner's line");
    const theirs = await loadNotebook(db, map, second.id, { all: false });
    expect(theirs.rows.map((r) => r.topicId)).toEqual(["a", "d"]);
    expect(theirs.rows[0]).toMatchObject({ status: "in_progress", action: "resume" });
    expect(theirs.rows[0].note.saved).toEqual([]);
    expect(theirs.older).toEqual([]);
    expect(await db.select().from(noteItems)).toHaveLength(3);
  });

  it("an earlier attempt is listed as one, under its Topic's Earlier attempts and not under Older sessions", async () => {
    const { db, a, older } = await seed();
    await db.insert(checkResults).values({ learnerId: OWNER_LEARNER_ID, topicId: "a", checkId: "a-check", passed: true });
    expect(await restartTopic(db, map, OWNER_LEARNER_ID, "a", new Date("2026-11-04T10:00:00Z"))).toMatchObject({ restarted: true, oldSessionId: a });
    const nb = await loadNotebook(db, map, OWNER_LEARNER_ID, { all: false });
    expect(nb.older.map((o) => o.id)).toEqual([older]);
    const ra = nb.rows.find((r) => r.topicId === "a")!;
    expect(ra).toMatchObject({ status: "not_started", action: null, sessionId: null });
    expect(ra.earlier).toEqual([
      { sessionId: a, topicId: "a", attemptNo: 1, date: new Date("2026-11-04T10:00:00Z"), status: "passed", checksPassed: 1, checksTotal: 1, found: ["You moved the first slider.", "You moved the second slider."] },
    ]);
    expect(nb.rows.find((r) => r.topicId === "b")!.earlier).toEqual([]);
  });

  it("a Topic with only an earlier attempt still has a row, newest attempt first", async () => {
    const db = await testDb();
    await db.insert(topicProgress).values({ learnerId: OWNER_LEARNER_ID, topicId: "d", step: "concept", status: "in_progress" });
    const first = await session(db, "d", OWNER_LEARNER_ID);
    await restartTopic(db, map, OWNER_LEARNER_ID, "d", new Date("2026-11-02T10:00:00Z"));
    await db.insert(topicProgress).values({ learnerId: OWNER_LEARNER_ID, topicId: "d", step: "concept", status: "in_progress" });
    const second = await session(db, "d", OWNER_LEARNER_ID);
    await restartTopic(db, map, OWNER_LEARNER_ID, "d", new Date("2026-11-04T10:00:00Z"));
    const nb = await loadNotebook(db, map, OWNER_LEARNER_ID, { all: false });
    const rd = nb.rows.find((r) => r.topicId === "d")!;
    expect(rd.earlier.map((e) => [e.sessionId, e.attemptNo, e.status])).toEqual([[second, 2, "not_finished"], [first, 1, "not_finished"]]);
  });
});
