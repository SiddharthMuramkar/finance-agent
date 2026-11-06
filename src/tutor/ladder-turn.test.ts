import { describe, expect, it, vi } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveFinishedStep } from "@/learner/memory";
import { skillStates } from "@/learner/skill-state";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { nextOfferNow } from "./next";
import { PARK_DRILL, PARK_OFFER, PARKED } from "./park-items";
import { enterStepItems, oneMoreFromOffer, parkFromOffer } from "./practice";
import { answerTyped } from "@/test/answer-typed";
import { QUICK_TRY, QUICK_TRY_RESULT, type QuickTryData, type SessionItem } from "./session-item-kinds";
import { loadSessionItems } from "./session-items";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { withoutChoices } from "@/test/choices";

// The Companion Widget code adds to a reply with none (E4a) is off here: this file tests other behaviour, and
// src/tutor/companion-turn.test.ts tests the companion.
vi.mock("./companion", () => ({ pickCompanion: () => null }));

/**
 * Seam: the Tutor Turn and the Quick-try handler with Skill state in Learner Memory (spec #229, ticket #245). The repair
 * ladder runs on code-marked answers: a second miss in a row re-teaches with the next method, a third shows the park
 * offer with no Tutor turn; parking holds the place; after 20 hours a drill of five runs first.
 */

const { map: parsed } = parseCourseMap([topicFileOf(CONVERTED_TOPIC_DATA)]);
const map = parsed as CourseMap;
const me = OWNER_LEARNER_ID;
const t0 = new Date("2026-11-04T10:00:00Z");
const hours = (h: number) => new Date(t0.getTime() + h * 3_600_000);

const reply = (text: string) => ({ content: [{ type: "text", text }] });

async function turn(db: Db, input: TurnInput, text = "Here is one slip and its fix.\n\nTry the next one?", at = t0) {
  const { client, requests } = scriptedClient([reply(text)]);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: me, now: () => at }, input)) events.push(e);
  return { events, requests, items: withoutChoices(events).flatMap((e) => (e.type === "item" ? [e.item] : [])) };
}

/** The Learner at Your turn of the first Check, with its first try shown. */
async function atYourTurn(db: Db) {
  let sessionId = 0;
  for (const e of (await turn(db, "Hi", "In 1994 the Fed held its rate at 3%.\n\nReady?")).events) if (e.type === "done") sessionId = e.ref.sessionId;
  for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, t0, me);
  const [first] = await enterStepItems(db, map, me, sessionId, t0);
  return { sessionId, first: first.data as QuickTryData };
}

const tryIn = (items: SessionItem[]) => items.find((i) => i.kind === QUICK_TRY)?.data as QuickTryData | undefined;
const openTry = async (db: Db, sessionId: number) => {
  const items = await loadSessionItems(db, sessionId, me);
  const answered = new Set(items.filter((i) => i.kind === QUICK_TRY_RESULT).map((i) => i.data.key));
  return items.filter((i) => i.kind === QUICK_TRY).map((i) => i.data as QuickTryData).findLast((t) => !answered.has(t.key));
};
/** The text of the last context-bearing message the turn sent. */
const sent = (requests: readonly { messages: unknown }[]) => JSON.stringify(requests[0].messages);

/**
 * Three misses in a row on the first try's Skill. Every number choice is a named mix-up, so a miss shows its fix and the
 * next try with no Tutor turn; the second miss in a row brings the re-teach turn, the third the park offer.
 */
async function threeMisses(db: Db, sessionId: number, first: QuickTryData) {
  const a1 = await answerTyped(db, map, me, first.key, "7777", t0);
  expect(a1).toMatchObject({ ok: true, followUp: false });
  expect(a1.ok && a1.items[0].data).toMatchObject({ verdict: "known_mistake" });
  const second = (await openTry(db, sessionId))!;
  expect(second.skillId).toBe(first.skillId);
  const a2 = await answerTyped(db, map, me, second.key, "7777", t0);
  expect(a2).toMatchObject({ ok: true, followUp: true });
  const reteach = await turn(db, { quickTryFollowUp: true }, "Points times 100 give basis points.\n\nTry it now?");
  const third = (await openTry(db, sessionId))!;
  const a3 = await answerTyped(db, map, me, third.key, "7777", t0);
  return { reteach, a3 };
}

