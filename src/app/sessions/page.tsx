import { cookies } from "next/headers";
import { currentLearnerId } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { loadPastSessions } from "@/tutor/past-sessions";
import { PastSessionsList } from "../past-sessions";
import { ReadingPage, SignedInFrame } from "../ui";

export const dynamic = "force-dynamic";

/** Past Sessions: one row per Topic Session, the most recently worked on first, then the Older sessions. No model call. */
export default async function SessionsPage() {
  const learnerId = await currentLearnerId();
  const [past, jar] = await Promise.all([loadPastSessions(getDb(), loadCourseMap(), learnerId), cookies()]);
  return (
    <SignedInFrame>
      <ReadingPage current="sessions" theme={jar.get("theme")?.value === "dark" ? "dark" : "light"}>
        <PastSessionsList past={past} />
      </ReadingPage>
    </SignedInFrame>
  );
}
