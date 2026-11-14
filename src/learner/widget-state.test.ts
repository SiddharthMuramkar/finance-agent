import type { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { learners, OWNER_LEARNER_ID, widgetState } from "@/db/schema";
import type { Db } from "@/db/types";
import { engineOff } from "@/test/engine-off";
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
 * such Session (404). Scripted model client, in-memory Postgres with the real migrations.
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
  // The reply draws its own Widget, which only a Session without the widget engine may do (ADR 0007).
  await engineOff(db);
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

  it("saves in one statement: no transaction, no row lock, nothing a turn holds (A9)", async () => {
    const db = await testDb();
    const second = await secondLearner(db);
    const sessionId = await turn(db, OWNER_LEARNER_ID, "Show me a rate.", REPLY);
    // The same in-memory database, with every statement it is sent written down.
    const sent: string[] = [];
    const logged = drizzle({ client: (db as unknown as { $client: PGlite }).$client, schema, logger: { logQuery: (query) => void sent.push(query) } }) as unknown as Db;
    const at = new Date("2026-11-12T09:30:00.000Z");

    expect(await saveWidgetState(logged, { sessionId, widgetKey: "Rates", values: { $rate: 3 }, ticked: ["Set the rate to 3%"] }, OWNER_LEARNER_ID, at)).toEqual({ ok: true });
    expect(await saveWidgetState(logged, { sessionId, widgetKey: "Rates", values: { $rate: 9 }, ticked: [] }, second, at)).toMatchObject({ ok: false, status: 404 });

    // One statement per save, each an insert committed on its own.
    expect(sent).toHaveLength(2);
    for (const statement of sent) {
      expect(statement).toMatch(/^insert into "widget_state"/);
      // No transaction and no explicit row lock; never learner_state (the row a Next or a finished step holds for its
      // whole transaction) or turns (the running turn's row).
      expect(statement).not.toMatch(/\bbegin\b|\bfor (update|share|no key update|key share)\b|learner_state|"turns"/i);
    }
    // The other Learner's try inserted nothing; the owner's row holds what was sent, stamped at the given time.
    const rows = await db.select().from(widgetState).where(and(eq(widgetState.sessionId, sessionId), eq(widgetState.widgetKey, "Rates")));
    expect(rows).toEqual([{ sessionId, widgetKey: "Rates", learnerId: OWNER_LEARNER_ID, values: { $rate: 3 }, ticked: ["Set the rate to 3%"], updatedAt: at }]);
  });
});
