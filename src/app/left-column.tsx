"use client";

import { ThreadPrimitive, useAuiState } from "@assistant-ui/react";
import { useEffect, useRef, useState } from "react";
import { useAnnounce } from "./announcer";
import { BackToTurn, openQuickTryKey } from "./back-to-turn";
import { WhatComesNextButton } from "./course/jump-button";
import { MessageBox } from "./message-box";
import type { WidgetSlot } from "./reply-markdown";
import { ThreadMessages } from "./thread";
import { FailedTurnDetails } from "./under-the-hood";
import { spokenOf, type TurnStream } from "./turn-stream";
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
  return { list: choicesFor(quizOpen ? "check" : "concept", null, null, null), stored: false };
}

/**
 * The Study Workspace's left column, top to bottom: the thread with the Next chip and the reply's Choices under its latest reply, the turn's notices, error and Retry, the quiz note while a quiz is open (the quiz
 * itself is in the right panel's Check tab), and the message box with the writing indicator and Attach a passage.
 * While a Quick try is open and scrolled out of view, "Back to your turn" sits above the message box (G3, A5).
 * A Topic passed in a turn stays on screen with no message box: What comes next and the Course Map instead.
 * The Topic bar is a Band above both columns (WorkspaceTopicBar); the pinned explore Widget and the folded review stand at the top of the right column (TopicHeader).
 * It shows the turn stream's phase and starts turns through it; Widget chips come from the Widget host's `slot`.
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
  const { messages, phase, refreshing, passage, setPassage, send, retry, stop } = turn;
  const running = phase.kind === "running";
  // Retry once a turn failed; Finish this reply once a reply was cut short. Neither while a turn runs.
  const retryOffered = phase.kind !== "running" && phase.retry;
  const cutShort = phase.kind === "ended" && phase.cutShort;
  // The turn's status words go to the app's one polite live region (announcer.tsx), not one of this column's own.
  const announce = useAnnounce();
  const announcement = spokenOf(phase);
  // Words in the message box make Send the view's one primary; the Next chip steps back to secondary (Appendix B.7, #478).
  const composing = !useAuiState((st) => st.composer.isEmpty);
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
  const chips = !passed && latest && latest.role !== "user" && !opening && !retryOffered && ((!running && !refreshing) || nextTurn);
  // The latest reply's Choices (D3a): the reply_choices item code stored after it, or, under a reply or card with none
  // stored (an older Session, a card on its own), code's own set for where the Learner is.
  const choices = latestChoices(messages, quizOpen);
  // The passed Topic's conversation ends at its Topic complete card, which offers where to go next.
  const carded = messages.some((m) => m.role === "item" && m.kind === TOPIC_COMPLETE);
  // The open Quick try (G3, A5): "Back to your turn" above the message box while its card is scrolled out of view.
  const threadBlock = useRef<HTMLDivElement>(null);
  const openTry = openQuickTryKey(messages);
  return (
    <ThreadPrimitive.Root id="conversation-column" data-testid="chat-column" className="@container/chat flex h-full min-h-0 min-w-0 flex-col">
      <ThreadPrimitive.Viewport data-testid="thread-viewport" className="quiet-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6 [scrollbar-gutter:stable_both-edges]">
        <div ref={threadBlock} data-testid="reading-block" className="reading-block">
        {/* 24px between messages (ADR 0013): air instead of boxes. */}
        <div className="flex flex-col gap-6">
          <ThreadMessages lines={messages} slot={slot} />
        </div>
        {chips && (
          <Chips
            key={generation}
            offer={next}
            choices={choices.list}
            onNext={takeNext}
            composing={composing}
            onSay={(words) => void send({ message: words }, words)}
            onChoice={(index) => {
              const says = choices.list[index].says;
              // A stored Choice is resolved on the server from its index; code's own set (no stored Choices) posts its chip words.
              void send(choices.stored ? { choice: index } : { message: says }, says);
            }}
          />
        )}
        {phase.notice && (
          <p className="my-3 text-sm leading-5 text-[var(--muted)]" data-testid="turn-notice">
            {phase.notice}
          </p>
        )}
        {phase.error && (
          <p className="my-3 text-sm leading-5 text-[var(--danger)]" data-testid="turn-error">
            {phase.error}
          </p>
        )}
        {/* What the provider said: sent only to a Learner with Show developer details on (A3). */}
        {phase.error && phase.provider && <FailedTurnDetails details={phase.provider} />}
        {(retryOffered || cutShort) && (
          <div className="my-2 flex items-center gap-2">
            {retryOffered && <SecondaryButton onClick={retry}>Retry</SecondaryButton>}
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
        </div>
      </ThreadPrimitive.Viewport>
      <div data-testid="composer-block" className="reading-block">
      {passed ? (
        <section aria-label="Topic passed" data-testid="topic-passed" className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] p-3">
          {/* Read-only: a passed Topic shows Passed ✓, never Resume. */}
          <span data-testid="passed-mark" className="inline-flex items-center rounded-md bg-[var(--success-tint)] px-1.5 text-xs font-medium leading-5 text-[var(--success)]">
            Passed ✓
          </span>
          <p className="text-sm leading-5">{passed.title} is passed.</p>
          {/* The Topic complete card carries What comes next and the Course Map; a Topic passed before the card existed has them here. */}
          {!carded && (
            <>
              {passed.next && <WhatComesNextButton label={passed.next} />}
              <a href="/course" data-affordance="link" className="link text-sm leading-5">
                Course Map
              </a>
            </>
          )}
        </section>
      ) : (
        <>
          {quizOpen && (
            // The box stays usable, and the Tutor helps now: it teaches with other numbers and keeps back only the open answers.
            // Above the message box's fade band (relative z-[1]), so the note reads at full strength.
            <p className="relative z-[1] mb-2 text-[13px] leading-[18px] text-[var(--muted)]" data-testid="quiz-note">
              Quiz open. Stuck? Ask the Tutor: it can explain with other numbers.
            </p>
          )}
          {openQuestion && (
            <p className="relative z-[1] mb-2 truncate text-[13px] leading-[18px] text-[var(--muted)]" data-testid="open-question" title={openQuestion}>
              <span className="font-medium">Open question:</span> {openQuestion}
            </p>
          )}
          <BackToTurn thread={threadBlock} openKey={openTry} />
          <MessageBox phase={phase} passage={passage} onPassage={setPassage} onStop={stop} />
        </>
      )}
      </div>
    </ThreadPrimitive.Root>
  );
}
