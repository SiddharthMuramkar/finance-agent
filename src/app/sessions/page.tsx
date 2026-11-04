import { currentLearnerId } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { loadPastSessions } from "@/tutor/past-sessions";
import { PastSessionsList } from "../past-sessions";
import { readTheme } from "../theme-cookie";
import { ReadingPage, SignedInFrame } from "../ui";

export const dynamic = "force-dynamic";

/** Past Sessions: one row per Topic Session, the most recently worked on first, then the Older sessions. No model call. */
export default async function SessionsPage() {
  const learnerId = await currentLearnerId();
  const [past, theme] = await Promise.all([loadPastSessions(getDb(), loadCourseMap(), learnerId), readTheme()]);
  return (
    <SignedInFrame>
      <ReadingPage current="sessions" theme={theme}>
        <PastSessionsList past={past} />
      </ReadingPage>
    </SignedInFrame>
  );
}
