import { afterEach, describe, expect, it } from "vitest";
import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";
import { noteItems, OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { apply0036, testDb, testDbWithout0036 } from "@/test/pglite";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import { widgetsIn, type ThreadLine } from "@/app/thread";
import { forgetTurnColumns, loadSessionItems } from "@/tutor/session-items";
import { loadSession, loadThread } from "@/tutor/transcript";
import { runTutorTurn, type TurnEvent, type TurnInput } from "@/tutor/turn";
import { WIDGET_SHOWN, type ShownWidget } from "@/widgets/shown-widget";
import { splitReply } from "@/widgets/split";
import { loadSaved, removeSaved, saveToNotes, type SaveRequest } from "./saved";

/**
 * Save to Notebook around a Next (whole turns, PGlite and a scripted Tutor). A Next's step Widget (here the Concept card's
 * preset) is stored by code when the Learner presses Next, after the previous reply's last message and before the Next
 * turn's own message. It belongs to the Next's reply, as the one-Widget check and the Companion gate count it
 * (turnItems), so a saved reply keeps it with the Next's reply and never with the reply before.
 */

const me = OWNER_LEARNER_ID;
const t0 = new Date("2026-11-04T10:00:00Z");

function mapOf(data: object): CourseMap {
  const { map, errors } = parseCourseMap([topicFileOf(data)]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}

const demo = mapOf(CONVERTED_TOPIC_DATA);
const say = (text: string): ScriptedReply => ({ content: [{ type: "text", text }] });

async function turn(db: Db, input: TurnInput, replies: ScriptedReply[]): Promise<{ sessionId: number; turnSeq: number; events: TurnEvent[] }> {
  const { client } = scriptedClient(replies);
  const events: TurnEvent[] = [];
  for await (const e of runTutorTurn({ db, client, map: demo, learnerId: me, now: () => t0 }, input)) events.push(e);
  const done = events.find((e) => e.type === "done") as Extract<TurnEvent, { type: "done" }>;
  return { sessionId: done.ref.sessionId, turnSeq: done.ref.turnSeq, events };
}

/** The Widget codes a saved reply carries, in order. */
async function savedReplyWidgets(db: Db, sessionId: number, turnSeq: number): Promise<string[]> {
  const saved = await saveToNotes(db, demo, { kind: "reply", sessionId, turnSeq }, t0, me);
  expect(saved.ok).toBe(true);
  const item = [...(await loadSaved(db, demo, me)).values()].flat().find((i) => i.kind === "reply" && i.again.kind === "reply" && i.again.turnSeq === turnSeq);
  if (item?.kind !== "reply") throw new Error(`No saved reply for turn ${turnSeq}`);
  return splitReply(item.text).flatMap((p) => (p.type === "widget" ? [p.code.trim()] : []));
}

describe("Save to Notebook around a Next", () => {
  afterEach(forgetTurnColumns);

  it("keeps the Next's step Widget with the Next's reply, not with the reply before it", async () => {
    await nextAfterOpener(await testDb());
  });

  it("does the same before migration 0036 is applied, by the rule for items stored without their turn", async () => {
    // session_items as it was before 0036: no turn_id or stored_by.
    const db = await testDbWithout0036();
    forgetTurnColumns();
    await nextAfterOpener(db);
  });

  it("still shows a Widget note saved when the step Widget was numbered under the reply before the Next", async () => {
    // Before this deploy, the panel and the server numbered a Next's step Widget after the previous reply's own Widgets,
    // and note_items keeps only that number. The Session was written then, so its items have no turn.
    const db = await testDbWithout0036();
    forgetTurnColumns();
    const { opener, stepWidget, before } = await openerThenNext(db);
    const openerText = (await loadSession(db, opener.sessionId, demo, me)).find((l) => l.role === "assistant" && l.ref?.turnSeq === opener.turnSeq)!.text;
    const oldIndex = splitReply(openerText).filter((p) => p.type === "widget").length + before;
    const [note] = await db
      .insert(noteItems)
      .values({ learnerId: me, topicId: demo.topics[0].id, kind: "widget", sessionId: opener.sessionId, turnSeq: opener.turnSeq, widgetIndex: oldIndex, createdAt: t0, updatedAt: t0 })
      .returning({ id: noteItems.id });
    const widgetNote = async (id: number) => {
      const kept = [...(await loadSaved(db, demo, me)).values()].flat().find((i) => i.id === id);
      return kept?.kind === "widget" ? kept : undefined;
    };
    expect((await widgetNote(note.id))?.code.trim()).toBe(stepWidget);
    // After the migration too: the Session's old items still have no turn.
    await apply0036(db);
    forgetTurnColumns();
    const kept = await widgetNote(note.id);
    expect(kept?.code.trim()).toBe(stepWidget);
    // Remove, then Undo: the note's own "save again" puts the same Widget back.
    expect(await removeSaved(db, note.id, me)).toBe(true);
    const again = await saveToNotes(db, demo, kept!.again as SaveRequest, t0, me);
    expect(again.ok).toBe(true);
    expect(again.ok && (await widgetNote(again.id))?.code.trim()).toBe(stepWidget);
  });
});

/** The opener, then a Next into the Concept step: the card's preset is saved with the Next's reply only. */
async function nextAfterOpener(db: Db) {
  const { opener, next, stepWidget } = await openerThenNext(db);
  expect(await savedReplyWidgets(db, opener.sessionId, opener.turnSeq)).not.toContain(stepWidget);
  expect(await savedReplyWidgets(db, next.sessionId, next.turnSeq)).toEqual([stepWidget]);
  // The Widget panel's own Save to Notebook, from the thread as the page loads it, saves that same Widget.
  const lines = (await loadThread(db, next.sessionId, demo, me)).map((l, i): ThreadLine => ({ ...l, id: `saved-${i}` }));
  const panel = widgetsIn(lines).find((w) => w.code.trim() === stepWidget);
  expect(panel?.save).toMatchObject({ kind: "widget", sessionId: next.sessionId, turnSeq: next.turnSeq });
  const saved = await saveToNotes(db, demo, panel!.save as SaveRequest, t0, me);
  expect(saved.ok).toBe(true);
  const kept = [...(await loadSaved(db, demo, me)).values()].flat().find((i) => saved.ok && i.id === saved.id);
  expect(kept?.kind === "widget" && kept.code.trim()).toBe(stepWidget);
}

async function openerThenNext(db: Db) {
  const opener = await turn(db, { opener: true }, [say("Picture February 1994. Bond traders are waiting for news.")]);
  const before = (await loadSessionItems(db, opener.sessionId, me)).filter((i) => i.kind === WIDGET_SHOWN).length;
  const next = await turn(db, { next: "concept" }, [say("A basis point is one hundredth of a percentage point.\n\nWhich word fits?")]);
  // The card's preset, stored by the Next before its turn's message: the Next's one Widget.
  const shown = (await loadSessionItems(db, next.sessionId, me)).filter((i) => i.kind === WIDGET_SHOWN).map((i) => i.data as ShownWidget);
  expect(shown.length).toBe(before + 1);
  return { opener, next, stepWidget: shown[before].code.trim(), before };
}
