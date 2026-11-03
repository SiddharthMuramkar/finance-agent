import { cookies } from "next/headers";
import { isSignedIn } from "@/auth/session";
import { LandingPage } from "./_landing/landing";
import { loadCourseMap } from "@/course/map";
import { courseOverview } from "@/course/navigator";
import { getDb } from "@/db/client";
import { learnerSummary, loadProgress } from "@/learner/memory";
import { openQuiz } from "@/learner/quiz";
import { reviewState } from "@/learner/review";
import { loadCurrentSession } from "@/tutor/transcript";
import { latestTurn } from "@/tutor/turn-status";
import { Conversation, type PendingTurn } from "./conversation";
import { AppHeader, SignedInFrame } from "./ui";

// Reads saved progress and the latest Session on every visit. Opening the page makes no model call.
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  // Signed out, "/" is the public landing page: decided before any Learner data is read.
  if (!(await isSignedIn())) return <LandingPage />;
  const db = getDb();
  const map = loadCourseMap();
  const [summary, initial, jar, quiz, turn, review, progress] = await Promise.all([
    learnerSummary(db, map),
    loadCurrentSession(db, map),
    cookies(),
    // A quiz that can't be loaded is left out, so it can't take the whole workspace down with it.
    openQuiz(db, map).catch((error) => {
      console.error("The open quiz could not be loaded", error);
      return null;
    }),
    latestTurn(db),
    reviewState(db, map),
    loadProgress(db),
  ]);
  // A turn that didn't finish: the workspace resumes a cut-off one and offers Retry for a failed one.
  const pending: PendingTurn = turn && turn.status !== "finished" ? { status: turn.status, error: turn.error } : null;
  // The current Topic and its Stage, for the status card's eyebrow.
  const current = courseOverview(map, progress).find((t) => t.current);
  const place = current ? { stage: current.stage, title: current.title } : null;
  return (
    <SignedInFrame>
      <main className="mx-auto flex h-dvh max-w-6xl flex-col px-4 pb-3 pt-4 lg:px-6 lg:pt-6">
        <AppHeader current="workspace" theme={jar.get("theme")?.value === "dark" ? "dark" : "light"} className="mb-6" />
        <Conversation initial={initial} summary={summary} quiz={quiz} pending={pending} review={review} place={place} />
      </main>
    </SignedInFrame>
  );
}
