import { and, asc, eq, isNull, ne } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { messages, noteItems, OWNER_LEARNER_ID, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { lastTopicTitle, rowsThroughTurn } from "@/tutor/session-summary";
import { loadSession, type Line } from "@/tutor/transcript";
import { widgetParts } from "@/widgets/check";
import { applySettings, cleanSettings } from "@/widgets/settings";
import { splitReply } from "@/widgets/split";
import { loadProgress } from "./memory";

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
  | { kind: "widget"; sessionId?: number; turnSeq?: number; widgetIndex: number; settings?: unknown };

export type SaveResult = { ok: true; id: number; topicId: string } | { ok: false; reason: string; status: 400 | 404 };

/** What saves an item again: the place it came from and, for a Widget, its settings. Undo after a removal sends it back. */
export type SaveAgain =
  | { kind: "reply"; sessionId: number; turnSeq: number }
  | { kind: "widget"; sessionId?: number; turnSeq?: number; widgetIndex: number; settings?: Record<string, number> };

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
export async function saveToNotes(db: Db, map: CourseMap, req: SaveRequest, now = new Date(), learnerId = OWNER_LEARNER_ID): Promise<SaveResult> {
  if (req.kind === "widget" && req.widgetIndex === EXPLORE_INDEX) {
    if (req.sessionId !== undefined && !(await ownSession(db, req.sessionId, learnerId))) return notFound("That Session does not exist.");
    const topicId = await topicOfTurn(db, map, req.sessionId, undefined, learnerId);
    const code = topicId ? map.topic(topicId)?.explore?.widget : undefined;
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
  const code = Number.isInteger(req.widgetIndex) ? widgetsOf(reply.text)[req.widgetIndex] : undefined;
  if (code === undefined) return notFound("That reply has no such Widget.");
  return keep(db, learnerId, { ...key, kind: "widget", widgetIndex: req.widgetIndex }, code, req.settings, now);
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
export async function removeSaved(db: Db, id: number, learnerId = OWNER_LEARNER_ID): Promise<boolean> {
  const rows = await db
    .delete(noteItems)
    .where(and(eq(noteItems.id, id), eq(noteItems.learnerId, learnerId), ne(noteItems.kind, "line")))
    .returning({ id: noteItems.id });
  return rows.length > 0;
}

/**
 * Every saved reply and Widget of this Learner by Topic, oldest first. Each Session is read once, with the Course Map,
 * so a reply's sources are folded and the as-of rule applies as it does in an old Session: a passage
 * the Learner has not yet earned the right to see stays hidden until the Case's reveal.
 */
export async function loadSaved(db: Db, map: CourseMap, learnerId = OWNER_LEARNER_ID): Promise<Map<string, SavedItem[]>> {
  const rows = (await db
    .select()
    .from(noteItems)
    .where(and(eq(noteItems.learnerId, learnerId), ne(noteItems.kind, "line")))
    .orderBy(asc(noteItems.id))) as (typeof noteItems.$inferSelect)[];
  const sessionLines = new Map<number, Line[]>();
  for (const id of new Set(rows.flatMap((r) => (r.sessionId === null ? [] : [r.sessionId])))) sessionLines.set(id, await loadSession(db, id, map, learnerId));
  const out = new Map<string, SavedItem[]>();
  for (const r of rows) {
    const reply = r.sessionId !== null && r.turnSeq !== null ? replyOf(sessionLines.get(r.sessionId) ?? [], r.turnSeq) : undefined;
    let item: SavedItem | undefined;
    if (r.kind === "reply" && reply && r.sessionId !== null && r.turnSeq !== null)
      item = { id: r.id, kind: "reply", text: reply.text, savedAt: r.createdAt, again: { kind: "reply", sessionId: r.sessionId, turnSeq: r.turnSeq } };
    else if (r.kind === "widget") {
      const base = r.widgetIndex === EXPLORE_INDEX ? map.topic(r.topicId)?.explore?.widget : reply ? widgetsOf(reply.text)[r.widgetIndex ?? -2] : undefined;
      if (base !== undefined) {
        const code = applySettings(base, r.widgetState);
        const again: SaveAgain = {
          kind: "widget",
          ...(r.sessionId !== null && { sessionId: r.sessionId }),
          ...(r.turnSeq !== null && { turnSeq: r.turnSeq }),
          widgetIndex: r.widgetIndex ?? EXPLORE_INDEX,
          ...(r.widgetState && { settings: r.widgetState }),
        };
        item = { id: r.id, kind: "widget", code, title: widgetParts(code).title ?? null, savedAt: r.createdAt, again };
      }
    }
    if (item) out.set(r.topicId, [...(out.get(r.topicId) ?? []), item]);
  }
  return out;
}
