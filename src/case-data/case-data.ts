import { and, asc, eq, lte } from "drizzle-orm";
import type { CourseMap } from "@/course/map";
import type { Progress } from "@/course/navigator";
import { caseDataPoints, caseDatasets } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";

export type CasePoint = { date: string; value: number };

/** One checked dataset of a Case, with its source, holding only the points the as-of rule allows. */
export type CaseDataset = {
  id: string;
  label: string;
  unit: string;
  source: string;
  sourceUrl: string;
  checkedOn: string;
  points: CasePoint[];
};

/**
 * The Cases whose Topic's reveal the Learner has seen: the reveal state the page's Case Data cache keys on
 * (case-data-cache.ts), so data fetched before a reveal is never served after it, nor the other way.
 */
export function revealedCases(map: CourseMap, progress: Progress): string[] {
  return map.topics.filter((t) => progress.topics[t.id]?.revealShown).flatMap((t) => t.cases.map((c) => c.id));
}

/** What a Case's data request returns: `revealed` is false while hindsight is withheld. */
export type CaseData = { caseId: string; asOf: string; revealed: boolean; datasets: CaseDataset[] };

/**
 * A Case's datasets under the as-of rule: until its Topic's reveal has been shown, nothing dated
 * after the Case's as-of date is returned, and a dataset with no earlier point is left out
 * altogether (its label alone could give the outcome away). Undefined for a Case not on the map.
 */
export async function loadCaseData(db: Db, map: CourseMap, progress: Progress, caseId: string): Promise<CaseData | undefined> {
  const topic = map.topics.find((t) => t.cases.some((c) => c.id === caseId));
  if (!topic) return undefined;
  const { asOf } = topic.cases.find((c) => c.id === caseId)!;
  const revealed = progress.topics[topic.id]?.revealShown ?? false;
  const meta = await db.select().from(caseDatasets).where(eq(caseDatasets.caseId, caseId)).orderBy(asc(caseDatasets.datasetId));
  const points = await db
    .select()
    .from(caseDataPoints)
    .where(and(eq(caseDataPoints.caseId, caseId), revealed ? undefined : lte(caseDataPoints.date, asOf)))
    .orderBy(asc(caseDataPoints.date));
  const datasets = meta.flatMap((d): CaseDataset[] => {
    const own = points.filter((p) => p.datasetId === d.datasetId).map((p) => ({ date: p.date, value: p.value }));
    if (!own.length) return [];
    return [{ id: d.datasetId, label: d.label, unit: d.unit, source: d.source, sourceUrl: d.sourceUrl, checkedOn: d.checkedOn, points: own }];
  });
  return { caseId, asOf, revealed, datasets };
}

/** The server route's answer for one Case: its data under the as-of rule for this Learner's progress. No model call. */
export async function caseDataResponse(db: Db, map: CourseMap, caseId: string, learnerId: number): Promise<Response> {
  const data = await loadCaseData(db, map, await loadProgress(db, learnerId), caseId);
  if (!data) return Response.json({ error: "Unknown Case" }, { status: 404 });
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
