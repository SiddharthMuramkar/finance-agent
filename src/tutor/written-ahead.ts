import { loadCaseData } from "@/case-data/case-data";
import type { CourseMap } from "@/course/map";
import type { Progress } from "@/course/navigator";
import { writtenAheadFor, type WrittenAhead } from "@/course/written-ahead";
import type { Db } from "@/db/types";

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
