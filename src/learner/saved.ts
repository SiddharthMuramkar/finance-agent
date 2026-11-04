import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { exploreWidgetOf } from "@/course/explore-widget";
import { navigate } from "@/course/navigator";
import { messages, noteItems, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadSessionItems, type StoredItem } from "@/tutor/session-items";
import { lastTopicTitle, rowsThroughTurn } from "@/tutor/session-summary";
import { loadSession, type Line } from "@/tutor/transcript";
import { widgetParts } from "@/widgets/check";
import { applySettings, cleanSettings } from "@/widgets/settings";
import { asFence, shownWidgetOf, WIDGET_SHOWN } from "@/widgets/shown-widget";
import { splitReply } from "@/widgets/split";
import { loadProgress } from "./memory";
import { loadWidgetState } from "./widget-state";

/**
 * "Save to notes": a Tutor reply, or a Widget, kept on a Topic Note. Only a pointer is stored (table
 * note_items): the Session and turn of the reply, and for a Widget its number in the reply and the
 * settings the Learner had. What is shown is rebuilt on read from the stored Session, so a saved reply
 * is drawn like an old Session (sources folded, the as-of rule applied now) and a Widget's code always
 * comes from the stored reply or the Topic file, never from the browser.
 *
 * Saved items are one Learner's: each is saved once per Learner, and a Session or saved item of
 * another Learner is no such thing (404).
 */

/** A saved Widget with this index is the Topic's own explore Widget, whose code is in the Topic file. */
export const EXPLORE_INDEX = -1;
export const MAX_SETTINGS = 20;

export type SaveRequest =
  | { kind: "reply"; sessionId: number; turnSeq: number }
  /**
   * `widgetKey`: the key the Widget's state is saved under in that Session; what is saved there is what the note keeps.
   * `topicId`: for the explore Widget, the Topic it is saved on (Undo sends it), so that does not hang on where the Learner is now.
   */
  | { kind: "widget"; sessionId?: number; turnSeq?: number; widgetIndex: number; settings?: unknown; widgetKey?: string; topicId?: string };

export type SaveResult = { ok: true; id: number; topicId: string } | { ok: false; reason: string; status: 400 | 404 };

/** What saves an item again: the place it came from and, for a Widget, its settings. Undo after a removal sends it back. */
export type SaveAgain =
  | { kind: "reply"; sessionId: number; turnSeq: number }
  | { kind: "widget"; sessionId?: number; turnSeq?: number; widgetIndex: number; settings?: Record<string, number>; topicId?: string };

/** One saved item on a Topic Note, ready to draw. */
export type SavedItem =
  | { id: number; kind: "reply"; text: string; savedAt: Date; again: SaveAgain }
  /** `code` already carries the settings the Learner had. */
  | { id: number; kind: "widget"; code: string; title: string | null; savedAt: Date; again: SaveAgain };

const notFound = (reason: string): SaveResult => ({ ok: false, reason, status: 404 });
const refused = (reason: string): SaveResult => ({ ok: false, reason, status: 400 });

/** The Topic a turn was taught under: the last Topic the Tutor's context named by then, else the Learner's current Topic. */
async function topicOfTurn(db: Db, map: CourseMap, sessionId: number | undefined, turnSeq: number | undefined, learnerId: number): Promise<string | undefined> {
  if (sessionId !== undefined) {
    // Up to the end of the turn, not its start: a changed context is stored right after the Learner's message.
    const all = await db
      .select({ seq: messages.seq, role: messages.role, content: messages.content })
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.seq));
    const title = lastTopicTitle(turnSeq === undefined ? all : rowsThroughTurn(all, turnSeq));
    const topic = title ? map.topics.find((t) => t.title === title) : undefined;
    if (topic) return topic.id;
  }
  return navigate(map, await loadProgress(db, learnerId))?.topic.id;
}

const replyOf = (lines: Line[], turnSeq: number) => lines.find((l) => l.role === "assistant" && l.ref?.turnSeq === turnSeq);

/** The complete Widgets of a reply, in order: the same count the browser numbers them by. */
const widgetsOf = (text: string) => splitReply(text).flatMap((s) => (s.type === "widget" && s.complete ? [s.code] : []));

/** What tells a turn's span and its shown Widgets: the Session's message seqs and its stored items. */
type SessionFacts = { rows: { seq: number; role: string; content: unknown }[]; items: StoredItem[] };

async function sessionFacts(db: Db, sessionId: number, learnerId: number): Promise<SessionFacts> {
  const rows = await db.select({ seq: messages.seq, role: messages.role, content: messages.content }).from(messages).where(eq(messages.sessionId, sessionId)).orderBy(asc(messages.seq));
  return { rows, items: await loadSessionItems(db, sessionId, learnerId) };
}

