import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SIGN_IN_PATH } from "@/auth/destination";
import { currentLearner } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { exploreAsSeen, exploreWidgetFor } from "@/course/explore-widget";
import { courseOverview, stepSequence, whatComesNext } from "@/course/navigator";
import { topicStart } from "@/course/topic-start";
import { referenceClip, revealedCases } from "@/case-data/case-data";
import { getDb } from "@/db/client";
import { insightPickNow } from "@/learner/insight";
import { loadProgress } from "@/learner/memory";
import { checkTabNow } from "@/learner/quiz";
import { reviewState } from "@/learner/review";
import { skipAheadState } from "@/learner/skip-ahead";
import { showsWelcome } from "@/learner/welcome";
import { loadWidgetStates } from "@/learner/widget-state";
import { currentTopicId, passedTopicShown, retireOldModelSessions, shownInWorkspace } from "@/tutor/session-log";
import { comingBackItems } from "@/tutor/coming-back";
import { cardFound } from "@/tutor/topic-complete";
import { TOPIC_COMPLETE } from "@/tutor/topic-complete-card";
import { loadThread } from "@/tutor/transcript";
import { finishStepFromWidget, nextOfferNow } from "@/tutor/next";
import { drillIsDue } from "@/tutor/practice";
import { loadWrittenAhead } from "@/tutor/written-ahead";
import { latestTurn } from "@/tutor/turn-status";
import { failedTurnView } from "@/tutor/failures";
import { Conversation, type Line, type PendingTurn } from "../conversation";
import { readSplit } from "../split-cookie";
import { currentAccount } from "../account";
import { AppHeader, type HeaderAccount } from "../ui";

// The Study Workspace, at /study. Reads saved progress and the latest Session on every visit. Opening the page makes no model call.
export const dynamic = "force-dynamic";

// The Study Workspace's frame, box and header, around its two columns. A phone gets it too (#82): the conversation fills
// the screen there and a Widget slides up over it (WorkspaceFrame).
async function WorkspaceShell({ account, children }: { account?: HeaderAccount; children: ReactNode }) {
  return (
    <>
      {/* Exactly the viewport tall: the columns scroll inside themselves, so the page itself never scrolls or grows. */}
      <main data-route="study" className="mx-auto flex h-dvh w-full max-w-[var(--page-max)] px-[var(--gutter)] flex-col overflow-hidden pb-3">
        <AppHeader current="workspace" account={account} />
        {children}
      </main>
    </>
  );
}

