import { loadCourseMap } from "@/course/map";
import { courseOverview } from "@/course/navigator";
import { getDb } from "@/db/client";
import { loadProgress } from "@/learner/memory";
import { readTheme } from "../theme-cookie";
import { AppHeader, SignedInFrame } from "../ui";
import { CourseMapView } from "./course-map-view";

// Reads saved progress on every visit. No model call.
export const dynamic = "force-dynamic";

/** The Course Map: Topics grouped by Stage, Checks along the way, and the Learner's place. */
export default async function CourseMapPage() {
  const map = loadCourseMap();
  const topics = courseOverview(map, await loadProgress(getDb()));
  const theme = await readTheme();
  return (
    <SignedInFrame>
      <main className="mx-auto max-w-2xl p-4 sm:p-6">
        <AppHeader current="course" theme={theme} className="mb-6" />
        <CourseMapView topics={topics} coming={map.coming} />
      </main>
    </SignedInFrame>
  );
}