/**
 * A reply's text with the Widgets show_widget gave it (WIDGET_SHOWN items, ADR 0005) added after it as fences, so a
 * saved reply keeps them and Notes draws them like any fenced Widget. They are numbered after the reply's own fences.
 * The items of a turn are those stored after its first message and before the next turn's.
 */
function withShownWidgets(text: string, facts: SessionFacts, turnSeq: number): string {
  const turn = rowsThroughTurn(facts.rows, turnSeq);
  const end = turn.length ? turn[turn.length - 1].seq : turnSeq;
  const next = facts.rows.find((r) => r.seq > end);
  const fences = facts.items.flatMap((i) => {
    const shown = i.kind === WIDGET_SHOWN && i.afterSeq >= turnSeq && (!next || i.afterSeq < next.seq) ? shownWidgetOf(i.data) : null;
    return shown ? [asFence(shown.code)] : [];
  });
  return fences.length ? [text, ...fences].join("\n\n") : text;
}

/** True when the Session is this Learner's own. */
async function ownSession(db: Db, sessionId: number, learnerId: number): Promise<boolean> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.learnerId, learnerId)));
  return rows.length > 0;
}

/**
 * Saves a reply, or a Widget with its settings, on the right Topic's Note of this Learner. Saving the same thing
 * again changes nothing (a Widget's settings are updated). Another Learner's Session is no such Session.
 */
export async function saveToNotes(db: Db, map: CourseMap, request: SaveRequest, now = new Date(), learnerId: number): Promise<SaveResult> {
  const req = await withSavedState(db, request, learnerId);
  if (req.kind === "widget" && req.widgetIndex === EXPLORE_INDEX) {
    if (req.sessionId !== undefined && !(await ownSession(db, req.sessionId, learnerId))) return notFound("That Session does not exist.");
    const topicId = req.topicId ?? (await topicOfTurn(db, map, req.sessionId, undefined, learnerId));
    const topic = topicId ? map.topic(topicId) : undefined;
    const code = topic ? exploreWidgetOf(topic)?.code : undefined;
    if (!topicId || !code) return notFound("There is no explore Widget to save.");
    return keep(db, learnerId, { topicId, kind: "widget", sessionId: req.sessionId ?? null, turnSeq: null, widgetIndex: EXPLORE_INDEX }, code, req.settings, now);
  }
  if (req.sessionId === undefined || req.turnSeq === undefined) return refused("Say which reply to save.");
  const reply = (await ownSession(db, req.sessionId, learnerId)) ? replyOf(await loadSession(db, req.sessionId, map, learnerId), req.turnSeq) : undefined;
  if (!reply) return notFound("That reply does not exist.");
  const topicId = await topicOfTurn(db, map, req.sessionId, req.turnSeq, learnerId);
  if (!topicId) return notFound("There is no Topic to save it on.");
  const key = { topicId, sessionId: req.sessionId, turnSeq: req.turnSeq };
  if (req.kind === "reply") return keep(db, learnerId, { ...key, kind: "reply", widgetIndex: null }, undefined, undefined, now);
  const withShown = withShownWidgets(reply.text, await sessionFacts(db, req.sessionId, learnerId), req.turnSeq);
  const code = Number.isInteger(req.widgetIndex) ? widgetsOf(withShown)[req.widgetIndex] : undefined;
  if (code === undefined) return notFound("That reply has no such Widget.");
  return keep(db, learnerId, { ...key, kind: "widget", widgetIndex: req.widgetIndex }, code, req.settings, now);
}

/**
 * A Widget saved under its Widget key keeps the values saved with the Session under that key (Widget state), so the
 * note and the Session agree; with nothing saved there yet, the numbers the browser sent. Another Learner's
 * Session has no saved state for them (and is refused as no such Session below).
 */
async function withSavedState(db: Db, req: SaveRequest, learnerId: number): Promise<SaveRequest> {
  if (req.kind !== "widget" || req.widgetKey === undefined || req.sessionId === undefined) return req;
  const state = await loadWidgetState(db, req.sessionId, req.widgetKey, learnerId);
  return state ? { ...req, settings: state.values } : req;
}

type Key = { topicId: string; kind: "reply" | "widget"; sessionId: number | null; turnSeq: number | null; widgetIndex: number | null };

