"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import type { OpenQuiz } from "@/learner/quiz";
import type { ReviewState } from "@/learner/review";
import { LeftColumn } from "./left-column";
import type { Line } from "./thread";
import { useTurnStream, type PendingTurn } from "./turn-stream";
import { useWidgetHost, WidgetHost } from "./widget-host";
import { WorkspaceFrame } from "./workspace-frame";
import type { Place } from "./workspace-parts";

export type { Line, PendingTurn };

/**
 * The Study Workspace, put together from its parts:
 * - turn streaming and its state (`useTurnStream`, turn-stream.ts);
 * - the Widget panel host (`useWidgetHost` and `WidgetHost`, widget-host.tsx);
 * - the left column with the thread and the message box (`LeftColumn`, left-column.tsx; message-box.tsx);
 * - the frame and layout (`WorkspaceFrame`, workspace-frame.tsx).
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
}: {
  initial: Line[];
  summary: string;
  quiz: OpenQuiz | null;
  pending: PendingTurn;
  review: ReviewState;
  place?: Place;
  /** The Topic's own explore Widget while the Learner has it (see exploreWidgetFor); shown by code, not drawn by the Tutor. */
  explore?: { code: string } | null;
}) {
  // Each new turn sends the panel back to the newest Widget.
  const turn = useTurnStream({ initial, pending, onTurnStart: () => host.showNewest() });
  const host = useWidgetHost({ messages: turn.messages, running: turn.running, explore });

  return (
    <AssistantRuntimeProvider runtime={turn.runtime}>
      <WorkspaceFrame
        left={<LeftColumn turn={turn} slot={host.slot} summary={summary} place={place} review={review} quiz={quiz} explore={explore} />}
        right={<WidgetHost host={host} topicTitle={place?.title} />}
      />
    </AssistantRuntimeProvider>
  );
}
