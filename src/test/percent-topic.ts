import { loadCourseMap } from "@/course/map";
import { OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveJump } from "@/learner/memory";

/**
 * Puts a test Learner in the Percent Topic (a rupee Topic), the course's first Topic before the Spine. Since Spine Topic 1
 * (a dollar Topic) became the first Topic (spec 2026-11-12 C1), tests written about Widgets in rupees pin their Learner here,
 * so the Topic's currency and steps they were written for stay the same.
 */
export async function onPercentTopic(db: Db, learnerId = OWNER_LEARNER_ID): Promise<Db> {
  const jump = await saveJump(db, loadCourseMap(), "num-percent-bps", new Date(), learnerId);
  if (!jump.ok) throw new Error("The test Learner could not be put in the Percent Topic.");
  return db;
}
