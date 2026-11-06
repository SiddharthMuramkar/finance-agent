import { describe, expect, it } from "vitest";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { presentValueOnly } from "@/test/present-value-map";
import { loadThread, type ThreadEntry } from "./transcript";
import { comingBackItems } from "./coming-back";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import type { Db } from "@/db/types";
import { stringify } from "yaml";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { navigate } from "@/course/navigator";
import { ensureTopicStarted, loadProgress, saveCheckResult, saveFinishedStep } from "@/learner/memory";
import { withoutChoices } from "@/test/choices";

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
  for await (const e of runTutorTurn({ db, client, map: m, now: () => when, learnerId: OWNER_LEARNER_ID }, input)) events.push(e);
  const done = events.at(-1) as Extract<TurnEvent, { type: "done" }>;
  return { events, requests, sessionId: done.ref.sessionId };
}

/** What the Learner sees, without the usage and save data that have their own tests. */
// The reply's Choices (D3a) have their own tests (choices-turn.test.ts): this file reads its items without them.
const seen = (entries: ThreadEntry[]) => withoutChoices(entries).map((e) => (e.role === "item" ? e : { role: e.role, text: e.text }));
const items = (entries: ThreadEntry[]) => withoutChoices(entries).filter((e) => e.role === "item");

const pickingUp = (label: string) => ({ role: "item", kind: "picking_up", data: expect.objectContaining({ label }) });

describe("coming back after a break", () => {
  it("draws Picking up from the gap without storing it, and the next action stores it before the Learner's message", async () => {
    const db = await testDb();
    const { sessionId } = await turn(db, "Hi", at(0), [say("Once, a lottery winner had a choice.")]);

    // Seven hours later (the idle setting is six), the page works out the divider: nothing is stored.
    const label = "Picking up where you left off · Step 1 of 6 · Story";
    expect(await comingBackItems(db, map, OWNER_LEARNER_ID, at(7))).toEqual([{ kind: "picking_up", data: expect.objectContaining({ label }) }]);
    expect(await comingBackItems(db, map, OWNER_LEARNER_ID, at(7))).toHaveLength(1);
    expect(items(await loadThread(db, sessionId, map, OWNER_LEARNER_ID))).toEqual([]);

    const back = await turn(db, "I'm back.", at(7), [say("Welcome back. Where were we?")]);
    expect(back.sessionId).toBe(sessionId);
    expect(seen(await loadThread(db, sessionId, map, OWNER_LEARNER_ID))).toEqual([
      { role: "user", text: "Hi" },
      { role: "assistant", text: "Once, a lottery winner had a choice." },
      pickingUp(label),
      { role: "user", text: "I'm back." },
      { role: "assistant", text: "Welcome back. Where were we?" },
    ]);
    // Display-only: the model is never sent it.
    expect(JSON.stringify(back.requests[0].messages)).not.toContain("Picking up");
    // The action closed the gap: nothing more is drawn or stored.
    expect(await comingBackItems(db, map, OWNER_LEARNER_ID, at(7.5))).toEqual([]);
  });

  it("gives a Topic carried over at the switch-over the same divider, stored by its opener before the Tutor's reply", async () => {
    const db = await testDb();
    // Started (and moved on) before one Session per Topic: progress, but no message in a Session of its own.
    await ensureTopicStarted(db, map, at(0), OWNER_LEARNER_ID);
    expect((await saveFinishedStep(db, map, "story", at(0), OWNER_LEARNER_ID)).ok).toBe(true);

    const label = "Picking up where you left off · Step 2 of 6 · Concept";
    expect(await comingBackItems(db, map, OWNER_LEARNER_ID, at(1))).toEqual([{ kind: "picking_up", data: expect.objectContaining({ label }) }]);
    const opened = await turn(db, { opener: true }, at(1), [say("Last time we met the lottery winner. Now, the concept.")]);
    expect(seen(await loadThread(db, opened.sessionId, map, OWNER_LEARNER_ID))).toEqual([pickingUp(label), { role: "assistant", text: "Last time we met the lottery winner. Now, the concept." }]);
    expect(await comingBackItems(db, map, OWNER_LEARNER_ID, at(1))).toEqual([]);
  });

  it("gives a Topic not yet started no divider: its Story simply begins", async () => {
    const db = await testDb();
    expect(await comingBackItems(db, map, OWNER_LEARNER_ID, at(0))).toEqual([]);
    const opened = await turn(db, { opener: true }, at(0), [say("Once, a lottery winner had a choice.")]);
    expect(items(await loadThread(db, opened.sessionId, map, OWNER_LEARNER_ID))).toEqual([]);
  });

  it("draws nothing after a gap shorter than the idle setting", async () => {
    const db = await testDb();
    const { sessionId } = await turn(db, "Hi", at(0), [say("Once upon a time.")]);
    expect(await comingBackItems(db, map, OWNER_LEARNER_ID, at(5))).toEqual([]);
    await turn(db, "Go on.", at(5), [say("And then.")]);
    expect(items(await loadThread(db, sessionId, map, OWNER_LEARNER_ID))).toEqual([]);
  });
});

