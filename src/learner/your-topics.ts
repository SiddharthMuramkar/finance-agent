import type { CourseMap } from "@/course/map";
import { courseOverview } from "@/course/navigator";
import type { Db } from "@/db/types";
import { loadProgress } from "./memory";

/** A Topic the Learner has started, for Settings → Your Topics (B3b). */
export type YourTopic = { id: string; title: string; status: "in_progress" | "passed" };

/** The Topics the Learner has progress on, in course order. Worked out by code from their own records; no model call. */
export async function loadYourTopics(db: Db, map: CourseMap, learnerId: number): Promise<YourTopic[]> {
  const progress = await loadProgress(db, learnerId);
  return courseOverview(map, progress).flatMap((t) => (t.status === "not_started" ? [] : [{ id: t.id, title: t.title, status: t.status }]));
}
