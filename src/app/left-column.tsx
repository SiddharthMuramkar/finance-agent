"use client";

import { ThreadPrimitive } from "@assistant-ui/react";
import { useEffect, useState } from "react";
import { useAnnounce } from "./announcer";
import { WhatComesNextButton } from "./course/jump-button";
import { MessageBox } from "./message-box";
import type { WidgetSlot } from "./reply-markdown";
import { ThreadMessages } from "./thread";
import type { TurnStream } from "./turn-stream";
import { SecondaryButton } from "./ui";
import { Chips, type PassedTopic } from "./workspace-parts";
import type { NextOffer } from "@/course/navigator";
import type { NextName } from "@/tutor/next";
import { TOPIC_START } from "@/course/topic-start";
import { TOPIC_COMPLETE } from "@/tutor/topic-complete-card";
import { choicesFor } from "@/tutor/choices";
import { REPLY_CHOICES, type ReplyChoicesData } from "@/tutor/session-item-kinds";
import type { ThreadLine } from "./thread";

/** The Choices to draw under the latest reply: stored ones when no reply came after them, else code's set. */
function latestChoices(messages: readonly ThreadLine[], quizOpen: boolean): { list: ReplyChoicesData["choices"]; stored: boolean } {
  const at = messages.findLastIndex((m) => m.role === "item" && m.kind === REPLY_CHOICES);
  const replyAfter = at >= 0 && messages.slice(at + 1).some((m) => m.role === "assistant" || m.role === "user");
  const stored = at >= 0 && !replyAfter ? ((messages[at] as { data?: Partial<ReplyChoicesData> }).data?.choices ?? []) : [];
  if (stored.length >= 2) return { list: stored, stored: true };
  return { list: choicesFor(quizOpen ? "check" : "concept", null, null), stored: false };
}

/**
 * The Study Workspace's left column, top to bottom: the thread with the Next chip and the reply's Choices under its latest reply, the turn's notices, error and Retry, the quiz note while a quiz is open (the quiz
 * itself is in the right panel's Check tab), and the message box with the writing indicator and Attach a passage.
 * A Topic passed in a turn stays on screen with no message box: What comes next and the Course Map instead.
 * The Topic bar, the pinned explore Widget and the folded review stand at the top of the right column instead (TopicHeader).
 * It shows the turn stream's state and starts turns through it; Widget chips come from the Widget host's `slot`.
 */
export function LeftColumn({
  turn,
  slot,
  quizOpen,
  passed = null,
  next = null,
  openQuestion = null,
}: {
  /** The Next the Course Navigator offers now (null while a Check is open), drawn as the chip under the latest reply. */
  next?: NextOffer | null;
  turn: TurnStream;
  slot: WidgetSlot;
  quizOpen: boolean;
  passed?: PassedTopic;
  /** The question the Tutor has put to the Learner and is waiting on (the Insight question): a slim line pinned above the message box. */
  openQuestion?: string | null;
}) {
  const { messages, running, refreshing, announcement, fixing, error, notice, canRetry, cutShort, waiting, passage, setPassage, send, progress, stopping, stop } = turn;
  // The turn's status words go to the app's one polite live region (announcer.tsx), not one of this column's own.
  const announce = useAnnounce();
  useEffect(() => {
    if (announcement) announce(announcement);
  }, [announcement, announce]);
  // A Next pressed keeps its chip on screen for the whole turn (disabled, with the spinner on the one pressed); the
  // generation gives the chips a fresh start when the turn is over, or could not start.
  const [nextTurn, setNextTurn] = useState(false);
  const [generation, setGeneration] = useState(0);
  const takeNext = (named: NextName) => {
    setNextTurn(true);
    void send({ next: named }).finally(() => {
      setNextTurn(false);
      setGeneration((g) => g + 1);
    });
  };
  // The chips stand only under the latest Tutor reply or card: never under the Learner's own message, before the page
  // has re-read the Learner's place after a turn, with Retry on offer, or on a passed Topic; and during a turn only
  // while it is the one a Next started.
  // While a Check is open there is no Next, and the Choices stay. Under the Topic Start card alone there
  // are none: the Tutor's opener starts by itself.
  const latest = messages.at(-1);
  const opening = latest?.role === "item" && latest.kind === TOPIC_START;
  const chips = !passed && latest && latest.role !== "user" && !opening && !canRetry && ((!running && !refreshing) || nextTurn);
  // The latest reply's Choices (D3a): the reply_choices item code stored after it, or, under a reply or card with none
  // stored (an older Session, a card on its own), code's own set for where the Learner is.
  const choices = latestChoices(messages, quizOpen);
  // The passed Topic's conversation ends at its Topic complete card, which offers where to go next.
  const carded = messages.some((m) => m.role === "item" && m.kind === TOPIC_COMPLETE);
  return (
    <ThreadPrimitive.Root data-testid="chat-column" className="flex h-full min-h-0 min-w-0 flex-col">
      <ThreadPrimitive.Viewport data-testid="thread-viewport" className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6 [scrollbar-gutter:stable]">
        <div className="flex flex-col gap-4">
          <ThreadMessages lines={messages} slot={slot} />
        </div>
        {chips && (
          <Chips
            key={generation}
            offer={next}
            choices={choices.list}
            onNext={takeNext}
            onSay={(words) => void send({ message: words }, words)}
            onChoice={(index) => {
              const says = choices.list[index].says;
              // A stored Choice is resolved on the server from its index; code's own set (no stored Choices) posts its chip words.
              void send(choices.stored ? { choice: index } : { message: says }, says);
            }}
          />
        )}
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
      {passed ? (
        <section aria-label="Topic passed" data-testid="topic-passed" className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] p-4">
          {/* Read-only: a passed Topic shows Passed ✓, never Resume. */}
          <span data-testid="passed-mark" className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs font-medium leading-4">
            Passed ✓
          </span>
          <p className="text-sm leading-5">{passed.title} is passed.</p>
          {/* The Topic complete card carries What comes next and the Course Map; a Topic passed before the card existed has them here. */}
          {!carded && (
            <>
              {passed.next && <WhatComesNextButton label={passed.next} />}
              <a href="/course" className="text-sm leading-5 underline">
                Course Map
              </a>
            </>
          )}
        </section>
      ) : (
        <>
          {quizOpen && (
            // The box stays usable, and the Tutor helps now: it teaches with other numbers and keeps back only the open answers.
            <p className="mb-2 text-xs leading-4 text-[var(--muted)]" data-testid="quiz-note">
              Quiz open. Stuck? Ask the Tutor: it can explain with other numbers.
            </p>
          )}
          {openQuestion && (
            <p className="mb-2 truncate text-xs leading-4 text-[var(--muted)]" data-testid="open-question" title={openQuestion}>
              <span className="font-medium">Open question:</span> {openQuestion}
            </p>
          )}
          <MessageBox waiting={waiting} passage={passage} onPassage={setPassage} running={running} stopping={stopping} progress={progress} onStop={stop} />
        </>
      )}
    </ThreadPrimitive.Root>
  );
}
