"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { QUICK_TRY_RESULT } from "@/tutor/session-item-kinds";
import { pickOf, QuickTryContext, type QuickTryHost, type QuickTryPick } from "./quick-try-view";
import type { SessionItemData } from "./session-item-view";
import type { NextOffer, StepSequence } from "@/course/navigator";
import type { WrittenAhead } from "@/course/written-ahead";
import type { MissedQuiz, OpenQuiz } from "@/learner/quiz";
import type { ReviewState } from "@/learner/review";
import type { Shown } from "@/tutor/session-log";
import { CaseDataProvider } from "@/widgets/case-data-provider";
import { InsightSettledContext } from "@/widgets/insight-settled";
import { SaveStoryContext } from "@/widgets/workbench/save-story";
import { postStoryToNotebook } from "@/widgets/workbench/story-to-notebook";
import type { WidgetStates } from "@/widgets/widget-state";
import { LeftColumn } from "./left-column";
import { TopicHeader, WorkspaceTopicBar } from "./topic-header";
import { ParkActionsContext, type ParkActions } from "./park-offer-view";
import { DeveloperDetails, type Line } from "./thread";
import { useTurnStream, type PendingTurn } from "./turn-stream";
import { useWidgetHost, WidgetHost } from "./widget-host";
import { WidgetReportContext, type WidgetReport } from "./widget-panel";
import { useWidgetStates, WidgetStatesProvider } from "./widget-states";
import { WorkspaceFrame } from "./workspace-frame";
import { PrimaryClaims, type PassedTopic, type Place } from "./workspace-parts";

export type { Line, PendingTurn };

/**
 * The Study Workspace, put together from its parts:
 * - turn streaming and its state (`useTurnStream`, turn-stream.ts);
 * - the Widget panel host (`useWidgetHost` and `WidgetHost`, widget-host.tsx);
 * - the left column with the thread and the message box (`LeftColumn`, left-column.tsx; message-box.tsx);
 * - the Topic bar, a Band above both columns (`WorkspaceTopicBar`, topic-header.tsx; spec 2026-11-12 F3);
 * - the pinned explore Widget and review at the top of the right column (`TopicHeader`, topic-header.tsx);
 * - the frame and layout (`WorkspaceFrame`, workspace-frame.tsx);
 * - the page's shared Case Data cache (`CaseDataProvider`, widgets/case-data-provider.tsx).
 * Replies stream in through assistant-ui's external-store runtime; widget blocks are pulled out of the
 * prose as they arrive, and a chip stands where each belongs.
 */
