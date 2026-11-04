import { unstable_cache } from "next/cache";
import { loadCaseData, type CaseData } from "@/case-data/case-data";
import { loadCourseMap, type CourseMap } from "@/course/map";
import type { Progress } from "@/course/navigator";
import { writtenAheadWidgets } from "@/course/written-ahead";
import { getDb } from "@/db/client";
import type { Db } from "@/db/types";
import { copy } from "./copy";

// Home's copy of Present value's annuity Widget (spec #119, "Widgets › Home's copy"): the same Widget, signed out,
// as it is before the Insight, with one Guided Task of Home's own.

/** The Topic and written-ahead Widget Home shows. */
const TOPIC = "present-value";
const WIDGET = "annuity-worth-today";

/** What Home draws: the Widget's code and its Cases' data, read on the server under the signed-out rule. */
export type HomeWidgetData = { code: string; cases: CaseData[] };

/** A visitor who is not signed in: nothing has been revealed to them. */
const SIGNED_OUT: Progress = { currentTopicId: null, topics: {} };

/**
 * The annuity Widget's code as written in the Topic file (before any reveal, so no 30-year Treasury button or task),
 * with its Guided Tasks swapped for Home's one. Null when the Topic or the Widget is missing.
 */
export function homeWidgetCode(map: CourseMap): string | null {
  const topic = map.topic(TOPIC);
  const widget = topic && writtenAheadWidgets(topic).find((w) => w.id === WIDGET);
  if (!widget) return null;
  const lines = widget.code.trimEnd().split("\n").filter((line) => !/^\w+ = GuidedTask\(/.test(line));
  const tasks = lines.map((line) => line.replace(/^(\w+ = )GuidedTasks\(\[[^\]]*\]\)$/, "$1GuidedTasks([homeTask])"));
  return [...tasks, `homeTask = GuidedTask(${JSON.stringify(copy.widget.task)}, $rate == 0)`].join("\n");
}

/** The Widget's Topic's Cases' data, read under the signed-out as-of rule: nothing dated after a Case's as-of date. */
export async function signedOutCases(db: Db, map: CourseMap): Promise<CaseData[]> {
  const cases = await Promise.all((map.topic(TOPIC)?.cases ?? []).map((c) => loadCaseData(db, map, SIGNED_OUT, c.id)));
  return cases.filter((c): c is CaseData => !!c);
}

/** The Widget's code and its Cases' data (`readCases`, signedOutCases or its cached copy); null without the Widget. */
export async function loadHomeWidget(map: CourseMap, readCases: (map: CourseMap) => Promise<CaseData[]>): Promise<HomeWidgetData | null> {
  const code = homeWidgetCode(map);
  return code ? { code, cases: await readCases(map) } : null;
}

// Only the Case Data is cached (the code comes from the Topic file, so it follows each deploy). Cached for a day,
// like the Library count, so bots hitting the public page don't wake the database.
const cachedCases = unstable_cache((): Promise<CaseData[]> => signedOutCases(getDb(), loadCourseMap()), ["home-widget-case-data"], { revalidate: 86400 });

/** Home's Widget, its Case Data from the day-long cache. If it can't be read it logs and Home shows no Widget. */
export async function homeWidget(): Promise<HomeWidgetData | null> {
  try {
    return await loadHomeWidget(loadCourseMap(), () => cachedCases());
  } catch (error) {
    console.error("Home could not read its Widget's Case Data", error);
    return null;
  }
}
