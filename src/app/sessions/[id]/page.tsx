import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { revealedCases } from "@/case-data/case-data";
import { loadCourseMap } from "@/course/map";
import { signedInLearner } from "@/auth/session";
import { getDb } from "@/db/client";
import { loadProgress } from "@/learner/memory";
import { loadSessionExplore, loadSessionSummaries } from "@/tutor/session-summary";
import { loadSession } from "@/tutor/transcript";
import { OldSession } from "../../old-session";
import { AppHeader, SignedInFrame } from "../../ui";

export const dynamic = "force-dynamic";

/** One old Session, read-only. No model call. */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const learner = await signedInLearner();
  const learnerId = learner.id;
  const map = loadCourseMap();
  const [lines, summaries, jar, explore, progress] = await Promise.all([
    loadSession(db, id, map, learnerId),
    loadSessionSummaries(db, learnerId),
    cookies(),
    loadSessionExplore(db, id, map),
    loadProgress(db, learnerId),
  ]);
  if (lines.length === 0) notFound();
  return (
    <SignedInFrame>
      <main className="mx-auto flex h-dvh max-w-6xl flex-col px-4 pb-4 pt-4 lg:px-6 lg:pt-6">
        <AppHeader current="sessions" theme={jar.get("theme")?.value === "dark" ? "dark" : "light"} className="mb-6" />
        <OldSession lines={lines} topicTitle={summaries.get(id)?.topics[0]} explore={explore} revealed={revealedCases(map, progress)} developerDetails={learner.showDeveloperDetails} />
      </main>
    </SignedInFrame>
  );
}
