import { sql } from "drizzle-orm";
import { stringify } from "yaml";
import { describe, expect, it } from "vitest";
import { loadCourseMap, parseCourseMap, type CourseMap } from "@/course/map";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { engineOff } from "@/test/engine-off";
import { testDb } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { WIDGET_SHOWN, type ShownWidget } from "@/widgets/shown-widget";
import { loadSessionItems } from "./session-items";
import { runTutorTurn, type TurnEvent, type TurnInput } from "./turn";
import { requestStop } from "./turn-status";

/**
 * Seam 2, the Tutor Turn with a Companion Widget (spec 2026-11-05, E4a): a reply with no Widget gets one from code,
 * after its checks and before it is released; the reply-check record names where the turn's Widget came from.
 * PGlite and a scripted Tutor.
 */

const PERCENT = "num-percent-bps";

/** The real Percent Topic alone, first on the path. */
function percentOnly(): CourseMap {
  const t = loadCourseMap().topic(PERCENT)!;
  const body = { ...t, path: 1, prerequisites: [], subject: undefined, connections: undefined };
  const { map, errors } = parseCourseMap([{ name: `${PERCENT}.yaml`, text: stringify(body) }]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

const map = percentOnly();
const me = OWNER_LEARNER_ID;
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });
const tool = (id: string, name: string, input: Record<string, unknown>): ScriptedReply => ({ content: [{ type: "tool_use", id, name, input }] });
const RATE_MOVE = { recipe: "rate_move", params: { title: "A savings rate from 4% to 5%", inputs: { old: 4, new: 5, mode: "show" }, refs: {}, facts: {} } };
const CONCEPT = "A basis point is one hundredth of a percentage point. Traders use it because small moves matter on big loans.\n\nWhich word would you use for a tiny rate move?";

async function turn(db: Db, input: TurnInput, replies: ScriptedReply[]) {
  const { client } = scriptedClient(replies);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map, learnerId: me }, input)) events.push(e);
  const done = events.find((e) => e.type === "done") as Extract<TurnEvent, { type: "done" }>;
  return { events, sessionId: done.ref.sessionId, turnSeq: done.ref.turnSeq };
}

/** The Learner at Percent's first Concept step, its card and preset shown by the turn that entered it. */
async function atConcept(db: Db) {
  await turn(db, { opener: true }, [say("Picture February 1994. Bond traders are waiting for news.")]);
  await turn(db, "Go on", [tool("f-1", "finish_teaching_step", { step: "story" }), say("Here is the idea.")]);
}

/** The Widgets stored in the turn that began at `turnSeq`. */
async function widgetsOfTurn(db: Db, sessionId: number, turnSeq: number) {
  return (await loadSessionItems(db, sessionId, me)).filter((i) => i.kind === WIDGET_SHOWN && i.afterSeq >= turnSeq).map((i) => i.data as ShownWidget);
}

async function sources(db: Db): Promise<(string | null)[]> {
  const { rows } = (await db.execute(sql`select widget_source from reply_checks order by id`)) as unknown as { rows: { widget_source: string | null }[] };
  return rows.map((r) => r.widget_source);
}

describe("a Widget with every reply", () => {
  it("adds exactly one Companion Widget to a Percent concept reply with no tool call, and records its kind", async () => {
    const db = await testDb();
    await atConcept(db);
    const { events, sessionId, turnSeq } = await turn(db, "Tell me more", [say(CONCEPT)]);
    const shown = await widgetsOfTurn(db, sessionId, turnSeq);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ source: "companion", companion: "lingo", recipe: "lingo_card" });
    expect((await sources(db)).at(-1)).toBe("lingo");
    // The browser gets the Widget before the reply's text.
    const types = events.map((e) => (e.type === "item" ? `item:${e.item.kind}` : e.type));
    expect(types.indexOf(`item:${WIDGET_SHOWN}`)).toBeLessThan(types.indexOf("text"));
  });

  it("gives tutor and no companion when the reply calls show_widget", async () => {
    const db = await testDb();
    await atConcept(db);
    const { sessionId, turnSeq } = await turn(db, "Show me", [tool("toolu_show", "show_widget", RATE_MOVE), say(CONCEPT)]);
    const shown = await widgetsOfTurn(db, sessionId, turnSeq);
    expect(shown.map((w) => w.source)).toEqual(["recipe"]);
    expect((await sources(db)).at(-1)).toBe("tutor");
  });

  it("records step when code opened the step's Widget in the turn (the Concept card's preset)", async () => {
    const db = await testDb();
    await atConcept(db);
    expect((await sources(db)).at(-1)).toBe("step");
  });

  it("still adds a companion to a fallback reply", async () => {
    const db = await testDb();
    await atConcept(db);
    const long = `${"A basis point is one hundredth of a percentage point, and traders say it all day long. ".repeat(12)}\n\nWhich word fits?`;
    const { sessionId, turnSeq } = await turn(db, "Tell me more", [say(long), say(long)]);
    const shown = await widgetsOfTurn(db, sessionId, turnSeq);
    expect(shown.map((w) => w.source)).toEqual(["companion"]);
    const { rows } = (await db.execute(sql`select fallback, widget_source from reply_checks order by id desc limit 1`)) as unknown as { rows: { fallback: boolean; widget_source: string }[] };
    expect(rows[0].fallback).toBe(true);
    expect(rows[0].widget_source).toBe(shown[0].companion);
  });

  it("gives none after Stop, with widget_source none", async () => {
    const db = await testDb();
    await atConcept(db);
    const never = new Promise<never>(() => {});
    const { client, requests } = scriptedClient([{ content: [{ type: "text", text: CONCEPT }], holdAfterFirstText: never }]);
    const running = (async () => {
      const out: TurnEvent[] = [];
      for await (const e of runTutorTurn({ db, client, map, learnerId: me }, "Tell me more")) out.push(e);
      return out;
    })();
    while (requests.length < 1) await new Promise((r) => setTimeout(r, 5));
    await requestStop(db, me);
    const events = await running;
    const done = events.find((e) => e.type === "done") as Extract<TurnEvent, { type: "done" }>;
    expect(await widgetsOfTurn(db, done.ref.sessionId, done.ref.turnSeq)).toEqual([]);
    expect((await sources(db)).at(-1)).toBe("none");
  });

  it("gives none in an engine-off Session, with widget_source null", async () => {
    const db = await testDb();
    await engineOff(db);
    const { sessionId, turnSeq } = await turn(db, "What is a basis point?", [say(CONCEPT)]);
    expect(await widgetsOfTurn(db, sessionId, turnSeq)).toEqual([]);
    expect(await sources(db)).toEqual([null]);
  });

  it("applies the migration that adds reply_checks.widget_source on PGlite", async () => {
    const db = await testDb();
    const { rows } = (await db.execute(
      sql`select data_type from information_schema.columns where table_name = 'reply_checks' and column_name = 'widget_source'`,
    )) as unknown as { rows: { data_type: string }[] };
    expect(rows).toEqual([{ data_type: "text" }]);
  });

  it("still saves the record and its Reply kind when the widget_source column is missing", async () => {
    const db = await testDb();
    await db.execute(sql`alter table reply_checks drop column widget_source`);
    const { sessionId, turnSeq } = await turn(db, "What is a basis point?", [say(CONCEPT)]);
    const { rows } = (await db.execute(sql`select reply_kind from reply_checks`)) as unknown as { rows: { reply_kind: string | null }[] };
    expect(rows).toEqual([{ reply_kind: "answer_question" }]);
    expect(await widgetsOfTurn(db, sessionId, turnSeq)).toHaveLength(1);
  });
});
