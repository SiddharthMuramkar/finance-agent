import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { WIDGET_OPENED } from "@/course/written-ahead";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveCheckResult, saveFinishedStep } from "@/learner/memory";
import { noteMethodUsed } from "@/learner/skill-state";
import { LADDER, type Method } from "@/teaching/ladder";
import { answerTyped } from "@/test/answer-typed";
import { plainWrongMap, PLAIN_WRONG } from "@/test/plain-wrong-map";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { WIDGET_SHOWN, type ShownWidget } from "@/widgets/shown-widget";
import { reteachNote } from "./ladder-moves";
import { answerQuickTry, enterStepItems, parkFromOffer } from "./practice";
import { QUICK_TRY, QUICK_TRY_RESULT, type QuickTryData } from "./session-item-kinds";
import { TOPIC_COMPLETE } from "./topic-complete-card";
import { loadSessionItems } from "./session-items";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";

/**
 * Seam 2, the Tutor Turn (spec 2026-11-05, E4a, ADR 0010): exactly one Widget with every reply, whatever kind of turn it
 * is, with the real Companion picker and the widget engine on (no mock). Every tail that stores items of its own (a
 * Next's step Widget, a Quick-try follow-up's re-teach, a drill, start_again, a Topic complete card, the Tutor's own
 * show_widget or update_widget) is driven once, and the reply-check record names where the one Widget came from.
 * PGlite and a scripted Tutor.
 */

const me = OWNER_LEARNER_ID;
const t0 = new Date("2026-11-04T10:00:00Z");
const hours = (h: number) => new Date(t0.getTime() + h * 3_600_000);

function mapOf(data: object): CourseMap {
  const { map, errors } = parseCourseMap([topicFileOf(data)]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

/** The converted Percent fixture: Concept cards with presets, Quick tries, the repair ladder. */
const demo = mapOf(CONVERTED_TOPIC_DATA);
/** The fixture with a written choice try first, whose wrong option names no Known mistake: a slip. */
const slips = plainWrongMap();
/** Present value with no quiz and no Insight, which a Next can complete. */
const plain = presentValueOnly({ withoutQuiz: true, withoutInsight: true });

const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });
const tool = (id: string, name: string, input: Record<string, unknown>): ScriptedReply => ({ content: [{ type: "tool_use", id, name, input }], stop_reason: "tool_use" });
const RATE_MOVE = { recipe: "rate_move", params: { title: "A savings rate from 4% to 5%", inputs: { old: 4, new: 5, mode: "show" }, refs: {}, facts: {} } };
const SLIP = "Here is one slip and its fix.\n\nTry the next one?";

type Ran = { events: TurnEvent[]; sessionId: number; turnSeq: number; sent: string };

async function turn(db: Db, map: CourseMap, input: TurnInput, replies: ScriptedReply[], at = t0): Promise<Ran> {
  const { client, requests } = scriptedClient(replies);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: me, now: () => at }, input)) events.push(e);
  const done = events.find((e) => e.type === "done") as Extract<TurnEvent, { type: "done" }>;
  return { events, sessionId: done.ref.sessionId, turnSeq: done.ref.turnSeq, sent: JSON.stringify(requests[0]?.messages ?? []) };
}

/** The Widgets the Learner got with a reply, as the browser heard them: shown or opened, by code or the Tutor. */
const widgetItems = (events: TurnEvent[]) =>
  events.flatMap((e) => (e.type === "item" && (e.item.kind === WIDGET_SHOWN || e.item.kind === WIDGET_OPENED) ? [e.item] : []));
/** An open Widget the Tutor moved with update_widget is the reply's Widget too. */
const movedWidgets = (events: TurnEvent[]) => (events.some((e) => e.type === "widget_state") ? 1 : 0);

async function lastSource(db: Db): Promise<string | null> {
  const { rows } = (await db.execute(sql`select widget_source from reply_checks order by id desc limit 1`)) as unknown as { rows: { widget_source: string | null }[] };
  return rows[0]?.widget_source ?? null;
}

const COMPANION_KINDS = ["scene", "lingo", "running_example", "case"];

