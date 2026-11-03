import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { currentLearner } from "@/auth/session";
import { DEMO_SUMMARY, isDemoMode } from "../_landing/demo-mode";
import { SAMPLE_LINES } from "../_landing/demo-session";
import { loadCourseMap } from "@/course/map";
import { exploreWidgetFor } from "@/course/explore-widget";
import { courseOverview, whatComesNext } from "@/course/navigator";
import { revealedCases } from "@/case-data/case-data";
import { getDb } from "@/db/client";
import { learnerSummary, loadProgress } from "@/learner/memory";
import { openQuiz } from "@/learner/quiz";
import { reviewState } from "@/learner/review";
import { showsWelcome } from "@/learner/welcome";
import { loadWidgetStates } from "@/learner/widget-state";
import { passedTopicShown, shownInWorkspace } from "@/tutor/session-log";
import { loadSession } from "@/tutor/transcript";
import { latestTurn } from "@/tutor/turn-status";
import { Conversation, type PendingTurn } from "../conversation";
import { readTheme } from "../theme-cookie";
import { AppHeader, SignedInFrame } from "../ui";

// The Study Workspace, at /study. Reads saved progress and the latest Session on every visit. Opening the page makes no model call.
export const dynamic = "force-dynamic";

// The frame, box and header both branches share.
async function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <SignedInFrame>
      {/* Exactly the viewport tall: the columns scroll inside themselves, so the page itself never scrolls or grows. */}
      <main className="mx-auto flex h-dvh max-w-6xl flex-col overflow-hidden px-4 pb-3 pt-4 lg:px-6 lg:pt-6">
        <AppHeader current="workspace" theme={await readTheme()} className="mb-6" />
        {children}
      </main>
    </SignedInFrame>
  );
}

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ demo?: string | string[] }> }) {
  // The proxy already sends a signed-out visitor to the login; this check also comes before any Learner data is read.
  const learner = await currentLearner();
  if (!learner) redirect("/login");
  const map = loadCourseMap();
  // Demo mode (local only, at /study?demo=1, for Home's screenshot): a sample conversation, no Learner data read.
  if (isDemoMode(await searchParams)) {
    const topic = map.topic("present-value");
    return (
      <WorkspaceShell>
        <Conversation
          initial={SAMPLE_LINES}
          summary={DEMO_SUMMARY}
          quiz={null}
          pending={null}
          review={{ question: null, dueCount: 0, done: 0, cap: 0 }}
          place={topic ? { stage: topic.stage, title: topic.title } : null}
        />
      </WorkspaceShell>
    );
  }
  const db = getDb();
  const learnerId = learner.id;
  // A new Learner (no Sessions, no Topic chosen yet) sees the Welcome before anything else.
  if (await showsWelcome(db, learnerId)) redirect("/welcome");
  // The Learner's shown Session: the current Topic's own (ADR 0004), or the Topic alone before its first turn (the page
  // then starts the opener); a Topic passed in a turn stays shown until the Learner chooses. Rendering makes no Session.
  const shown = await shownInWorkspace(db, map, learnerId);
  const passedId = await passedTopicShown(db, map, learnerId, shown);
  const passedTopic = passedId ? map.topic(passedId) : undefined;
  const [summary, initial, quiz, turn, review, progress, widgetStates] = await Promise.all([
    learnerSummary(db, map, learnerId),
    "sessionId" in shown ? loadSession(db, shown.sessionId, map, learnerId) : [],
    // A quiz that can't be loaded is left out, so it can't take the whole workspace down with it.
    openQuiz(db, map, new Date(), learnerId).catch((error) => {
      console.error("The open quiz could not be loaded", error);
      return null;
    }),
    latestTurn(db, learnerId),
    reviewState(db, map, new Date(), learnerId),
    loadProgress(db, learnerId),
    // The Widgets' saved work in this Session (slider values and ticks), so a reload draws them as they were left.
    "sessionId" in shown ? loadWidgetStates(db, shown.sessionId, learnerId) : {},
  ]);
  // A turn that didn't finish: the workspace resumes a cut-off one and offers Retry for a failed one. A cut-off or
  // failed turn in another Topic's Session waits for that Topic; one still running blocks every Topic.
  const here = turn && (turn.status === "running" || turn.sessionId === null || ("sessionId" in shown && turn.sessionId === shown.sessionId));
  const pending: PendingTurn = turn && here && turn.status !== "finished" ? { status: turn.status, error: turn.error } : null;
  // The shown Topic and its Stage, for the status card's eyebrow: a passed Topic still on screen, else the current Topic.
  const current = passedTopic ?? courseOverview(map, progress).find((t) => t.current);
  const place = current ? { stage: current.stage, title: current.title } : null;
  // A passed Topic on screen sends no turns: What comes next (from the Course Navigator's place) and the Course Map instead.
  const passed = passedTopic ? { title: passedTopic.title, next: whatComesNext(map, progress)?.label ?? null } : null;
  return (
    <WorkspaceShell>
      <Conversation
        initial={initial}
        summary={passed ? `${passed.title} is passed. Choose where to go next.` : summary}
        // The quiz and explore Widget belong to the current Topic, not the passed one on screen.
        quiz={passed ? null : quiz}
        pending={pending}
        review={review}
        place={place}
        explore={passed ? null : exploreWidgetFor(map, progress)}
        revealed={revealedCases(map, progress)}
        shown={shown}
        widgetStates={widgetStates}
        passed={passed}
        developerDetails={learner.showDeveloperDetails}
      />
    </WorkspaceShell>
  );
}
