import { loadCourseMap } from "@/course/map";
import { courseOverview } from "@/course/navigator";
import { getDb } from "@/db/client";
import { loadProgress } from "@/learner/memory";
import { ProgressView } from "../course/course-map-view";
import { readTheme } from "../theme-cookie";
import { AppHeader, SignedInFrame } from "../ui";

export const dynamic = "force-dynamic";

/** Each Topic's status: not started, in progress or passed. No model call. */
export default async function ProgressPage() {
  const topics = courseOverview(loadCourseMap(), await loadProgress(getDb()));
  const theme = await readTheme();
  return (
    <SignedInFrame>
      <main className="mx-auto max-w-2xl p-4 sm:p-6">
        <AppHeader current="progress" theme={theme} className="mb-6" />
        <ProgressView topics={topics} />
      </main>
    </SignedInFrame>
  );
}
