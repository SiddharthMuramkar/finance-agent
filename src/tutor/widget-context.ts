import type { CaseData } from "@/case-data/case-data";
import { exploreAsSeen, exploreWidgetFor } from "@/course/explore-widget";
import type { CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { loadWidgetStates } from "@/learner/widget-state";
import type { OpenWidget } from "@/widgets/check";
import { foundText, readWidget, type RateChangeSliders, type SourcedLookup, type WidgetReading } from "@/widgets/widget-reading";
import { cleanSavedWidget, MAX_WIDGET_KEY, widgetKey, type WidgetStates } from "@/widgets/widget-state";
import { currentTopicId, liveSession, openLog } from "./session-log";
import { caseDataFor, replyTexts } from "./tools";

export { replyTexts };
import { WIDGET_REPORT_PREFIX } from "./turn-status";
import { drawnWidgets, loadSessionItems } from "./session-items";
import { loadWrittenAhead } from "./written-ahead";
import { WIDGET_OPENED } from "@/course/written-ahead";

/**
 * The Widgets open for a Tutor Turn, read for the Tutor (spec #119, "Widgets › What the Tutor sees"): the Widgets
 * the Session's replies drew, plus the Topic's explore Widget while the Learner has it, each at the slider values
 * and ticks the page sent with the turn (else those saved with the Session), with our parts' readouts worked out
 * by code from the Case Data the as-of rule allows the Learner now.
 */

/** A Widget open in the panel, by its Widget key (the title, or the written-ahead id, which the explore Widget has too). */
export type KeyedWidget = { key: string; code: string; explore: boolean; /** A written-ahead Widget's rate change, worked out by code. */ rateChange?: RateChangeSliders };

/** What the page sent as its Widgets' state, cleaned: only well-formed entries, at most 20 of them. */
export function cleanSentWidgets(raw: unknown): WidgetStates {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const entries = Object.entries(raw as Record<string, unknown>).flatMap(([key, value]) => {
    const state = key.trim() && key.length <= MAX_WIDGET_KEY ? cleanSavedWidget(value) : null;
    return state ? [[key, state] as const] : [];
  });
  return Object.fromEntries(entries.slice(0, 20));
}

/**
 * The Widgets open in the panel: those the Session's replies drew (`drawn`), the written-ahead Widgets the Tutor opened
 * in the Session (`session`, keyed by id, with their code as the Learner sees it now), then the explore Widget if the
 * Learner has it.
 */
export async function openWidgetsForTurn(
  db: Db,
  map: CourseMap,
  learnerId: number,
  drawn: readonly OpenWidget[],
  withExplore: boolean,
  session?: { id: number; topicId: string | null },
): Promise<KeyedWidget[]> {
  const tutors = drawn.flatMap((w) => {
    const key = widgetKey(w.title);
    return key ? [{ key, code: w.code, explore: false }] : [];
  });
  const progress = await loadProgress(db, learnerId);
  const opened = session ? new Set((await loadSessionItems(db, session.id, learnerId)).flatMap((i) => (i.kind === WIDGET_OPENED ? [i.data.id] : []))) : new Set();
  const found = withExplore ? exploreWidgetFor(map, progress) : null;
  // The explore Widget is a written-ahead Widget: read as the Learner sees it now (reveal task and all), under its id.
  const exploreAhead = found ? await loadWrittenAhead(db, map, progress, found.topicId) : [];
  const explore = found && exploreAsSeen(found, exploreAhead);
  const exploreChange = exploreAhead.find((w) => w.id === explore?.id)?.rateChange;
  const ahead = opened.size
    ? (await loadWrittenAhead(db, map, progress, session?.topicId))
        .filter((w) => opened.has(w.id) && w.id !== explore?.id)
        .map((w) => ({ key: w.id, code: w.code, explore: false, ...(w.rateChange && { rateChange: w.rateChange }) }))
    : [];
  return [...tutors, ...ahead, ...(explore ? [{ key: explore.id, code: explore.code, explore: true, ...(exploreChange && { rateChange: exploreChange }) }] : [])];
}

/** Reads a "caseId/datasetId" reference's latest point from the Case Data allowed now. */
function lookupIn(cases: readonly CaseData[]): SourcedLookup {
  return (reference) => {
    const [caseId, datasetId] = reference.split("/");
    const dataset = cases.find((c) => c.caseId === caseId)?.datasets.find((d) => d.id === datasetId);
    const point = dataset?.points.at(-1);
    return dataset && point ? { label: dataset.label, value: point.value, unit: dataset.unit, date: point.date } : undefined;
  };
}

/** Each open Widget as it stands: the page's sent state over what the Session saved. */
export async function readOpenWidgets(
  db: Db,
  map: CourseMap,
  learnerId: number,
  sessionId: number,
  open: readonly KeyedWidget[],
  sent: WidgetStates | undefined,
): Promise<{ widget: KeyedWidget; reading: WidgetReading }[]> {
  if (!open.length) return [];
  const states = { ...(await loadWidgetStates(db, sessionId, learnerId)), ...cleanSentWidgets(sent) };
  const cases = await caseDataFor(db, map, navigate(map, await loadProgress(db, learnerId)), learnerId);
  const lookup = lookupIn(cases);
  return open.flatMap((widget) => {
    const reading = readWidget(widget.code, states[widget.key], lookup, widget.explore, widget.rateChange);
    return reading ? [{ widget, reading }] : [];
  });
}

/** Why a widget report is refused: nothing was saved or sent. */
export const REPORT_NOT_READY = "Tick every Guided Task under this Widget first, then tell the Tutor what you found.";

/**
 * The note code writes when the Learner presses "Tell the Tutor what I found" under the open Widget `key` of their
 * current Topic's Session: what that Widget shows, from its values and readouts. Refused unless the Widget is open
 * and every one of its Guided Tasks is ticked.
 */
export async function widgetReportNote(
  db: Db,
  map: CourseMap,
  learnerId: number,
  key: string,
  sent: WidgetStates | undefined,
): Promise<{ ok: true; note: string } | { ok: false; reason: string }> {
  const session = await liveSession(db, learnerId, await currentTopicId(db, map, learnerId));
  if (!session) return { ok: false, reason: REPORT_NOT_READY };
  const log = await openLog(db, session.id, () => new Date());
  const drawn = drawnWidgets(replyTexts(log.rows), await loadSessionItems(db, session.id, learnerId));
  const open = (await openWidgetsForTurn(db, map, learnerId, drawn, true, session)).filter((w) => w.key === key);
  const [read] = await readOpenWidgets(db, map, learnerId, session.id, open, sent);
  if (!read || !read.reading.tasks.length || !read.reading.tasks.every((t) => t.ticked)) return { ok: false, reason: REPORT_NOT_READY };
  return {
    ok: true,
    note: `${WIDGET_REPORT_PREFIX} the Learner pressed "Tell the Tutor what I found" under the Widget "${read.reading.title}", with all its Guided Tasks ticked, and has written nothing. Code wrote what the Widget shows: "${foundText(read.reading)}" These are not the Learner's own words, so they are never an attempt at the Insight. Respond to what they found, then invite them to say in their own words what it shows.`,
  };
}