describe("the repair ladder on Quick tries", () => {
  it("re-teaches on the second miss in a row with a method in plain words, and notes the method", async () => {
    const db = await testDb();
    const { sessionId, first } = await atYourTurn(db);
    const { reteach } = await threeMisses(db, sessionId, first);
    const body = sent(reteach.requests);
    expect(body).toContain("Reply kind: reteach");
    expect(body).toContain("Method: restate");
    expect((await skillStates(db, me, "pct-demo"))[first.skillId].methodsUsed).toEqual(["restate"]);
  });

  it("shows the park offer at three misses, with no Tutor turn and no new explanation", async () => {
    const db = await testDb();
    const { sessionId, first } = await atYourTurn(db);
    const { a3 } = await threeMisses(db, sessionId, first);
    expect(a3).toMatchObject({ ok: true, followUp: false });
    const items = a3.ok ? a3.items : [];
    expect(items.map((i) => i.kind)).toEqual([QUICK_TRY_RESULT, PARK_OFFER]);
    expect(items[1].data).toMatchObject({ skillId: first.skillId, line: expect.stringMatching(/park/i) });
    // No try is posted alongside the offer.
    expect(await openTry(db, sessionId)).toBeUndefined();
  });

  it("parks once: Back tomorrow, no try and no Next while parked", async () => {
    const db = await testDb();
    const { sessionId, first } = await atYourTurn(db);
    await threeMisses(db, sessionId, first);
    const parked = await parkFromOffer(db, map, me, first.skillId, t0);
    expect(parked).toMatchObject({ ok: true, items: [{ kind: PARKED, data: { line: expect.stringMatching(/^Back tomorrow after \w{3} \d+:\d\d [ap]m$/) } }] });
    expect(await parkFromOffer(db, map, me, first.skillId, t0)).toMatchObject({ ok: false, status: 404 });
    expect(await oneMoreFromOffer(db, map, me, first.skillId, t0)).toMatchObject({ ok: false, status: 404 });
    expect(await enterStepItems(db, map, me, sessionId, hours(1))).toEqual([]);
    expect(await nextOfferNow(db, map, me, hours(1))).toBeNull();
    // The Tutor is told, through the context, that the idea is parked and the Learner may choose another Topic.
    const later = await turn(db, "what now?", "It is parked until tomorrow. You could try another Topic.\n\nWant the Course Map?", hours(1));
    expect(sent(later.requests)).toMatch(/Parked until \w{3} \d+:\d\d [ap]m/);
    expect(later.items.some((i) => i.kind === QUICK_TRY)).toBe(false);
  });

  it("gives one more short try, and offers the park again after a miss on it", async () => {
    const db = await testDb();
    const { sessionId, first } = await atYourTurn(db);
    await threeMisses(db, sessionId, first);
    const more = await oneMoreFromOffer(db, map, me, first.skillId, t0);
    const extra = tryIn(more.ok ? more.items : [])!;
    expect(extra.skillId).toBe(first.skillId);
    const miss = await answerTyped(db, map, me, extra.key, "7777", t0);
    expect(miss.ok && miss.items.map((i) => i.kind)).toEqual([QUICK_TRY_RESULT, PARK_OFFER]);
  });

  it("after 20 hours runs a drill of five first, then the step goes on", async () => {
    const db = await testDb();
    const { sessionId, first } = await atYourTurn(db);
    await threeMisses(db, sessionId, first);
    await parkFromOffer(db, map, me, first.skillId, t0);
    expect(await enterStepItems(db, map, me, sessionId, hours(19))).toEqual([]);
    const drill = await turn(db, { drill: true }, "A few short tries on this one.\n\nReady?", hours(21));
    expect(drill.items.map((i) => i.kind)).toEqual([PARK_DRILL, QUICK_TRY]);
    expect(drill.items[0].data.label).toMatch(/^Drill · /);
    let t = tryIn(drill.items)!;
    for (let n = 1; n <= 5; n++) {
      expect(t.drill).toMatchObject({ n, of: 5, reason: "parked" });
      const a = await answerTyped(db, map, me, t.key, n % 2 ? "1" : "2", hours(21));
      if (a.ok && a.followUp) await turn(db, { quickTryFollowUp: true }, "One slip, one fix.\n\nNext?", hours(21));
      if (n < 5) t = (await openTry(db, sessionId))!;
    }
    expect((await skillStates(db, me, "pct-demo"))[first.skillId].parkedUntil).toBeNull();
    const after = (await openTry(db, sessionId))!;
    expect(after.drill).toBeUndefined();
  });
});

describe("the widget rung", () => {
  it("opens the card's preset in practice mode under its own title", async () => {
    const db = await testDb();
    const { sessionId, first } = await atYourTurn(db);
    // Three methods already used: the next re-teach is the Widget.
    const { noteMethodUsed } = await import("@/learner/skill-state");
    for (const m of ["restate", "worked", "boxes"] as const) await noteMethodUsed(db, me, "pct-demo", first.skillId, m, t0);
    await answerTyped(db, map, me, first.key, "7777", t0);
    const second = (await openTry(db, sessionId))!;
    await answerTyped(db, map, me, second.key, "7777", t0);
    const reteach = await turn(db, { quickTryFollowUp: true }, "Move the rates and watch the basis points.\n\nTry it?");
    expect(sent(reteach.requests)).toContain("Method: widget");
    const widget = reteach.items.find((i) => i.kind === WIDGET_SHOWN);
    expect(widget?.data).toMatchObject({ title: "One move, two ways · practice", params: { inputs: { mode: "practice" } } });
  });
});
