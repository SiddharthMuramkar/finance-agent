"use client";

import { ThreadPrimitive } from "@assistant-ui/react";
import type { ReviewState } from "@/learner/review";
import { WhatComesNextButton } from "./course/jump-button";
import { MessageBox } from "./message-box";
import type { WidgetSlot } from "./reply-markdown";
import { ReviewPanel } from "./review-panel";
import { ThreadMessages } from "./thread";
import type { TurnStream } from "./turn-stream";
import { SecondaryButton } from "./ui";
import { exploreItem, PinnedExplore } from "./widget-panel";
import { JUST_TELL_ME, NextChip, StatusCard, type PassedTopic, type Place } from "./workspace-parts";
import type { NextOffer } from "@/course/navigator";

/**
 * The Study Workspace's left column, top to bottom: the status card, the pinned explore Widget, the folded
 * review, the thread with the Next chip under its latest reply, the turn's notices, error and Retry, the quiz note while a quiz is open (the quiz
 * itself is in the right panel's Check tab), and the message box with the writing indicator and Attach a passage.
 * A Topic passed in a turn stays on screen with no message box: What comes next and the Course Map instead.
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
  passed = null,
  next = null,
}: {
  /** The Next the Course Navigator offers now (null while a Check is open), drawn as the chip under the latest reply. */
  next?: NextOffer | null;
  turn: TurnStream;
  slot: WidgetSlot;
  summary: string;
  place: Place;
  review: ReviewState;
  quizOpen: boolean;
  explore: { code: string } | null;
  passed?: PassedTopic;
}) {
  const { messages, running, refreshing, announcement, fixing, error, notice, canRetry, cutShort, waiting, passage, setPassage, send } = turn;
  // The Next chip stands only under the latest Tutor reply or card: never under the Learner's own message, during a
  // turn, before the page has re-read the Learner's place after one, with Retry on offer, or on a passed Topic.
  const latest = messages.at(-1);
  const chip = next && !passed && latest && latest.role !== "user" && !running && !refreshing && !canRetry ? next : null;
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 min-w-0 flex-col">
      {/* Capped at two fifths of the column and scrolling inside itself, so nothing up here (a long summary, a Review) can squeeze the chat. */}
      <div data-testid="above-thread" className="mb-6 flex max-h-[40%] shrink-0 flex-col gap-3 overflow-y-auto">
        <StatusCard place={place} summary={summary} />
        {explore && <PinnedExplore item={exploreItem(explore.code)} />}
        <ReviewPanel review={review} />
      </div>
      <ThreadPrimitive.Viewport data-testid="thread-viewport" className="min-h-0 flex-1 overflow-y-auto pb-6">
        <div className="flex flex-col gap-4">
          <ThreadMessages lines={messages} slot={slot} />
        </div>
        {chip && <NextChip offer={chip} onNext={(named) => void send({ next: named })} onJustTellMe={() => void send({ message: JUST_TELL_ME }, JUST_TELL_ME)} />}
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
                {/* Code asks the Tutor to finish: no Learner message is stored or drawn. */}
                <SecondaryButton data-testid="finish-reply" onClick={() => void send({ finish: true })}>
                  Finish this reply
                </SecondaryButton>
              </>
            )}
          </div>
        )}
      </ThreadPrimitive.Viewport>
      <p role="status" aria-live="polite" className="sr-only" data-testid="turn-status">
        {announcement}
      </p>
      {passed ? (
        <section aria-label="Topic passed" data-testid="topic-passed" className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] p-4">
          {/* Read-only: a passed Topic shows Passed ✓, never Resume. */}
          <span data-testid="passed-mark" className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs font-medium leading-4">
            Passed ✓
          </span>
          <p className="text-sm leading-5">{passed.title} is passed.</p>
          {passed.next && <WhatComesNextButton label={passed.next} />}
          <a href="/course" className="text-sm leading-5 underline">
            Course Map
          </a>
        </section>
      ) : (
        <>
          {quizOpen && (
            // The box stays usable: the Learner can still ask about anything else while the quiz is open.
            <p className="mb-2 text-xs leading-4 text-[var(--muted)]" data-testid="quiz-note">
              Quiz open: the Tutor will help with these questions after you submit.
            </p>
          )}
          <MessageBox waiting={waiting} passage={passage} onPassage={setPassage} />
        </>
      )}
    </ThreadPrimitive.Root>
  );
}
