import { describe, expect, it } from "vitest";
import { parseCourseMap } from "@/course/map";
import { messages, OWNER_LEARNER_ID, sessionItems, sessions } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { splitReply } from "@/widgets/split";
import { loadNotes } from "./notes";
import { saveToNotes } from "./saved";

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

const CODE = `root = Widget("Loan cost", [rate])
$rate = 5
rate = Slider("rate", "Interest rate", 0, 10, 0.25, $rate, "percent")`;

async function shownSession() {
  const db = await testDb();
  const [s] = await db.insert(sessions).values({ learnerId: OWNER_LEARNER_ID, instructions: "i", tools: [], model: "m", effort: "medium", fingerprint: "f" }).returning();
  await db.insert(messages).values([
    { sessionId: s.id, seq: 0, role: "user", content: [{ type: "text", text: "Topic: PV (Foundation Stage).\nTeaching Step: concept" }, { type: "text", text: "Show me." }] },
    { sessionId: s.id, seq: 1, role: "assistant", content: [{ type: "text", text: "Here it is." }] },
  ]);
  await db.insert(sessionItems).values({ learnerId: OWNER_LEARNER_ID, sessionId: s.id, afterSeq: 1, kind: WIDGET_SHOWN, data: { id: "t1", recipe: "loan_cost", params: {}, title: "Loan cost", code: CODE, source: "recipe" } });
  return { db, sessionId: s.id };
}

describe("Save to notes keeps a shown Widget", () => {
  it("saves a reply with its widget_shown Widget and draws it on Notes", async () => {
    const { db, sessionId } = await shownSession();
    expect((await saveToNotes(db, map, { kind: "reply", sessionId, turnSeq: 0 }, new Date(), OWNER_LEARNER_ID)).ok).toBe(true);
    const item = (await loadNotes(db, map, OWNER_LEARNER_ID))[0].saved[0];
    expect(item.kind === "reply" && item.text).toContain("Here it is.");
    const widgets = item.kind === "reply" ? splitReply(item.text).filter((p) => p.type === "widget") : [];
    expect(widgets).toHaveLength(1);
  });

  it("saves the shown Widget by itself too, with its settings", async () => {
    const { db, sessionId } = await shownSession();
    const saved = await saveToNotes(db, map, { kind: "widget", sessionId, turnSeq: 0, widgetIndex: 0, settings: { $rate: 7 } }, new Date(), OWNER_LEARNER_ID);
    expect(saved.ok).toBe(true);
    const item = (await loadNotes(db, map, OWNER_LEARNER_ID))[0].saved[0];
    expect(item.kind === "widget" && item.code).toContain("$rate = 7");
  });
});