/** The same course after an edit to the present value Topic (a Check added, an Insight made required). */
function edited(change: (topic: Record<string, unknown>) => Record<string, unknown>, from = presentValueOnly({ withoutQuiz: true })): CourseMap {
  const topic = from.topic("present-value")!;
  const text = stringify(change({ ...topic, connections: undefined, prerequisites: [] }));
  const { map: m, errors } = parseCourseMap([{ name: "present-value.yaml", text }]);
  if (!m) throw new Error(errors.join("\n"));
  return m;
}

/** Takes the present value Topic to passed, by code, as the Tutor's tools would. */
async function passTopic(db: Db, m: CourseMap) {
  await ensureTopicStarted(db, m, at(0), OWNER_LEARNER_ID);
  for (const check of m.topic("present-value")!.checks) {
    for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, m, step, at(0), OWNER_LEARNER_ID);
    const saved = await saveCheckResult(db, m, { checkId: check.id, passed: true }, new Date(), OWNER_LEARNER_ID);
    if (!saved.ok) throw new Error(saved.reason);
  }
  for (const step of ["reveal", "principle"] as const) {
    const moved = await saveFinishedStep(db, m, step, at(0), OWNER_LEARNER_ID);
    if (!moved.ok) throw new Error(moved.reason);
  }
  if ((await loadProgress(db, OWNER_LEARNER_ID)).topics["present-value"].status !== "passed") throw new Error("not passed");
}

describe("a Due Check reopens the Topic's own Session", () => {
  const newCheck = { id: "pv-new", kind: "conversation", prompt: "Which would you take at 2%?", passCriteria: "Compares present values.", required: true };
  const withNewCheck = edited((t) => ({ ...t, checks: [...(t.checks as unknown[]), newCheck] }), map);

  it('stores "New Check · Check N" in the same Session with the next action, and the reopening turn is fresh', async () => {
    const db = await testDb();
    const first = await turn(db, "Hi", at(0), [say("Once, a lottery winner had a choice.")]);
    await passTopic(db, map);

    // A required Check is added to the passed Topic: it comes up, and the page draws why the Learner is back.
    const label = "New Check · Check 2";
    expect(await comingBackItems(db, withNewCheck, OWNER_LEARNER_ID, at(1))).toEqual([{ kind: "due_check", data: expect.objectContaining({ label }) }]);
    expect(items(await loadThread(db, first.sessionId, map, OWNER_LEARNER_ID))).toEqual([]);

    const finishConcept = { type: "tool_use", id: "toolu_concept", name: "finish_teaching_step", input: { step: "concept" } };
    const back = await turn(db, "What's new?", at(1), [{ content: [{ type: "text", text: "A new Check." }, finishConcept] }, say("Let's take the concept first.")], withNewCheck);
    expect(back.sessionId).toBe(first.sessionId);
    const thread = seen(await loadThread(db, first.sessionId, withNewCheck, OWNER_LEARNER_ID));
    // The new Check's concept has not begun, so its step divider comes before the reply that teaches it.
    expect(thread.slice(0, 5)).toEqual([
      { role: "user", text: "Hi" },
      { role: "assistant", text: "Once, a lottery winner had a choice." },
      { role: "item", kind: "due_check", data: expect.objectContaining({ label }) },
      { role: "user", text: "What's new?" },
      { role: "item", kind: "step", data: expect.objectContaining({ step: "concept" }) },
    ]);
    // Fresh: the Tutor teaches the new Check's concept and cannot finish it in the same reply.
    // Its finish was refused, so no further step divider follows and the Learner is still at the new Check's concept.
    expect(items(thread)).toHaveLength(2);
    expect(navigate(withNewCheck, await loadProgress(db, OWNER_LEARNER_ID))).toMatchObject({ step: "concept", check: { id: "pv-new" } });
    expect(await comingBackItems(db, withNewCheck, OWNER_LEARNER_ID, at(1))).toEqual([]);
  });

  it("after a break as well, draws only the Due Check divider", async () => {
    const db = await testDb();
    await turn(db, "Hi", at(0), [say("Once upon a time.")]);
    await passTopic(db, map);
    expect(await comingBackItems(db, withNewCheck, OWNER_LEARNER_ID, at(48))).toEqual([{ kind: "due_check", data: expect.objectContaining({ label: "New Check · Check 2" }) }]);
  });

  it('says "New step · Explore" for a due Explore', async () => {
    const db = await testDb();
    await turn(db, "Hi", at(0), [say("Once upon a time.")]);
    await passTopic(db, map);
    const exploreDue = edited((t) => ({ ...t, explore: { ...(t.explore as object), requiredWhenPassed: true } }));
    expect(await comingBackItems(db, exploreDue, OWNER_LEARNER_ID, at(1))).toEqual([{ kind: "due_check", data: expect.objectContaining({ label: "New step · Explore" }) }]);
  });

  it("draws nothing on a passed Topic with nothing due", async () => {
    const db = await testDb();
    await turn(db, "Hi", at(0), [say("Once upon a time.")]);
    await passTopic(db, map);
    expect(await comingBackItems(db, map, OWNER_LEARNER_ID, at(48))).toEqual([]);
  });
});
