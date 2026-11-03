"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import type { OpenQuiz } from "@/learner/quiz";
import type { ReviewState } from "@/learner/review";
import type { Shown } from "@/tutor/session-log";
import { CaseDataProvider } from "@/widgets/case-data-provider";
import type { WidgetStates } from "@/widgets/widget-state";
import { LeftColumn } from "./left-column";
import { DeveloperDetails, type Line } from "./thread";
import { useTurnStream, type PendingTurn } from "./turn-stream";
import { useWidgetHost, WidgetHost } from "./widget-host";
import { WidgetStatesProvider } from "./widget-states";
import { WorkspaceFrame } from "./workspace-frame";
import type { Place } from "./workspace-parts";

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
  summary,
  quiz,
  pending,
  review,
  place = null,
  explore = null,
  revealed = [],
  shown,
  widgetStates,
  developerDetails = false,
}: {
  initial: Line[];
  summary: string;
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
  /** The Learner's Show developer details choice (Settings): "Under the hood" under each Tutor reply only when on. */
  developerDetails?: boolean;
}) {
  // Each new turn sends the panel back to the newest Widget.
  const turn = useTurnStream({ initial, pending, shown, onTurnStart: () => host.showNewest() });
  const host = useWidgetHost({ messages: turn.messages, running: turn.running, explore, quiz });

  return (
    <AssistantRuntimeProvider runtime={turn.runtime}>
      {/* One Case Data cache for the page, cleared as each turn ends. */}
      <CaseDataProvider revealed={revealed} turnRunning={turn.running}>
        <DeveloperDetails on={developerDetails}>
          {/* The Widgets' saved work in the shown Session, kept across tab switches and saved for a reload. */}
          <WidgetStatesProvider sessionId={shown && "sessionId" in shown ? shown.sessionId : undefined} initial={widgetStates}>
            <WorkspaceFrame
              left={<LeftColumn turn={turn} slot={host.slot} summary={summary} place={place} review={review} quizOpen={!!quiz} explore={explore} />}
              right={<WidgetHost host={host} topicTitle={place?.title} />}
            />
          </WidgetStatesProvider>
        </DeveloperDetails>
      </CaseDataProvider>
    </AssistantRuntimeProvider>
  );
}
