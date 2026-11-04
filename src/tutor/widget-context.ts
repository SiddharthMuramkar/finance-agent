import type { CaseData } from "@/case-data/case-data";
import { exploreAsSeen, exploreWidgetFor } from "@/course/explore-widget";
import type { CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { loadWidgetStates } from "@/learner/widget-state";
import { archetypeOf, widgetParts, widgetWarnings, type OpenWidget } from "@/widgets/check";
import { shownWidgetOf, WIDGET_SHOWN } from "@/widgets/shown-widget";
import { splitReply } from "@/widgets/split";
import { foundText, readWidget, type RateChangeSliders, type SourcedLookup, type WidgetReading } from "@/widgets/widget-reading";
import { cleanSavedWidget, MAX_WIDGET_KEY, widgetKey, type WidgetStates } from "@/widgets/widget-state";
import { currentTopicId, liveSession, openLog } from "./session-log";
import { caseDataFor, replyTexts } from "./tools";

export { replyTexts };
import { WIDGET_REPORT_PREFIX } from "./turn-status";
import { drawnWidgets, loadSessionItems, type StoredItem } from "./session-items";
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

/**
 * The two sliders of a shown rate_move Widget (spec #229): its RateMove part is given the old and new rates as `$old` and
 * `$new` (RATE_MOVE_STATE), the way Percent's written-ahead Widget says its rate change, so the Tutor is told the three
 * readouts by code. Undefined for a Widget with no sliders on the rates (practice mode, or any other Widget).
 */
export function rateMoveSliders(code: string): RateChangeSliders | undefined {
  const m = /RateMove\(\$(\w+),\s*\$(\w+)/.exec(code);
  return m ? { old: `$${m[1]}`, new: `$${m[2]}` } : undefined;
}

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
    const rateChange = rateMoveSliders(w.code);
    return key ? [{ key, code: w.code, explore: false, ...(rateChange && { rateChange }) }] : [];
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

/** How many of the latest Widgets' archetypes code tells the Tutor, so it does not draw the same kind back to back. */
export const RECENT_ARCHETYPES = 2;

type LogRow = { seq: number; role: string; content?: unknown };

/** True for a message the Learner (or code on their behalf) wrote, as opposed to tool results. */
const hasText = (row: LogRow) => row.role === "user" && (typeof row.content === "string" || (Array.isArray(row.content) && row.content.some((b) => (b as { type?: unknown })?.type === "text")));

/**
 * The "Widget notes" line code sends with the Learner's next message (UX audit §7.4 and §7.6): the archetypes of the
 * Session's latest Widgets (archetypeOf), drawn or shown by code, so the Tutor varies them; and the warnings about the
 * Widgets the Tutor wrote in its last reply (widgetWarnings), which never cost a correction round. Rows and items at or
 * after `beforeSeq` are left out. Null when there is nothing to say.
 */
export function widgetNotes(rows: readonly LogRow[], items: readonly StoredItem[], beforeSeq: number): string | null {
  const earlier = rows.filter((r) => r.seq < beforeSeq);
  // In Session order: an item stored after message s comes before the reply with seq s + 1.
  const written = replyTexts(earlier).flatMap((r) => fencesIn(r.text).map((code) => ({ at: r.seq, code })));
  const shown = items.flatMap((i) => {
    const widget = i.kind === WIDGET_SHOWN && i.afterSeq < beforeSeq ? shownWidgetOf(i.data) : null;
    return widget ? [{ at: i.afterSeq + 0.5, code: widget.code }] : [];
  });
  const ordered = [...written, ...shown].sort((a, b) => a.at - b.at);
  const archetypes = ordered.flatMap((w) => archetypeOf(w.code) ?? []).slice(-RECENT_ARCHETYPES);
  // The last reply: what the Tutor wrote after the latest message with text (the Learner's, or code's correction).
  const since = Math.max(-1, ...earlier.filter(hasText).map((r) => r.seq));
  const notes = written
    .filter((w) => w.at > since)
    .flatMap((w) => {
      const warnings = widgetWarnings(w.code);
      return warnings.length ? [`About "${widgetParts(w.code).title ?? "your last Widget"}": ${warnings.join(" ")}`] : [];
    });
  if (!archetypes.length && !notes.length) return null;
  const recent = archetypes.length ? [`Recent archetypes, latest last: ${archetypes.join(", ")}.`] : [];
  return [`Widget notes (code):`, ...recent, ...notes].join(" ");
}

/** The finished Widgets in a reply's text, in order. */
function fencesIn(text: string): string[] {
  return splitReply(text).flatMap((s) => (s.type === "widget" && s.complete ? [s.code] : []));
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
