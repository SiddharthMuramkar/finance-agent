import type { CaseData } from "@/case-data/case-data";
import { exploreWidgetFor } from "@/course/explore-widget";
import type { CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { loadWidgetStates } from "@/learner/widget-state";
import type { OpenWidget } from "@/widgets/check";
import { readWidget, type SourcedLookup, type WidgetReading } from "@/widgets/widget-reading";
import { cleanSavedWidget, EXPLORE_WIDGET_KEY, MAX_WIDGET_KEY, widgetKey, type WidgetStates } from "@/widgets/widget-state";
import { caseDataFor } from "./tools";

/**
 * The Widgets open for a Tutor Turn, read for the Tutor (spec #119, "Widgets › What the Tutor sees"): the Widgets
 * the Session's replies drew, plus the Topic's explore Widget while the Learner has it, each at the slider values
 * and ticks the page sent with the turn (else those saved with the Session), with our parts' readouts worked out
 * by code from the Case Data the as-of rule allows the Learner now.
 */

/** A Widget open in the panel, by its Widget key (the title, or "explore" for the explore Widget). */
export type KeyedWidget = { key: string; code: string; explore: boolean };

/** What the page sent as its Widgets' state, cleaned: only well-formed entries, at most 20 of them. */
export function cleanSentWidgets(raw: unknown): WidgetStates {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const entries = Object.entries(raw as Record<string, unknown>).flatMap(([key, value]) => {
    const state = key.trim() && key.length <= MAX_WIDGET_KEY ? cleanSavedWidget(value) : null;
    return state ? [[key, state] as const] : [];
  });
  return Object.fromEntries(entries.slice(0, 20));
}

/** The Widgets open in the panel: those the Session's replies drew (`drawn`), then the explore Widget if the Learner has it. */
export async function openWidgetsForTurn(db: Db, map: CourseMap, learnerId: number, drawn: readonly OpenWidget[], withExplore: boolean): Promise<KeyedWidget[]> {
  const tutors = drawn.flatMap((w) => {
    const key = widgetKey(w.title);
    return key ? [{ key, code: w.code, explore: false }] : [];
  });
  const explore = withExplore ? exploreWidgetFor(map, await loadProgress(db, learnerId)) : null;
  return explore ? [...tutors, { key: EXPLORE_WIDGET_KEY, code: explore.code, explore: true }] : tutors;
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
    const reading = readWidget(widget.code, states[widget.key], lookup, widget.explore);
    return reading ? [{ widget, reading }] : [];
  });
}
