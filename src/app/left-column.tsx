"use client";

import { ThreadPrimitive } from "@assistant-ui/react";
import type { ReviewState } from "@/learner/review";
import { MessageBox } from "./message-box";
import type { WidgetSlot } from "./reply-markdown";
import { ReviewPanel } from "./review-panel";
import { ThreadMessages } from "./thread";
import type { TurnStream } from "./turn-stream";
import { SecondaryButton } from "./ui";
import { exploreItem, PinnedExplore } from "./widget-panel";
import { StatusCard, type Place } from "./workspace-parts";

/**
 * The Study Workspace's left column, top to bottom: the status card, the pinned explore Widget, the folded
 * review, the thread with the turn's notices, error and Retry, the quiz note while a quiz is open (the quiz
 * itself is in the right panel's Check tab), and the message box with the writing indicator and Attach a passage.
 * It shows the turn stream's state and starts turns through it; Widget chips come from the Widget host's `slot`.
 */
export function LeftColumn({
  turn,
  slot,
  summary,
  place,
  review,
  quizOpen,
  explore,
}: {
  turn: TurnStream;
  slot: WidgetSlot;
  summary: string;
  place: Place;
  review: ReviewState;
  quizOpen: boolean;
  explore: { code: string } | null;
}) {
  const { messages, running, announcement, fixing, error, notice, canRetry, cutShort, waiting, passage, setPassage, send } = turn;
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 min-w-0 flex-col">
      {/* Capped at two fifths of the column and scrolling inside itself, so nothing up here (a long summary, a Review) can squeeze the chat. */}
      <div data-testid="above-thread" className="mb-6 flex max-h-[40%] shrink-0 flex-col gap-3 overflow-y-auto">
        <StatusCard place={place} summary={summary} onContinue={() => void send({ continue: true }, "Continue.")} disabled={running} />
        {explore && <PinnedExplore item={exploreItem(explore.code)} />}
        <ReviewPanel review={review} />
      </div>
      <ThreadPrimitive.Viewport data-testid="thread-viewport" className="min-h-0 flex-1 overflow-y-auto pb-6">
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
      {quizOpen && (
        // The box stays usable: the Learner can still ask about anything else while the quiz is open.
        <p className="mb-2 text-xs leading-4 text-[var(--muted)]" data-testid="quiz-note">
          Quiz open: the Tutor will help with these questions after you submit.
        </p>
      )}
      <MessageBox waiting={waiting} passage={passage} onPassage={setPassage} />
    </ThreadPrimitive.Root>
  );
}
