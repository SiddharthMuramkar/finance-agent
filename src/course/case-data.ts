import type { CourseMap } from "./map";
import type { Progress } from "./navigator";

export type CaseFigure = { id: string; label: string; date: string; value: number; unit: string; source: string };

/**
 * A Case's sourced figures under the hindsight rule: until its Topic's reveal
 * has been shown, nothing dated after the Case's as-of date is returned.
 */
export function caseData(map: CourseMap, progress: Progress, caseId: string): CaseFigure[] | undefined {
  for (const topic of map.topics) {
    const found = topic.cases.find((c) => c.id === caseId);
    if (!found) continue;
    const revealed = progress.topics[topic.id]?.revealShown ?? false;
    return found.data.filter((d) => revealed || d.date <= found.asOf);
  }
  return undefined;
}
