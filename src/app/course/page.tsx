import { loadCourseMap } from "@/course/map";
import { courseOverview } from "@/course/navigator";
import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { loadProgress } from "@/learner/memory";
import { readTheme } from "../theme-cookie";
import { ReadingPage, SignedInFrame } from "../ui";
import { CourseMapView } from "./course-map-view";

// Reads saved progress on every visit. No model call.
export const dynamic = "force-dynamic";

/** The Course Map: Topics grouped by Stage, Checks along the way, and the Learner's place. */
export default async function CourseMapPage() {
  const map = loadCourseMap();
  const topics = courseOverview(map, await loadProgress(getDb(), await currentLearnerId()));
  const theme = await readTheme();
  return (
    <SignedInFrame>
      <ReadingPage current="course" theme={theme}>
        <CourseMapView topics={topics} coming={map.coming} />
      </ReadingPage>
    </SignedInFrame>
  );
}
