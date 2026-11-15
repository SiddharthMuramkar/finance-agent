import { notFound } from "next/navigation";
import { referenceClip, revealedCases } from "@/case-data/case-data";
import { loadCourseMap } from "@/course/map";
import { signedInLearner } from "@/auth/session";
import { getDb } from "@/db/client";
import { loadProgress } from "@/learner/memory";
import { loadWidgetStates } from "@/learner/widget-state";
import { cardFound } from "@/tutor/topic-complete";
import { TOPIC_COMPLETE } from "@/tutor/topic-complete-card";
import { loadPastSession } from "@/tutor/past-sessions";
import { loadSessionExplore } from "@/tutor/session-summary";
import { loadThread } from "@/tutor/transcript";
import { loadWrittenAhead } from "@/tutor/written-ahead";
import { OldSession } from "../../old-session";
import { PastSessionHeaderView } from "../../past-sessions";
import { accountFor } from "../../account";
import { readSplit } from "../../split-cookie";
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
  const [header, lines, explore, progress, split] = await Promise.all([
    loadPastSession(db, map, id, learnerId),
    loadThread(db, id, map, learnerId),
    loadSessionExplore(db, id, map),
    loadProgress(db, learnerId),
    readSplit(),
  ]);
  if (!header || lines.length === 0) notFound();
  const topicTitle = header.kind === "topic" ? (header.topicId ? header.title : undefined) : header.kind === "earlier" ? header.title : header.topics[0];
  // A Topic Session's written-ahead Widgets, so one the Tutor opened there is drawn again.
  const writtenAhead = header.kind !== "older" ? await loadWrittenAhead(db, map, progress, header.topicId) : [];
  // The Topic complete card also says what the Learner found, read from this Session's saved Widget state.
  const states = header.kind !== "older" ? await loadWidgetStates(db, id, learnerId) : {};
  const drawn = lines.map((line) => (line.role === "item" && line.kind === TOPIC_COMPLETE ? { ...line, data: { ...line.data, found: cardFound(map, line.data.topicId, states) } } : line));
  return (
    <SignedInFrame>
      <main data-route="study" className="mx-auto flex h-dvh w-full max-w-[var(--page-max)] px-[var(--gutter)] flex-col gap-3 pb-4">
        <AppHeader current="notebook" account={await accountFor(db, learner)} />
        <PastSessionHeaderView header={header} />
        <OldSession lines={drawn} topicTitle={topicTitle} explore={explore} writtenAhead={writtenAhead} inPlace={header.kind !== "older"} revealed={revealedCases(map, progress)} referenceClip={referenceClip(map, progress)} developerDetails={learner.showDeveloperDetails} split={split} />
      </main>
    </SignedInFrame>
  );
}
