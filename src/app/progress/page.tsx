import { loadCourseMap } from "@/course/map";
import { courseOverview, whatComesNext } from "@/course/navigator";
import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { loadProgress } from "@/learner/memory";
import { ProgressView } from "../course/course-map-view";
import { readTheme } from "../theme-cookie";
import { ReadingPage, SignedInFrame } from "../ui";

export const dynamic = "force-dynamic";

/** Progress: a summary with What comes next, and each Topic's status; every row opens its Topic. No model call. */
export default async function ProgressPage() {
  const map = loadCourseMap();
  const progress = await loadProgress(getDb(), await currentLearnerId());
  const topics = courseOverview(map, progress);
  const theme = await readTheme();
  return (
    <SignedInFrame>
      <ReadingPage current="progress" theme={theme}>
        <ProgressView topics={topics} next={whatComesNext(map, progress)?.topic.title ?? null} />
      </ReadingPage>
    </SignedInFrame>
  );
}
