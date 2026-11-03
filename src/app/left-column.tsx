"use client";

import { ThreadPrimitive } from "@assistant-ui/react";
import type { OpenQuiz } from "@/learner/quiz";
import type { ReviewState } from "@/learner/review";
import { MessageBox } from "./message-box";
import { QuizPanel } from "./quiz-panel";
import type { WidgetSlot } from "./reply-markdown";
import { ReviewPanel } from "./review-panel";
import { ThreadMessages } from "./thread";
import type { TurnStream } from "./turn-stream";
import { SecondaryButton } from "./ui";
import { exploreItem, PinnedExplore } from "./widget-panel";
import { StatusCard, type Place } from "./workspace-parts";

/**
 * The Study Workspace's left column, top to bottom: the status card, the pinned explore Widget, the folded
 * review and quiz, the thread with the turn's notices, error and Retry,
 * and the message box with the writing indicator and Attach a passage.
 * It shows the turn stream's state and starts turns through it; Widget chips come from the Widget host's `slot`.
 */
export function LeftColumn({
  turn,
  slot,
  summary,
  place,
  review,
  quiz,
  explore,
}: {
  turn: TurnStream;
  slot: WidgetSlot;
  summary: string;
  place: Place;
  review: ReviewState;
  quiz: OpenQuiz | null;
  explore: { code: string } | null;
}) {
  const { messages, running, announcement, fixing, error, notice, canRetry, cutShort, waiting, passage, setPassage, send } = turn;
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="mb-6 flex flex-col gap-3">
        <StatusCard place={place} summary={summary} onContinue={() => void send({ continue: true }, "Continue.")} disabled={running} />
        {explore && <PinnedExplore item={exploreItem(explore.code)} />}
        <ReviewPanel review={review} />
        <QuizPanel quiz={quiz} />
      </div>
      <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto pb-6">
        <div className="flex flex-col gap-4">
          <ThreadMessages lines={messages} slot={slot} />
        </div>
        {fixing && <p className="mt-2 text-xs leading-4 text-[var(--muted)]">Fixing the widget…</p>}
        {notice && (
          <p className="my-3 text-sm leading-5 text-[var(--muted)]" data-testid="turn-notice">
            {notice}
          </p>
        )}
        {error && (
          <p className="my-3 text-sm leading-5 text-[var(--danger)]" data-testid="turn-error">
            {error}
          </p>
        )}
        {(canRetry || cutShort) && !running && (
          <div className="my-2 flex items-center gap-2">
            {canRetry && <SecondaryButton onClick={() => void send({ resume: true })}>Retry</SecondaryButton>}
            {cutShort && (
              <>
                <span className="text-sm leading-5 text-[var(--muted)]">The reply was cut short.</span>
                <SecondaryButton onClick={() => void send({ continue: true }, "Continue.")}>Continue</SecondaryButton>
              </>
            )}
          </div>
        )}
      </ThreadPrimitive.Viewport>
      <p role="status" aria-live="polite" className="sr-only" data-testid="turn-status">
        {announcement}
      </p>
      <MessageBox waiting={waiting} passage={passage} onPassage={setPassage} />
    </ThreadPrimitive.Root>
  );
}
