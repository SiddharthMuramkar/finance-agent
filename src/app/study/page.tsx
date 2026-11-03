import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { isSignedIn } from "@/auth/session";
import { DEMO_SUMMARY, isDemoMode } from "../_landing/demo-mode";
import { SAMPLE_LINES } from "../_landing/demo-session";
import { loadCourseMap } from "@/course/map";
import { exploreWidgetFor } from "@/course/explore-widget";
import { courseOverview } from "@/course/navigator";
import { getDb } from "@/db/client";
import { learnerSummary, loadProgress } from "@/learner/memory";
import { loadProfile, shouldOfferProfile } from "@/learner/profile";
import { openQuiz } from "@/learner/quiz";
import { reviewState } from "@/learner/review";
import { loadCurrentSession } from "@/tutor/transcript";
import { latestTurn } from "@/tutor/turn-status";
import { Conversation, type PendingTurn } from "../conversation";
import { ProfileForm } from "../profile/profile-form";
import { readTheme } from "../theme-cookie";
import { AppHeader, SignedInFrame } from "../ui";

// The Study Workspace, at /study. Reads saved progress and the latest Session on every visit. Opening the page makes no model call.
export const dynamic = "force-dynamic";

// The frame, box and header both branches share.
async function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <SignedInFrame>
      <main className="mx-auto flex h-dvh max-w-6xl flex-col px-4 pb-3 pt-4 lg:px-6 lg:pt-6">
        <AppHeader current="workspace" theme={await readTheme()} className="mb-6" />
        {children}
      </main>
    </SignedInFrame>
  );
}

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ demo?: string | string[] }> }) {
  // The proxy already sends a signed-out visitor to the login; this check also comes before any Learner data is read.
  if (!(await isSignedIn())) redirect("/login");
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
  const [summary, initial, quiz, turn, review, progress, profile] = await Promise.all([
    learnerSummary(db, map),
    loadCurrentSession(db, map),
    // A quiz that can't be loaded is left out, so it can't take the whole workspace down with it.
    openQuiz(db, map).catch((error) => {
      console.error("The open quiz could not be loaded", error);
      return null;
    }),
    latestTurn(db),
    reviewState(db, map),
    loadProgress(db),
    loadProfile(db),
  ]);
  // A turn that didn't finish: the workspace resumes a cut-off one and offers Retry for a failed one.
  const pending: PendingTurn = turn && turn.status !== "finished" ? { status: turn.status, error: turn.error } : null;
  // The current Topic and its Stage, for the status card's eyebrow.
  const current = courseOverview(map, progress).find((t) => t.current);
  const place = current ? { stage: current.stage, title: current.title } : null;
  return (
    <WorkspaceShell>
      {shouldOfferProfile(profile) && <ProfileForm mode="card" initial={{ work: "", location: "", loan: "", savingFor: "" }} />}
      <Conversation initial={initial} summary={summary} quiz={quiz} pending={pending} review={review} place={place} explore={exploreWidgetFor(map, progress)} />
    </WorkspaceShell>
  );
}