export default async function WorkspacePage() {
  // The proxy already sends a signed-out visitor to the sign-in; this check also comes before any Learner data is read.
  const learner = await currentLearner();
  if (!learner) redirect(SIGN_IN_PATH);
  const map = loadCourseMap();
  const db = getDb();
  const learnerId = learner.id;
  // A new Learner (no Sessions, no Topic chosen yet) sees the Welcome before anything else.
  if (await showsWelcome(db, learnerId)) redirect("/welcome");
  // The current Topic's Session of an older model (ADR 0007) is closed on this visit, unless a turn is running in it: the page
  // then shows the Topic with no Session and starts the opener, a fresh conversation at the Learner's saved step.
  if ((await latestTurn(db, learnerId))?.status !== "running") await retireOldModelSessions(db, learnerId, await currentTopicId(db, map, learnerId));
  // A step that finishes from what the Learner did in a Widget (its `doneWhen`) is finished now, from the saved Widget
  // state; its divider and Widget chip are stored for the step that begins. Most renders have no such step and do nothing.
  await finishStepFromWidget(db, map, learnerId, new Date());
  // The Learner's shown Session: the current Topic's own (ADR 0005), or the Topic alone before its first turn (the page
  // then starts the opener); a Topic passed in a turn stays shown until the Learner chooses. Rendering makes no Session.
  const shown = await shownInWorkspace(db, map, learnerId);
  const passedId = await passedTopicShown(db, map, learnerId, shown);
  const passedTopic = passedId ? map.topic(passedId) : undefined;
  const [thread, checkTab, turn, review, progress, widgetStates, comingBack, next, drill, split] = await Promise.all([
    "sessionId" in shown ? loadThread(db, shown.sessionId, map, learnerId) : [],
    // The Check tab: the open quiz, or after a miss its marking with Try again (the next attempt is made only on that press).
    // A quiz that can't be loaded is left out, so it can't take the whole workspace down with it.
    checkTabNow(db, map, new Date(), learnerId).catch((error) => {
      console.error("The open quiz could not be loaded", error);
      return { quiz: null, missed: null };
    }),
    latestTurn(db, learnerId),
    reviewState(db, map, new Date(), learnerId),
    loadProgress(db, learnerId),
    // The Widgets' saved work in this Session (slider values and ticks), so a reload draws them as they were left.
    "sessionId" in shown ? loadWidgetStates(db, shown.sessionId, learnerId) : {},
    // Coming back after a break, to a carried-over Topic, or for a Due Check: the divider is drawn at the end of the
    // thread now, worked out by code, and stored only with the Learner's next turn, so this render adds no rows.
    // A passed Topic on screen is read-only: nothing to pick up.
    passedTopic ? [] : comingBackItems(db, map, learnerId, new Date()),
    // The Next chip under the latest reply, from the Course Navigator's place (none while a Check is open).
    nextOfferNow(db, map, learnerId, new Date()),
    // A parked Skill whose 20 hours have passed: the page starts its drill turn, as it starts a Next (ticket #245).
    passedTopic ? false : drillIsDue(db, map, learnerId, new Date()),
    // The Learner's saved split (the `split` cookie), so the first HTML draws the columns where they were left.
    readSplit(),
  ]);
  // The shown Topic: a passed Topic still on screen, else the current Topic.
  const current = passedTopic ?? courseOverview(map, progress).find((t) => t.current);
  const place = current ? { stage: current.stage, topicId: current.id, title: current.title, goal: map.topic(current.id)?.goal } : null;
  // The Topic Start card opens the Topic's conversation: worked out from course data now, never stored.
  const start = current ? topicStart(map, progress, current.id) : null;
  // Skip ahead's Choice (spec 2026-11-12 A8), or the line that today's attempt at this Topic is used; none for a Topic that offers no skip ahead.
  // A failure here only loses the Choice: the workspace still opens, as with the Check tab.
  const skipAhead = start && current ? await skipAheadState(db, map, progress, current.id, new Date(), learnerId).catch(() => null) : null;
  if (start && skipAhead) start.data.skipAhead = skipAhead;
  // The shown Topic's written-ahead Widgets, as the Learner sees them now: those the Tutor opened are drawn from these.
  const writtenAhead = await loadWrittenAhead(db, map, progress, current?.id);
  // A passed Topic on screen sends no turns: What comes next (from the Course Navigator's place) and the Course Map instead.
  const passed = passedTopic ? { title: passedTopic.title, next: whatComesNext(map, progress)?.label ?? null } : null;
  const initial: Line[] = [
    ...(start ? [{ role: "item" as const, ...start }] : []),
    // A Topic complete card offers What comes next as it is now; in a Session reopened for a Due Check, an earlier card offers only the Course Map.
    // It also says what the Learner found in this Session, read from its saved Widget state now (never stored).
    ...thread.map((line) => (line.role === "item" && line.kind === TOPIC_COMPLETE ? { ...line, data: { ...line.data, next: passed?.next ?? null, found: cardFound(map, line.data.topicId, widgetStates) } } : line)),
    ...comingBack.map((item) => ({ role: "item" as const, ...item })),
  ];
  // A turn that didn't finish: the workspace resumes a cut-off one and offers Retry for a failed one. A cut-off or
  // failed turn in another Topic's Session waits for that Topic; one still running blocks every Topic.
  const here = turn && (turn.status === "running" || turn.sessionId === null || ("sessionId" in shown && turn.sessionId === shown.sessionId));
  // A failure reads in the Learner's words; what the provider said shows only with Show developer details on (A3).
  const pending: PendingTurn = turn && here && turn.status !== "finished" ? { status: turn.status, ...failedTurnView(turn, learner.showDeveloperDetails) } : null;
  return (
    <WorkspaceShell account={await currentAccount()}>
      <Conversation
        initial={initial}
        // The Topic bar's strip: the shown Topic's steps, grouped by Check, with the Learner's place.
        strip={current ? stepSequence(map, progress, current.id) : null}
        // The quiz and explore Widget belong to the current Topic, not the passed one on screen.
        quiz={passed ? null : checkTab.quiz}
        missed={passed ? null : checkTab.missed}
        pending={pending}
        review={review}
        place={place}
        // The pinned Open question line shows the Insight question until the Insight is settled (Conversation hides it then).
        openQuestion={passed ? null : ((current ? map.topic(current.id)?.insight?.question : null) ?? null)}
        // The explore Widget is one of the written-ahead Widgets: drawn as the Learner sees it now, saved under its id.
        explore={passed ? null : exploreAsSeen(exploreWidgetFor(map, progress), writtenAhead)}
        // Until the shown Topic's Insight is settled, its Widgets hold back what would give it away.
        insightSettled={!!current && progress.topics[current.id]?.insight !== undefined}
        // Settled by a tap (ADR 0020): the Insight question with its choices, while the current Topic is at explore.
        insightPick={passed ? null : insightPickNow(map, progress)}
        writtenAhead={writtenAhead}
        revealed={revealedCases(map, progress)}
        referenceClip={referenceClip(map, progress)}
        shown={shown}
        widgetStates={widgetStates}
        passed={passed}
        // The current Topic's Next belongs to its own Session, never to a passed one kept on screen.
        next={passed ? null : next}
        drill={!passed && drill}
        developerDetails={learner.showDeveloperDetails}
        split={split}
      />
    </WorkspaceShell>
  );
}
