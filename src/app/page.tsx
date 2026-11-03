import { cookies } from "next/headers";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { learnerSummary } from "@/learner/memory";
import { openQuiz } from "@/learner/quiz";
import { reviewState } from "@/learner/review";
import { loadCurrentSession } from "@/tutor/transcript";
import { latestTurn } from "@/tutor/turn-status";
import { Conversation, type PendingTurn } from "./conversation";
import { AppHeader } from "./ui";

// Reads saved progress and the latest Session on every visit. Opening the page makes no model call.
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const db = getDb();
  const map = loadCourseMap();
  const [summary, initial, jar, quiz, turn, review] = await Promise.all([
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
  ]);
  // A turn that didn't finish: the workspace resumes a cut-off one and offers Retry for a failed one.
  const pending: PendingTurn = turn && turn.status !== "finished" ? { status: turn.status, error: turn.error } : null;
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col p-4 sm:p-6">
      <AppHeader current="workspace" theme={jar.get("theme")?.value === "dark" ? "dark" : "light"} className="mb-6" />
      <Conversation initial={initial} summary={summary} quiz={quiz} pending={pending} review={review} />
    </main>
  );
}
