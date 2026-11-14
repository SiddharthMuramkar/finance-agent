import { unstable_cache } from "next/cache";
import { loadCaseData, type CaseData } from "@/case-data/case-data";
import { loadCourseMap, type CourseMap } from "@/course/map";
import type { Progress } from "@/course/navigator";
import { readHomeAnnuity, type HomeAnnuity } from "@/course/home-annuity";
import { writtenAheadWidgets } from "@/course/written-ahead";
import { parsedChildren } from "@/widgets/check";
import { getDb } from "@/db/client";
import type { Db } from "@/db/types";
import { e2eEnabled } from "@/dev/e2e-mode";
import { HOME_WIDGET } from "./home-widget-spec";

// What Home's Explorable draws (the owner's design E, 11 Nov 2026): Present value's annuity, read from the Topic file's
// annuity Widget (home-widget-spec.ts names it; the course check reads it too), and its Cases' data, signed out.

/** What Home draws: the annuity and its rate slider, and its Cases' data, read on the server under the signed-out rule. */
export type HomeWidgetData = { annuity: HomeAnnuity; cases: CaseData[] };

/** A visitor who is not signed in: nothing has been revealed to them. */
const SIGNED_OUT: Progress = { currentTopicId: null, topics: {} };

/**
 * The annuity in Present value's annuity Widget, as the Topic file writes it (before any reveal). Null when the Topic or
 * the Widget is missing, or it cannot be read (the course check fails first in that case).
 */
export function homeAnnuity(map: CourseMap): HomeAnnuity | null {
  const topic = map.topic(HOME_WIDGET.topic);
  const widget = topic && writtenAheadWidgets(topic).find((w) => w.id === HOME_WIDGET.widget);
  const read = widget ? readHomeAnnuity(widget.code, parsedChildren(widget.code)) : null;
  return read?.ok ? read.annuity : null;
}

/** The Widget's Topic's Cases' data, read under the signed-out as-of rule: nothing dated after a Case's as-of date. */
export async function signedOutCases(db: Db, map: CourseMap): Promise<CaseData[]> {
  const cases = await Promise.all((map.topic(HOME_WIDGET.topic)?.cases ?? []).map((c) => loadCaseData(db, map, SIGNED_OUT, c.id)));
  return cases.filter((c): c is CaseData => !!c);
}

/** The annuity and its Cases' data (`readCases`, signedOutCases or its cached copy); null without the annuity. */
export async function loadHomeWidget(map: CourseMap, readCases: (map: CourseMap) => Promise<CaseData[]>): Promise<HomeWidgetData | null> {
  const annuity = homeAnnuity(map);
  return annuity ? { annuity, cases: await readCases(map) } : null;
}

// Only the Case Data is cached (the annuity comes from the Topic file, so it follows each deploy). Cached for a day,
// like the Library count, so bots hitting the public page don't wake the database.
const cachedCases = unstable_cache((): Promise<CaseData[]> => signedOutCases(getDb(), loadCourseMap()), ["home-widget-case-data"], { revalidate: 86400 });

/**
 * Home's Widget, its Case Data from the day-long cache. If it can't be read it logs and Home shows no Widget. The browser
 * test bed (E2E=1, never in production) reads it fresh instead, so a Case Data fixture seeded during a run shows at once.
 */
export async function homeWidget(): Promise<HomeWidgetData | null> {
  try {
    return await loadHomeWidget(loadCourseMap(), e2eEnabled(process.env) ? (map) => signedOutCases(getDb(), map) : () => cachedCases());
  } catch (error) {
    console.error("Home could not read its Widget's Case Data", error);
    return null;
  }
}