// ---------------------------------------------------------------------------------------------------------------------
// Getting there.

/** The Learner at Your turn of the fixture's first Check, with its first try shown. */
async function atYourTurn(db: Db, map = demo) {
  const hi = await turn(db, map, "Hi", [say("In 1994 the Fed held its rate at 3%.\n\nReady?")]);
  for (const step of ["story", "concept"] as const) await saveFinishedStep(db, map, step, t0, me);
  const [first] = await enterStepItems(db, map, me, hi.sessionId, t0);
  return { sessionId: hi.sessionId, first: first.data as QuickTryData };
}

async function openTry(db: Db, sessionId: number) {
  const items = await loadSessionItems(db, sessionId, me);
  const answered = new Set(items.filter((i) => i.kind === QUICK_TRY_RESULT).map((i) => i.data.key));
  return items.filter((i) => i.kind === QUICK_TRY).map((i) => i.data as QuickTryData).findLast((t) => !answered.has(t.key))!;
}

/** Two misses in a row on the first try's Skill, with the methods before `method` noted: the follow-up re-teaches with it. */
async function reteach(db: Db, method: Method): Promise<Ran> {
  const used = LADDER.slice(0, LADDER.indexOf(method));
  const { sessionId, first } = await atYourTurn(db);
  for (const m of used) await noteMethodUsed(db, me, "pct-demo", first.skillId, m, t0);
  await answerTyped(db, demo, me, first.key, "7777", t0);
  const a2 = await answerTyped(db, demo, me, (await openTry(db, sessionId)).key, "7777", t0);
  expect(a2).toMatchObject({ ok: true, followUp: true });
  const ran = await turn(db, demo, { quickTryFollowUp: true }, [say("Points times 100 give basis points.\n\nTry it now?")]);
  // The re-teach note names the method (stored JSON-escaped in the request).
  expect(ran.sent).toContain(JSON.stringify(reteachNote(method)).slice(1, -1));
  return ran;
}

/** Walks Present value to its Principle. */
async function atPrinciple(db: Db) {
  await turn(db, plain, "Hi", [say("Once upon a time.")]);
  for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, plain, step, new Date(), me);
  await saveCheckResult(db, plain, { checkId: plain.topic("present-value")!.checks[0].id, passed: true, evidence: "Explained it." }, new Date(), me);
  await saveFinishedStep(db, plain, "reveal", new Date(), me);
}

// ---------------------------------------------------------------------------------------------------------------------
// Every turn kind, and where its one Widget comes from: the Tutor's, the step's (code stored it), or a Companion.

type Want = "tutor" | "step" | "companion";
type Case = { name: string; want: Want; run: (db: Db) => Promise<Ran>; check?: (ran: Ran, db: Db) => Promise<void> };

