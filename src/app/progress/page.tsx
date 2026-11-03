import { loadCourseMap } from "@/course/map";
import { courseOverview } from "@/course/navigator";
import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { loadProgress } from "@/learner/memory";
import { ProgressView } from "../course/course-map-view";
import { readTheme } from "../theme-cookie";
import { ReadingPage, SignedInFrame } from "../ui";

export const dynamic = "force-dynamic";

/** Each Topic's status: not started, in progress or passed. No model call. */
export default async function ProgressPage() {
  const topics = courseOverview(loadCourseMap(), await loadProgress(getDb(), await currentLearnerId()));
  const theme = await readTheme();
  return (
    <SignedInFrame>
      <ReadingPage current="progress" theme={theme}>
        <ProgressView topics={topics} />
      </ReadingPage>
    </SignedInFrame>
  );
}
