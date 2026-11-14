import { loadCaseData } from "@/case-data/case-data";
import type { CourseMap } from "@/course/map";
import { navigate, stepSetting, type Progress } from "@/course/navigator";
import { WIDGET_OPENED, writtenAheadFor, writtenAheadWidgets, type WrittenAhead } from "@/course/written-ahead";
import type { Db } from "@/db/types";
import { saveWidgetState } from "@/learner/widget-state";
import { declaredSettings } from "@/widgets/settings";
import { loadSessionItems, saveItemAfterLatest, type SessionItem } from "./session-items";
import type { WidgetStateEvent } from "./tools";

/**
 * A Topic's written-ahead Widgets as this Learner sees them now: their code from the Topic file, with a reveal task's
 * numbers read from the Topic's Case Data under the as-of rule for the Learner (so not before the reveal). None for a
 * Topic with none, or one not on the Course Map. Read by the Study Workspace and the old Session page on each render.
 */
export async function loadWrittenAhead(db: Db, map: CourseMap, progress: Progress, topicId: string | null | undefined): Promise<WrittenAhead[]> {
  const topic = topicId ? map.topic(topicId) : undefined;
  if (!topic?.widgets.length) return [];
  const read = new Set(topic.widgets.flatMap((w) => (w.revealTask ? [w.revealTask.case] : [])));
  const cases = await Promise.all([...read].map((caseId) => loadCaseData(db, map, progress, caseId)));
  return writtenAheadFor(topic, cases);
}

/**
 * The chip item for the Widget the Learner's current step opens by itself (the Topic's `steps[].opens`), or null when the
 * step opens none or the Learner has no place. `opened` are the ids of the Widgets this Session has already opened (a
 * Widget stays in the panel once opened, so it is not opened twice).
 */
export function stepWidgetItem(map: CourseMap, progress: Progress, opened: ReadonlySet<string>): SessionItem | null {
  const place = navigate(map, progress);
  const id = place ? stepSetting(place.topic, place.step, place.check)?.opens : undefined;
  if (!place || !id || opened.has(id)) return null;
  const widget = writtenAheadWidgets(place.topic).find((w) => w.id === id);
  return widget ? { kind: WIDGET_OPENED, data: { id: widget.id, title: widget.title } } : null;
}

/**
 * When a Teaching Step begins, code opens its Widget: stores the Widget opened item after the Session's latest message
 * (the chip stands where the step began; the page draws it on its next refresh). Returns the item it stored, or null.
 */
export async function openStepWidget(db: Db, map: CourseMap, progress: Progress, learnerId: number, sessionId: number, now: Date): Promise<SessionItem | null> {
  const stored = await loadSessionItems(db, sessionId, learnerId);
  const opened = new Set(stored.flatMap((i) => (i.kind === WIDGET_OPENED && typeof i.data.id === "string" ? [i.data.id] : [])));
  const item = stepWidgetItem(map, progress, opened);
  if (item) await saveItemAfterLatest(db, learnerId, sessionId, item, now);
  return item;
}

/** The chip item for a written-ahead Widget opened already set (ADR 0007): its id and title, and the preset the Tutor gave it. */
export function openedItem(widget: { id: string; title: string }, preset?: Record<string, number>): SessionItem {
  return { kind: WIDGET_OPENED, data: { id: widget.id, title: widget.title, ...(preset && Object.keys(preset).length ? { preset } : {}) } };
}

/**
 * Opens a Widget already set: saves its Widget state as the Widget's declared settings with the preset on top, so it
 * replaces what the Learner last set (ticked Guided Tasks stay), and returns the event that moves the open Widget in the
 * browser. Used by open_widget with a preset and by show_widget when the title already has saved state. The preset's
 * keys carry their `$`.
 */
export async function saveOpenedState(
  db: Db,
  learnerId: number,
  o: { sessionId: number; widgetKey: string; code: string; preset?: Record<string, number>; ticked?: readonly string[] },
  now: Date,
): Promise<{ ok: true; event: WidgetStateEvent } | { ok: false; reason: string }> {
  const values = { ...declaredSettings(o.code), ...o.preset };
  const saved = await saveWidgetState(db, { sessionId: o.sessionId, widgetKey: o.widgetKey, values, ticked: [...(o.ticked ?? [])] }, learnerId, now);
  if (!saved.ok) return { ok: false, reason: saved.reason };
  return { ok: true, event: { type: "widget_state", widgetKey: o.widgetKey, values } };
}
