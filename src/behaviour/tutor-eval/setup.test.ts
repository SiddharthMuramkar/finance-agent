import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { checkTabNow } from "@/learner/quiz";
import { skillStates } from "@/learner/skill-state";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { readSettings } from "@/tutor/session-log";
import { loadThread } from "@/tutor/transcript";
import { runTutorTurn, type TurnEvent } from "@/tutor/turn";
import { CASES_DIR, loadCases, type LiveCase } from "./case";
import { DRAWN, noteMark, pendingReason, prepareCase, seenReply } from "./setup";

/**
 * Seam: the Tutor Turn on in-memory Postgres with a scripted model. Each case's state is set up through the real
 * code paths, and what a turn showed is read back as the Learner sees it.
 */
const map = loadCourseMap();
const cases = loadCases(CASES_DIR).cases;
const live = (id: string) => cases.find((c) => c.id === id) as LiveCase;
const settings = { model: "claude-sonnet-5-5", effort: "low", widgetEngine: "off" as const };

async function collect(events: AsyncIterable<TurnEvent>) {
  const out: TurnEvent[] = [];
  for await (const e of events) out.push(e);
  return out;
}

describe("setting a case's state up", () => {
  it("T1: the Check 1 quiz is open with the Session's three questions, their answers kept for the checks, on the case's settings", async () => {
    const db = await testDb();
    const p = await prepareCase(db, live("T1"), { map, settings });
    expect(p.place).toMatchObject({ step: "check", check: { id: "pb-quiz-language" } });
    const tab = await checkTabNow(db, map, new Date(), p.learnerId);
    expect(tab.quiz?.questions.map((q) => q.id)).toEqual(["pb-q-bp-definition", "pb-q-wrong-description", "pb-q-bond-140"]);
    expect(p.openItems.map((i) => i.answer)).toEqual(["60", "The rate is up 50 basis points, which is 12.5 percent of its old level", "1.2 percentage points"]);
    expect(p.ctx).toMatchObject({ step: "check", exampleCurrency: "INR", caseCurrencies: [] });
    expect(p.ctx.internalWords).toEqual(expect.arrayContaining(["num-percent-bps", "pb-quiz-language", "pb-q-bond-140", "rate-change-three-ways", "open_widget"]));
    expect(p.stateNote).toMatch(/quiz is open/);
    expect(p.stateNote).toMatch(/keep back: 60/);
    expect(await readSettings(db)).toMatchObject({ model: "claude-sonnet-5-5", effort: "low", widgetEngine: "off" });
  });

  it("T2: the quiz was submitted with 0 of 3 and no attempt is open", async () => {
    const db = await testDb();
    const p = await prepareCase(db, live("T2"), { map, settings });
    const tab = await checkTabNow(db, map, new Date(), p.learnerId);
    expect(tab.quiz).toBeNull();
    expect(tab.missed?.result).toMatchObject({ correctCount: 0, passed: false });
    expect(p.openItems).toEqual([]);
    expect(p.ctx.replyKind).toBe("worked_example");
    expect(p.stateNote).toMatch(/got 0 of 3/);
  });

  it("T4: the earlier explanation is replayed through the Tutor Turn, at the concept step of Check 1", async () => {
    const db = await testDb();
    const p = await prepareCase(db, live("T4"), { map, settings });
    expect(p.place.step).toBe("concept");
    const { client } = scriptedClient([{ content: [{ type: "text", text: "Short now." }] }]);
    const done = (await collect(runTutorTurn({ db, client, map, learnerId: p.learnerId }, "Explain that more simply"))).at(-1) as Extract<TurnEvent, { type: "done" }>;
    const thread = await loadThread(db, done.ref.sessionId, map, p.learnerId);
    const said = thread.filter((e) => e.role !== "item").map((e) => ("text" in e ? e.text : ""));
    expect(said[0]).toBe("ok I'm ready, teach me this");
    expect(said[1]).toMatch(/^Say a savings rate goes from 4% to 5%/);
    expect(said.at(-1)).toBe("Short now.");
  });

  it("T6: Check 1 is passed on the way to the concept step of Check 2", async () => {
    const db = await testDb();
    const p = await prepareCase(db, live("T6"), { map, settings });
    expect(p.place).toMatchObject({ step: "concept", check: { id: "pb-fed-language" } });
  });

  it("T3 and T7 wait for Percent's Skills; their Skill state is recorded answer by answer, so the ladder sees the right misses in a row", async () => {
    expect(pendingReason(live("T3"), map)).toMatch(/no Skill pts_to_bp/);
    expect(pendingReason(live("T7"), map)).toMatch(/no Skill pts_to_bp/);
    expect(pendingReason(live("T1"), map)).toBeNull();
    const db = await testDb();
    const p = await prepareCase(db, live("T3"), { map, settings });
    const state = (await skillStates(db, p.learnerId, "num-percent-bps")).pts_to_bp;
    // wrong, wrong, right, wrong, then the Learner's 0.3: three earlier misses, and two in a row now.
    expect(state).toMatchObject({ tries: 5, right: 1, missesInRow: 2, methodsUsed: ["restate", "worked"] });
    const db7 = await testDb();
    const p7 = await prepareCase(db7, live("T7"), { map, settings });
    expect((await skillStates(db7, p7.learnerId, "num-percent-bps")).pts_to_bp).toMatchObject({ missesInRow: 3 });
  });
});

describe("reading a turn back as the Learner sees it", () => {
  it("finds the written-ahead Widget it opened, with the words on it, and a Widget drawn in the chat", async () => {
    const db = await testDb();
    const p = await prepareCase(db, live("T5"), { map, settings });
    const fence = ["```openui-lang", 'root = Widget("Savings in $", [])', "```"].join("\n");
    const { client } = scriptedClient([
      { content: [{ type: "tool_use", id: "toolu_eval_open", name: "open_widget", input: { id: "rate-change-three-ways" } }] },
      { content: [{ type: "text", text: `Okay. Shortest path.\n${fence}\nHow many basis points did the rate move?` }] },
    ]);
    const after = await noteMark(db, p.learnerId);
    const events = await collect(runTutorTurn({ db, client, map, learnerId: p.learnerId, checkReplies: false }, live("T5").message));
    const done = events.at(-1) as Extract<TurnEvent, { type: "done" }>;
    const text = events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");
    const reply = await seenReply(db, { learnerId: p.learnerId, topic: p.topic, ...done.ref, text, notesAfter: after });
    expect(reply.widgets[0]).toMatchObject({ kind: "written", id: "rate-change-three-ways" });
    expect(reply.widgets[0].labels).toEqual(expect.arrayContaining(["One rate change, said three ways", "Old rate"]));
    expect(reply.widgets[1]).toMatchObject({ id: DRAWN, labels: ["Savings in $"] });
    expect(p.ctx.widgetOk!(reply.widgets[1])).toMatch(/drawn during the chat/);
    expect(p.ctx.widgetOk!(reply.widgets[0])).toBeNull();
    expect(reply.savedRule).toBeNull();
    expect(reply.parkOffer).toBe(false);
  });
});
