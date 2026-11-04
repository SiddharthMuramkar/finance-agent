import { loadCaseData } from "@/case-data/case-data";
import type { CourseMap } from "@/course/map";
import { navigate, stepSetting, type Progress } from "@/course/navigator";
import { WIDGET_OPENED, writtenAheadFor, writtenAheadWidgets, type WrittenAhead } from "@/course/written-ahead";
import type { Db } from "@/db/types";
import { loadSessionItems, saveItemAfterLatest, type SessionItem } from "./session-items";

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
