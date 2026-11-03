"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import type { NextOffer, StepSequence } from "@/course/navigator";
import type { OpenQuiz } from "@/learner/quiz";
import type { ReviewState } from "@/learner/review";
import type { Shown } from "@/tutor/session-log";
import { CaseDataProvider } from "@/widgets/case-data-provider";
import type { WidgetStates } from "@/widgets/widget-state";
import { LeftColumn } from "./left-column";
import { DeveloperDetails, type Line } from "./thread";
import { useTurnStream, type PendingTurn } from "./turn-stream";
import { useWidgetHost, WidgetHost } from "./widget-host";
import { WidgetReportContext, type WidgetReport } from "./widget-panel";
import { useWidgetStates, WidgetStatesProvider } from "./widget-states";
import { WorkspaceFrame } from "./workspace-frame";
import type { PassedTopic, Place } from "./workspace-parts";

export type { Line, PendingTurn };

/**
 * The Study Workspace, put together from its parts:
 * - turn streaming and its state (`useTurnStream`, turn-stream.ts);
 * - the Widget panel host (`useWidgetHost` and `WidgetHost`, widget-host.tsx);
 * - the left column with the thread and the message box (`LeftColumn`, left-column.tsx; message-box.tsx);
 * - the frame and layout (`WorkspaceFrame`, workspace-frame.tsx);
 * - the page's shared Case Data cache (`CaseDataProvider`, widgets/case-data-provider.tsx).
 * Replies stream in through assistant-ui's external-store runtime; widget blocks are pulled out of the
 * prose as they arrive, and a chip stands where each belongs.
 */
export function Conversation({
  initial,
  strip = null,
  quiz,
  pending,
  review,
  place = null,
  explore = null,
  revealed = [],
  shown,
  widgetStates,
  passed = null,
  developerDetails = false,
  next = null,
}: {
  /** The Next the Course Navigator offers now (nextOfferNow), or null while a Check is open: the chip under the latest reply. */
  next?: NextOffer | null;
  initial: Line[];
  /** The shown Topic's step sequence (stepSequence), drawn as the Topic bar's progress strip. */
  strip?: StepSequence | null;
  quiz: OpenQuiz | null;
  pending: PendingTurn;
  review: ReviewState;
  place?: Place;
  /** The Topic's own explore Widget while the Learner has it (see exploreWidgetFor); shown by code, not drawn by the Tutor. */
  explore?: { code: string } | null;
  /** The Cases whose reveal the Learner has seen (revealedCases): the reveal state the page's Case Data cache keys on. */
  revealed?: readonly string[];
  /** What the page shows (its Topic's Session, or the Topic before its first turn), carried by every turn request. */
  shown?: Shown;
  /** The shown Session's saved Widget state, by Widget key (loadWidgetStates): slider values and ticked Guided Tasks. */
  widgetStates?: WidgetStates;
  /** A Topic passed in a turn, kept on screen until the Learner chooses where to go; its page sends no turns. */
  passed?: PassedTopic;
  /** The Learner's Show developer details choice (Settings): "Under the hood" under each Tutor reply only when on. */
  developerDetails?: boolean;
}) {
  // The Widgets' saved work in the shown Session, kept across tab switches and saved for a reload; each turn request carries it.
  const widgetStore = useWidgetStates(shown && "sessionId" in shown ? shown.sessionId : undefined, widgetStates);
  // Each new turn sends the panel back to the newest Widget.
  const turn = useTurnStream({ initial, pending, shown, opener: !passed, onTurnStart: () => host.showNewest(), widgets: widgetStore.all });
  const host = useWidgetHost({ messages: turn.messages, running: turn.running, explore, quiz });
  const report: WidgetReport = { tell: (key) => void turn.send({ widgetReport: key }), busy: turn.running };

  return (
    <AssistantRuntimeProvider runtime={turn.runtime}>
      {/* One Case Data cache for the page, cleared as each turn ends. */}
      <CaseDataProvider revealed={revealed} turnRunning={turn.running}>
        <DeveloperDetails on={developerDetails}>
          <WidgetStatesProvider store={widgetStore}>
            {/* Tell the Tutor what I found, under a Widget whose Guided Tasks are all ticked; a passed Topic's page sends no turns. */}
            <WidgetReportContext.Provider value={passed ? null : report}>
              <WorkspaceFrame
                left={<LeftColumn turn={turn} slot={host.slot} strip={strip} place={place} review={review} quizOpen={!!quiz} explore={explore} passed={passed} next={next} />}
                right={<WidgetHost host={host} topicTitle={place?.title} />}
              />
            </WidgetReportContext.Provider>
          </WidgetStatesProvider>
        </DeveloperDetails>
      </CaseDataProvider>
    </AssistantRuntimeProvider>
  );
}