export function Conversation({
  initial,
  strip = null,
  quiz,
  missed = null,
  pending,
  review,
  place = null,
  explore = null,
  insightSettled = false,
  writtenAhead,
  revealed = [],
  referenceClip,
  shown,
  widgetStates,
  passed = null,
  developerDetails = false,
  next = null,
  openQuestion = null,
  drill = false,
  split,
}: {
  /** The conversation's share of the two columns' width (readSplit, the `split` cookie); WorkspaceFrame's default when absent. */
  split?: number;
  /** A parked Skill's 20 hours have passed (drillIsDue): the page starts the drill turn once, as soon as no turn runs. */
  drill?: boolean;
  /** The Next the Course Navigator offers now (nextOfferNow), or null while a Check is open: the chip under the latest reply. */
  next?: NextOffer | null;
  initial: Line[];
  /** The shown Topic's step sequence (stepSequence), drawn as the Topic bar's progress strip. */
  strip?: StepSequence | null;
  quiz: OpenQuiz | null;
  /** The quiz Check's last attempt, missed, while no new one is open: the Check tab shows it with Try Check <k> again. */
  missed?: MissedQuiz | null;
  pending: PendingTurn;
  review: ReviewState;
  place?: Place;
  /** The Topic's own explore Widget while the Learner has it (see exploreWidgetFor); shown by code, not drawn by the Tutor. */
  explore?: { code: string; id: string } | null;
  /** Whether the shown Topic's Insight is settled (found or told): until then Widgets hold back what gives it away. */
  insightSettled?: boolean;
  /** The Topic's written-ahead Widgets as the Learner sees them now (writtenAheadFor); those the Tutor opened are drawn. */
  writtenAhead?: readonly WrittenAhead[];
  /** The Cases whose reveal the Learner has seen (revealedCases): the reveal state the page's Case Data cache keys on. */
  revealed?: readonly string[];
  /** The date the reference Case is clipped to (referenceClip in case-data.ts): a later close is never drawn. */
  referenceClip?: string | null;
  /** What the page shows (its Topic's Session, or the Topic before its first turn), carried by every turn request. */
  shown?: Shown;
  /** The shown Session's saved Widget state, by Widget key (loadWidgetStates): slider values and ticked Guided Tasks. */
  widgetStates?: WidgetStates;
  /** A Topic passed in a turn, kept on screen until the Learner chooses where to go; its page sends no turns. */
  passed?: PassedTopic;
  /** The Learner's Show developer details choice (Settings): "Under the hood" under each Tutor reply only when on. */
  developerDetails?: boolean;
  /** The Insight question the Tutor is waiting on, pinned above the message box until the Insight is settled. */
  openQuestion?: string | null;
}) {
  // The Widgets' saved work in the shown Session, kept across tab switches and saved for a reload; each turn request carries it.
  const widgetStore = useWidgetStates(shown && "sessionId" in shown ? shown.sessionId : undefined, widgetStates);
  // Each new turn sends the panel back to the newest Widget.
  const turn = useTurnStream({ initial, pending, shown, opener: !passed, onTurnStart: () => host.showNewest(), widgets: widgetStore });
  const running = turn.phase.kind === "running";
  // After a missed quiz, code starts the Tutor's follow-up (no Learner bubble) as soon as no other turn is running.
  // Misses counted, and how many have had their follow-up started.
  const [misses, setMisses] = useState(0);
  const followedUp = useRef(0);
  const host = useWidgetHost({
    messages: turn.messages,
    running,
    explore,
    quiz,
    missed,
    writtenAhead,
    // Retry on a Widget that did not arrive: the turn stream resumes the turn (in place, while it still runs).
    onRetry: turn.retry,
    onQuizSubmitted: ({ passed, item, complete }) => {
      // The result card goes in the conversation at once, where a reload draws it, and after it any Topic complete card.
      if (item) turn.appendItem(item);
      if (complete) turn.appendItem(complete);
      if (!passed) setMisses((n) => n + 1);
    },
  });
  // Turns code starts (the quiz follow-up, the drill) wait for a running turn to end: one turn at a time.
  const { sendWhenIdle, sendIfIdle } = turn;
  useEffect(() => {
    if (followedUp.current >= misses) return;
    followedUp.current = misses;
    sendWhenIdle({ quizFollowUp: true });
  }, [misses, sendWhenIdle]);
  const report: WidgetReport = { tell: (key) => void turn.send({ widgetReport: key }), busy: running };
  // Quick tries: locked while a turn runs and once marked; an answer appends its items, and may start the follow-up turn.
  const { appendItem, messages } = turn;
  // By key, with the choice tapped and the right one from the stored result, so a reload marks them again.
  const answered = useMemo(
    () => new Map<string, QuickTryPick>(messages.flatMap((m) => (m.role === "item" && m.kind === QUICK_TRY_RESULT && typeof m.data.key === "string" ? [[m.data.key, pickOf(m.data)] as const] : []))),
    [messages],
  );
  const quickTries: QuickTryHost = useMemo(
    () => ({
      locked: running,
      answered,
      answer: async (key, choice) => {
        const response = await fetch("/api/quick-try", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, choice }) }).catch(() => null);
        const body = (await response?.json().catch(() => null)) as { items?: SessionItemData[]; followUp?: boolean; error?: string } | null;
        if (!response?.ok || !body) return body?.error ?? "That answer could not be sent. Try again.";
        for (const item of body.items ?? []) appendItem(item);
        // Only while no turn runs: one begun while the answer was on the way replies after it, which leaves nothing to go over.
        if (body.followUp) sendIfIdle({ quickTryFollowUp: true });
        return null;
      },
    }),
    [running, answered, appendItem, sendIfIdle],
  );
  // The drill after a park runs first when the Learner opens the Topic: code shows its tries, the Tutor adds a sentence.
  const drillStarted = useRef(false);
  useEffect(() => {
    if (!drill || passed || drillStarted.current) return;
    drillStarted.current = true;
    sendWhenIdle({ drill: true });
  }, [drill, passed, sendWhenIdle]);
  // The park offer's buttons: each posts its choice to /api/quick-try and the page appends what code stored.
  const park: ParkActions = {
    busy: running,
    act: async (choice) => {
      const response = await fetch("/api/quick-try", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(choice) }).catch(() => null);
      if (!response?.ok) return false;
      const result = (await response.json().catch(() => null)) as { items?: { kind: string; data: Record<string, unknown> }[] } | null;
      for (const item of result?.items ?? []) turn.appendItem(item);
      return true;
    },
  };

  // Value levers in all open mode (Spine Topic 15) saves the Learner's own Valuation story to this Topic's note in the
  // Notebook; a passed Topic's page, or a page with no Topic, saves nothing (C4).
  const topicId = place?.topicId;
  // A second Save replaces the line the first one wrote, so the Notebook keeps one current story (Spine Topic 15).
  const savedLineId = useRef<number | undefined>(undefined);
  const saveStory = useMemo(() => {
    if (passed || !topicId) return null;
    return async (story: Parameters<typeof postStoryToNotebook>[1]) => {
      const result = await postStoryToNotebook(topicId, story, savedLineId.current);
      if (result) savedLineId.current = result.id >= 0 ? result.id : undefined;
      return !!result;
    };
  }, [passed, topicId]);

  return (
    <AssistantRuntimeProvider runtime={turn.runtime}>
      {/* One Case Data cache for the page, cleared as each turn ends. */}
      <CaseDataProvider revealed={revealed} referenceClip={referenceClip} turnRunning={running}>
        <DeveloperDetails on={developerDetails}>
          <WidgetStatesProvider store={widgetStore}>
            <InsightSettledContext.Provider value={insightSettled}>
            {/* Tell the Tutor what I found, under a Widget whose Guided Tasks are all ticked; a passed Topic's page sends no turns. */}
            <WidgetReportContext.Provider value={passed ? null : report}>
            <ParkActionsContext.Provider value={passed ? null : park}>
            <SaveStoryContext.Provider value={saveStory}>
              {/* A passed Topic's page sends nothing, so its Quick tries draw read-only. */}
              <QuickTryContext.Provider value={passed ? null : quickTries}>
              {/* A Check's or a Spaced review's own primary claims the view's one primary from the Next chip (#478). */}
              <PrimaryClaims>
              <WorkspaceFrame
                split={split}
                open={host.open}
                onClose={host.close}
                left={<LeftColumn turn={turn} slot={host.slot} quizOpen={!!quiz} passed={passed} next={next} openQuestion={insightSettled ? null : openQuestion} />}
                bar={<WorkspaceTopicBar messages={turn.messages} strip={strip} place={place} />}
                top={<TopicHeader review={review} explore={explore} />}
                right={<WidgetHost host={host} topicTitle={place?.title} />}
              />
              </PrimaryClaims>
              </QuickTryContext.Provider>
            </SaveStoryContext.Provider>
            </ParkActionsContext.Provider>
            </WidgetReportContext.Provider>
            </InsightSettledContext.Provider>
          </WidgetStatesProvider>
        </DeveloperDetails>
      </CaseDataProvider>
    </AssistantRuntimeProvider>
  );
}
