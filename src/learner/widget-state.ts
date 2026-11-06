import { and, eq } from "drizzle-orm";
import { sessions, widgetState } from "@/db/schema";
import type { Db } from "@/db/types";
import { cleanSavedWidget, MAX_WIDGET_KEY, type SavedWidget, type WidgetStates } from "@/widgets/widget-state";

/**
 * Widget state (spec #119, "Widgets › Widget state"): each Widget's slider values and ticked Guided Tasks in one
 * Session, saved per (Session, Widget key) in table widget_state. The key is the written-ahead Widget's id (the
 * explore Widget is one, so it is saved under its id), or the title of a Widget the Tutor drew. The Study Workspace reads a Session's
 * state with the Session and saves each change through /api/widget-state; Save to Notebook keeps the same values.
 *
 * Widget state is one Learner's: a Session of another Learner is no such Session (404).
 */

export type WidgetStateRequest = { sessionId: number; widgetKey: string; values: unknown; ticked: unknown };
export type WidgetStateResult = { ok: true } | { ok: false; status: 400 | 404; reason: string };

async function ownSession(db: Db, sessionId: number, learnerId: number): Promise<boolean> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.learnerId, learnerId)));
  return rows.length > 0;
}

/** Saves one Widget's state in one of this Learner's Sessions, replacing what was saved under that key. */
export async function saveWidgetState(db: Db, req: WidgetStateRequest, learnerId: number, now = new Date()): Promise<WidgetStateResult> {
  const state = cleanSavedWidget(req);
  if (!state || typeof req.widgetKey !== "string" || !req.widgetKey.trim() || req.widgetKey.length > MAX_WIDGET_KEY || !Number.isInteger(req.sessionId))
    return { ok: false, status: 400, reason: "Send a Session, a Widget key, slider values and ticked tasks." };
  if (!(await ownSession(db, req.sessionId, learnerId))) return { ok: false, status: 404, reason: "That Session does not exist." };
  const row = { sessionId: req.sessionId, widgetKey: req.widgetKey, learnerId, values: state.values, ticked: state.ticked, updatedAt: now };
  await db
    .insert(widgetState)
    .values(row)
    .onConflictDoUpdate({ target: [widgetState.sessionId, widgetState.widgetKey], set: { values: state.values, ticked: state.ticked, updatedAt: now } });
  return { ok: true };
}

/** What is saved for one Widget key in one of this Learner's Sessions, if anything. */
export async function loadWidgetState(db: Db, sessionId: number, widgetKey: string, learnerId: number): Promise<SavedWidget | undefined> {
  const [row] = await db
    .select({ values: widgetState.values, ticked: widgetState.ticked })
    .from(widgetState)
    .where(and(eq(widgetState.sessionId, sessionId), eq(widgetState.widgetKey, widgetKey), eq(widgetState.learnerId, learnerId)));
  return row;
}

/** Every Widget's saved state in one of this Learner's Sessions, by Widget key; nothing for another Learner's. */
export async function loadWidgetStates(db: Db, sessionId: number, learnerId: number): Promise<WidgetStates> {
  const rows = await db
    .select({ widgetKey: widgetState.widgetKey, values: widgetState.values, ticked: widgetState.ticked })
    .from(widgetState)
    .where(and(eq(widgetState.sessionId, sessionId), eq(widgetState.learnerId, learnerId)));
  return Object.fromEntries(rows.map((r) => [r.widgetKey, { values: r.values, ticked: r.ticked }]));
}
