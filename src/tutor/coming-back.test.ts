import { describe, expect, it } from "vitest";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { presentValueOnly } from "@/test/present-value-map";
import { loadThread, type ThreadEntry } from "./transcript";
import { comingBackItems } from "./coming-back";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import type { Db } from "@/db/types";
import type { CourseMap } from "@/course/map";

/**
 * Seam 1, Tutor Turn: coming back after a break. The "Picking up where you left off" divider is worked out
 * from the gap and stored only with the Learner's next action, never by drawing a page; the model never sees it.
 */

const map = presentValueOnly({ withoutQuiz: true, withoutInsight: true });
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });
const HOUR = 3600_000;
const t0 = new Date("2026-11-01T09:00:00Z");
const at = (hours: number) => new Date(t0.getTime() + hours * HOUR);

async function turn(db: Db, input: TurnInput, when: Date, replies: ScriptedReply[], m: CourseMap = map) {
  const { client, requests } = scriptedClient(replies);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map: m, now: () => when }, input)) events.push(e);
  const done = events.at(-1) as Extract<TurnEvent, { type: "done" }>;
  return { events, requests, sessionId: done.ref.sessionId };
}

/** What the Learner sees, without the usage and save data that have their own tests. */
const seen = (entries: ThreadEntry[]) => entries.map((e) => (e.role === "item" ? e : { role: e.role, text: e.text }));
const items = (entries: ThreadEntry[]) => entries.filter((e) => e.role === "item");

const pickingUp = (label: string) => ({ role: "item", kind: "picking_up", data: expect.objectContaining({ label }) });

describe("coming back after a break", () => {
  it("draws Picking up from the gap without storing it, and the next action stores it before the Learner's message", async () => {
    const db = await testDb();
    const { sessionId } = await turn(db, "Hi", at(0), [say("Once, a lottery winner had a choice.")]);

    // Seven hours later (the idle setting is six), the page works out the divider: nothing is stored.
    const label = "Picking up where you left off · Step 1 of 6 · Story";
    expect(await comingBackItems(db, map, 1, at(7))).toEqual([{ kind: "picking_up", data: expect.objectContaining({ label }) }]);
    expect(await comingBackItems(db, map, 1, at(7))).toHaveLength(1);
    expect(items(await loadThread(db, sessionId, map))).toEqual([]);

    const back = await turn(db, "I'm back.", at(7), [say("Welcome back. Where were we?")]);
    expect(back.sessionId).toBe(sessionId);
    expect(seen(await loadThread(db, sessionId, map))).toEqual([
      { role: "user", text: "Hi" },
      { role: "assistant", text: "Once, a lottery winner had a choice." },
      pickingUp(label),
      { role: "user", text: "I'm back." },
      { role: "assistant", text: "Welcome back. Where were we?" },
    ]);
    // Display-only: the model is never sent it.
    expect(JSON.stringify(back.requests[0].messages)).not.toContain("Picking up");
    // The action closed the gap: nothing more is drawn or stored.
    expect(await comingBackItems(db, map, 1, at(7.5))).toEqual([]);
  });

  it("draws nothing after a gap shorter than the idle setting", async () => {
    const db = await testDb();
    const { sessionId } = await turn(db, "Hi", at(0), [say("Once upon a time.")]);
    expect(await comingBackItems(db, map, 1, at(5))).toEqual([]);
    await turn(db, "Go on.", at(5), [say("And then.")]);
    expect(items(await loadThread(db, sessionId, map))).toEqual([]);
  });
});