const cases: Case[] = [
  {
    name: "a typed message at Your turn",
    want: "companion",
    run: async (db) => {
      await atYourTurn(db);
      return turn(db, demo, "How do I start?", [say(SLIP)]);
    },
  },
  {
    name: "a Next into a Concept step (its card's preset)",
    want: "step",
    run: async (db) => {
      await turn(db, demo, { opener: true }, [say("Picture February 1994. Bond traders are waiting for news.")]);
      return turn(db, demo, { next: "concept" }, [say("A basis point is one hundredth of a percentage point.\n\nWhich word fits?")]);
    },
  },
  {
    name: "a Quick-try follow-up after one slip (the next try)",
    want: "companion",
    run: async (db) => {
      const { first } = await atYourTurn(db, slips);
      expect(await answerQuickTry(db, slips, me, first.key, PLAIN_WRONG, t0)).toMatchObject({ ok: true, followUp: true });
      return turn(db, slips, { quickTryFollowUp: true }, [say("Up 1 leaves out the unit: it moved 1 point.\n\nTry the next one?")]);
    },
  },
  { name: "a re-teach by restating", want: "companion", run: (db) => reteach(db, "restate") },
  { name: "a re-teach by a worked example", want: "companion", run: (db) => reteach(db, "worked") },
  { name: "a re-teach by a half-done try", want: "companion", run: (db) => reteach(db, "boxes") },
  {
    name: "a re-teach by the Widget (the card's preset in practice mode)",
    want: "step",
    run: (db) => reteach(db, "widget"),
    check: async (ran) => {
      expect(widgetItems(ran.events)[0].data).toMatchObject({ title: "One move, two ways · practice", params: { inputs: { mode: "practice" } } });
    },
  },
  { name: "a re-teach by a drill of five", want: "companion", run: (db) => reteach(db, "drill5") },
  {
    name: "a parked Skill's drill",
    want: "companion",
    run: async (db) => {
      const ran = await reteach(db, "restate");
      const third = await openTry(db, ran.sessionId);
      await answerTyped(db, demo, me, third.key, "7777", t0);
      await parkFromOffer(db, demo, me, third.skillId, t0);
      return turn(db, demo, { drill: true }, [say("A few short tries on this one.\n\nReady?")], hours(21));
    },
  },
  {
    name: "start_again (the Concept cards and the first try again)",
    want: "companion",
    run: async (db) => {
      await atYourTurn(db);
      return turn(db, demo, "Can we start over?", [tool("toolu_again", "start_again", {}), say("Here is the first card again.\n\nReady for the first try?")]);
    },
  },
  {
    name: "Finish this reply after a cut-off",
    want: "companion",
    run: async (db) => {
      await turn(db, plain, "Why is money today worth more?", [{ content: [{ type: "text", text: "A rupee today is worth" }], stop_reason: "max_tokens" }]);
      return turn(db, plain, { finish: true }, [say("more than a rupee next year.")]);
    },
  },
  {
    name: "a Next that completes the Topic (its Topic complete card)",
    want: "companion",
    run: async (db) => {
      await atPrinciple(db);
      return turn(db, plain, { next: "complete" }, [say("Well done: that is the Topic.")]);
    },
    check: async (ran) => {
      // The turn still ends at the Topic complete card.
      const last = ran.events.filter((e) => e.type === "item").at(-1);
      expect(last).toMatchObject({ item: { kind: TOPIC_COMPLETE } });
    },
  },
  {
    name: "a reply that calls show_widget",
    want: "tutor",
    run: async (db) => {
      await atYourTurn(db);
      return turn(db, demo, "Show me", [tool("toolu_show", "show_widget", RATE_MOVE), say(SLIP)]);
    },
  },
  {
    name: "a reply that moves an open Widget with update_widget",
    want: "tutor",
    run: async (db) => {
      await atYourTurn(db);
      await turn(db, demo, "Show me", [tool("toolu_show", "show_widget", RATE_MOVE), say(SLIP)]);
      return turn(db, demo, "Make the new rate 6%", [tool("toolu_move", "update_widget", { key: RATE_MOVE.params.title, values: { $new: 6 } }), say(SLIP)]);
    },
  },
];

describe("exactly one Widget with every reply, with the real Companion picker", () => {
  it.each(cases)("$name: one Widget, widget_source $want", async ({ want, run, check }) => {
    const db = await testDb();
    const ran = await run(db);
    const widgets = widgetItems(ran.events);
    // The one Widget the reply brings: an item the browser got, or the open Widget update_widget moved.
    expect(widgets.length + movedWidgets(ran.events)).toBe(1);
    // A reload draws the same: the turn stores no more Widgets than the browser got (a Next's sit just before its message).
    const stored = (await loadSessionItems(db, ran.sessionId, me)).filter((i) => (i.kind === WIDGET_SHOWN || i.kind === WIDGET_OPENED) && i.afterSeq >= ran.turnSeq);
    expect(stored.length).toBeLessThanOrEqual(widgets.length);
    const source = await lastSource(db);
    if (want === "companion") {
      const companion = widgets[0].data as ShownWidget;
      expect(companion).toMatchObject({ source: "companion" });
      expect(COMPANION_KINDS).toContain(source);
      expect(source).toBe(companion.companion);
    } else {
      expect(widgets.every((w) => (w.data as ShownWidget).source !== "companion")).toBe(true);
      expect(source).toBe(want);
    }
    await check?.(ran, db);
  });
});
