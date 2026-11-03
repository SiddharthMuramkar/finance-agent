import { describe, expect, it } from "vitest";
import { learners, OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { testDb } from "@/test/pglite";
import { presentValueOnly } from "@/test/present-value-map";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { listSessions } from "@/tutor/transcript";
import { runTutorTurn, type TurnEvent } from "@/tutor/turn";
import { loadSaved, saveToNotes } from "./saved";
import { loadWidgetStates, saveWidgetState } from "./widget-state";

/**
 * Widget state with the Tutor Turn (spec #119, "Widgets › Widget state"): a Learner's slider values and ticked
 * Guided Tasks are saved per (Session, Widget key) and read back with the Session; another Learner's Session is no
 * such Session (404). Scripted Anthropic client, in-memory Postgres with the real migrations.
 */

const map = presentValueOnly({ withoutQuiz: true, withoutInsight: true });

const WIDGET = [
  'root = Widget("Rates", [rate, steps])',
  "$rate = 5",
  'rate = Slider("rate", "Interest rate", 0, 10, 0.25, $rate, "percent")',
  "steps = GuidedTasks([t1])",
  't1 = GuidedTask("Set the rate to 3%", $rate == 3)',
].join("\n");
const REPLY = ["Try it.", "", "```openui-lang", WIDGET, "```"].join("\n");

const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });

async function turn(db: Db, learnerId: number, message: string, reply: string) {
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client: scriptedClient([say(reply)]).client, map, learnerId }, message)) events.push(e);
  expect(events.at(-1)).toMatchObject({ type: "done" });
  const [session] = await listSessions(db, learnerId);
  return session.id;
}

async function secondLearner(db: Db): Promise<number> {
  const [row] = await db.insert(learners).values({ name: "second" }).returning();
  return row.id;
}

describe("Widget state saved with the Session", () => {
  it("is read back with the Session, per Widget key", async () => {
    const db = await testDb();
    const sessionId = await turn(db, OWNER_LEARNER_ID, "Show me a rate.", REPLY);
    expect(await loadWidgetStates(db, sessionId, OWNER_LEARNER_ID)).toEqual({});

    expect(await saveWidgetState(db, { sessionId, widgetKey: "Rates", values: { $rate: 3 }, ticked: ["Set the rate to 3%"] }, OWNER_LEARNER_ID)).toEqual({ ok: true });
    expect(await saveWidgetState(db, { sessionId, widgetKey: "explore", values: { $rate: 0 }, ticked: [] }, OWNER_LEARNER_ID)).toEqual({ ok: true });
    // Saving again replaces that Widget's state only.
    await saveWidgetState(db, { sessionId, widgetKey: "Rates", values: { $rate: 4.5 }, ticked: ["Set the rate to 3%"] }, OWNER_LEARNER_ID);

    expect(await loadWidgetStates(db, sessionId, OWNER_LEARNER_ID)).toEqual({
      Rates: { values: { $rate: 4.5 }, ticked: ["Set the rate to 3%"] },
      explore: { values: { $rate: 0 }, ticked: [] },
    });
  });

  it("refuses another Learner's Session as no such Session, and never shows them its state", async () => {
    const db = await testDb();
    const second = await secondLearner(db);
    const ownerSession = await turn(db, OWNER_LEARNER_ID, "Show me a rate.", REPLY);
    await saveWidgetState(db, { sessionId: ownerSession, widgetKey: "Rates", values: { $rate: 3 }, ticked: [] }, OWNER_LEARNER_ID);

    expect(await saveWidgetState(db, { sessionId: ownerSession, widgetKey: "Rates", values: { $rate: 9 }, ticked: [] }, second)).toEqual({
      ok: false,
      status: 404,
      reason: "That Session does not exist.",
    });
    expect(await saveWidgetState(db, { sessionId: 9999, widgetKey: "Rates", values: {}, ticked: [] }, second)).toMatchObject({ ok: false, status: 404 });
    expect(await loadWidgetStates(db, ownerSession, second)).toEqual({});
    expect(await loadWidgetStates(db, ownerSession, OWNER_LEARNER_ID)).toEqual({ Rates: { values: { $rate: 3 }, ticked: [] } });
  });

  it("refuses what is not a Widget's state", async () => {
    const db = await testDb();
    const sessionId = await turn(db, OWNER_LEARNER_ID, "Show me a rate.", REPLY);
    const bad = [
      { sessionId, widgetKey: "", values: {}, ticked: [] },
      { sessionId, widgetKey: "Rates", values: { rate: 3 }, ticked: [] },
      { sessionId, widgetKey: "Rates", values: { $rate: "3" }, ticked: [] },
      { sessionId, widgetKey: "Rates", values: {}, ticked: [3] },
      { sessionId, widgetKey: "x".repeat(201), values: {}, ticked: [] },
    ];
    for (const req of bad) expect(await saveWidgetState(db, req as never, OWNER_LEARNER_ID)).toMatchObject({ ok: false, status: 400 });
    expect(await loadWidgetStates(db, sessionId, OWNER_LEARNER_ID)).toEqual({});
  });

  it("is what Save to notes keeps for a Widget saved under the same key", async () => {
    const db = await testDb();
    const sessionId = await turn(db, OWNER_LEARNER_ID, "Show me a rate.", REPLY);
    await saveWidgetState(db, { sessionId, widgetKey: "Rates", values: { $rate: 3 }, ticked: ["Set the rate to 3%"] }, OWNER_LEARNER_ID);

    // The browser's own copy of the numbers is not what is kept: the Session's saved state under that key is.
    const saved = await saveToNotes(db, map, { kind: "widget", sessionId, turnSeq: 0, widgetIndex: 0, widgetKey: "Rates", settings: { $rate: 7 } }, new Date(), OWNER_LEARNER_ID);
    expect(saved).toMatchObject({ ok: true });
    const [item] = [...(await loadSaved(db, map, OWNER_LEARNER_ID)).values()].flat();
    expect(item).toMatchObject({ kind: "widget", title: "Rates", again: { settings: { $rate: 3 } } });
    expect(item.kind === "widget" && item.code).toContain("$rate = 3");
  });
});
