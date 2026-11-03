import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { revealedCases } from "@/case-data/case-data";
import { loadCourseMap } from "@/course/map";
import { signedInLearner } from "@/auth/session";
import { getDb } from "@/db/client";
import { loadProgress } from "@/learner/memory";
import { loadPastSession } from "@/tutor/past-sessions";
import { loadSessionExplore } from "@/tutor/session-summary";
import { loadThread } from "@/tutor/transcript";
import { OldSession } from "../../old-session";
import { PastSessionHeaderView } from "../../past-sessions";
import { AppHeader, SignedInFrame } from "../../ui";

export const dynamic = "force-dynamic";

/**
 * One past Session, read-only, under its header: a Topic Session's Topic, last activity and Resume this
 * Topic (or Passed ✓), or an Older session's date and Topics. Another Learner's id answers 404. No model call.
 */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const learner = await signedInLearner();
  const learnerId = learner.id;
  const map = loadCourseMap();
  const [header, lines, jar, explore, progress] = await Promise.all([
    loadPastSession(db, map, id, learnerId),
    loadThread(db, id, map, learnerId),
    cookies(),
    loadSessionExplore(db, id, map),
    loadProgress(db, learnerId),
  ]);
  if (!header || lines.length === 0) notFound();
  const topicTitle = header.kind === "topic" ? (header.topicId ? header.title : undefined) : header.topics[0];
  return (
    <SignedInFrame>
      <main className="mx-auto flex h-dvh max-w-6xl flex-col px-4 pb-4 pt-4 lg:px-6 lg:pt-6">
        <AppHeader current="sessions" theme={jar.get("theme")?.value === "dark" ? "dark" : "light"} className="mb-6" />
        <PastSessionHeaderView header={header} />
        <OldSession lines={lines} topicTitle={topicTitle} explore={explore} revealed={revealedCases(map, progress)} developerDetails={learner.showDeveloperDetails} />
      </main>
    </SignedInFrame>
  );
}
