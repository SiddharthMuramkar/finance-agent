import { isConverted, loadCourseMap } from "@/course/map";
import { courseOverview, whatComesNext } from "@/course/navigator";
import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { loadProgress } from "@/learner/memory";
import { parkedSkills } from "@/learner/skill-state";
import { topicSessions } from "@/tutor/session-log";
import { readTheme } from "../theme-cookie";
import { ReadingPage, SignedInFrame } from "../ui";
import { CourseMapView } from "./course-map-view";

// Reads saved progress on every visit. No model call.
export const dynamic = "force-dynamic";

/** The Course Map: Recommended next, Topics grouped by Subject and Stage, Checks along the way, and the Learner's place. */
export default async function CourseMapPage() {
  const map = loadCourseMap();
  const db = getDb();
  const learnerId = await currentLearnerId();
  const [progress, sessions, theme] = await Promise.all([loadProgress(db, learnerId), topicSessions(db, learnerId), readTheme()]);
  // Only converted Topics have Skill state; with none, the skill_state table is never read.
  const parked = await parkedSkills(db, learnerId, map.topics.filter(isConverted).map((t) => t.id));
  const next = whatComesNext(map, progress);
  return (
    <SignedInFrame>
      <ReadingPage current="course" theme={theme}>
        <CourseMapView
          topics={courseOverview(map, progress, parked)}
          coming={map.coming}
          recommended={next ? { topicId: next.topic.id, label: next.label } : null}
          sessions={sessions}
        />
      </ReadingPage>
    </SignedInFrame>
  );
}