async function keep(db: Db, learnerId: number, key: Key, code: string | undefined, rawSettings: unknown, now: Date): Promise<SaveResult> {
  const widgetState = code === undefined ? null : cleanSettings(code, rawSettings);
  if (widgetState && Object.keys(widgetState).length > MAX_SETTINGS) return refused("Too many settings.");
  const same = and(
    eq(noteItems.learnerId, learnerId),
    eq(noteItems.topicId, key.topicId),
    eq(noteItems.kind, key.kind),
    key.sessionId === null ? isNull(noteItems.sessionId) : eq(noteItems.sessionId, key.sessionId),
    key.turnSeq === null ? isNull(noteItems.turnSeq) : eq(noteItems.turnSeq, key.turnSeq),
    key.widgetIndex === null ? isNull(noteItems.widgetIndex) : eq(noteItems.widgetIndex, key.widgetIndex),
  );
  // Insert first and let the unique index (note_items_saved_once) turn a double click or a second tab into "already there".
  const [row] = await db.insert(noteItems).values({ learnerId, ...key, widgetState, createdAt: now, updatedAt: now }).onConflictDoNothing().returning({ id: noteItems.id });
  if (row) return { ok: true, id: row.id, topicId: key.topicId };
  const [existing] = await db.select({ id: noteItems.id }).from(noteItems).where(same);
  if (widgetState) await db.update(noteItems).set({ widgetState, updatedAt: now }).where(eq(noteItems.id, existing.id));
  return { ok: true, id: existing.id, topicId: key.topicId };
}

/** Takes one of this Learner's saved replies or Widgets off its Topic Note. False when they have no such item. Their own lines are not touched. */
export async function removeSaved(db: Db, id: number, learnerId: number): Promise<boolean> {
  const rows = await db
    .delete(noteItems)
    .where(and(eq(noteItems.id, id), eq(noteItems.learnerId, learnerId), inArray(noteItems.kind, ["reply", "widget"])))
    .returning({ id: noteItems.id });
  return rows.length > 0;
}

/**
 * Every saved reply and Widget of this Learner by Topic, oldest first. Each Session is read once, with the Course Map,
 * so a reply's sources are folded and the as-of rule applies as it does in an old Session: a passage
 * the Learner has not yet earned the right to see stays hidden until the Case's reveal.
 */
export async function loadSaved(db: Db, map: CourseMap, learnerId: number): Promise<Map<string, SavedItem[]>> {
  const rows = (await db
    .select()
    .from(noteItems)
    // Replies and Widgets only: the Learner's own lines and saved rules are listed as lines by notes.ts.
    .where(and(eq(noteItems.learnerId, learnerId), inArray(noteItems.kind, ["reply", "widget"])))
    .orderBy(asc(noteItems.id))) as (typeof noteItems.$inferSelect)[];
  const sessionLines = new Map<number, Line[]>();
  const sessionFactsOf = new Map<number, SessionFacts>();
  for (const id of new Set(rows.flatMap((r) => (r.sessionId === null ? [] : [r.sessionId])))) {
    sessionLines.set(id, await loadSession(db, id, map, learnerId));
    sessionFactsOf.set(id, await sessionFacts(db, id, learnerId));
  }
  // A saved reply keeps the Widgets shown for it, so the note draws them with its text.
  const textOfReply = (r: { sessionId: number | null; turnSeq: number | null }, reply: Line) =>
    r.sessionId !== null && r.turnSeq !== null && sessionFactsOf.has(r.sessionId) ? withShownWidgets(reply.text, sessionFactsOf.get(r.sessionId)!, r.turnSeq) : reply.text;
  const out = new Map<string, SavedItem[]>();
  for (const r of rows) {
    const reply = r.sessionId !== null && r.turnSeq !== null ? replyOf(sessionLines.get(r.sessionId) ?? [], r.turnSeq) : undefined;
    let item: SavedItem | undefined;
    if (r.kind === "reply" && reply && r.sessionId !== null && r.turnSeq !== null)
      item = { id: r.id, kind: "reply", text: textOfReply(r, reply), savedAt: r.createdAt, again: { kind: "reply", sessionId: r.sessionId, turnSeq: r.turnSeq } };
    else if (r.kind === "widget") {
      const exploreTopic = r.widgetIndex === EXPLORE_INDEX ? map.topic(r.topicId) : undefined;
      const base = exploreTopic ? exploreWidgetOf(exploreTopic)?.code : reply ? widgetsOf(textOfReply(r, reply))[r.widgetIndex ?? -2] : undefined;
      if (base !== undefined) {
        const code = applySettings(base, r.widgetState);
        const again: SaveAgain = {
          kind: "widget",
          ...(r.sessionId !== null && { sessionId: r.sessionId }),
          ...(r.turnSeq !== null && { turnSeq: r.turnSeq }),
          widgetIndex: r.widgetIndex ?? EXPLORE_INDEX,
          // The explore Widget goes back on its own Topic, wherever the Learner is when they press Undo.
          ...(exploreTopic && { topicId: r.topicId }),
          ...(r.widgetState && { settings: r.widgetState }),
        };
        item = { id: r.id, kind: "widget", code, title: widgetParts(code).title ?? null, savedAt: r.createdAt, again };
      }
    }
    if (item) out.set(r.topicId, [...(out.get(r.topicId) ?? []), item]);
  }
  return out;
}
