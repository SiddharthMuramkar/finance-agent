"use client";

import { AssistantRuntimeProvider, ComposerPrimitive, ThreadPrimitive } from "@assistant-ui/react";
import { useState } from "react";
import type { OpenQuiz } from "@/learner/quiz";
import type { ReviewState } from "@/learner/review";
import { QuizPanel } from "./quiz-panel";
import { ReviewPanel } from "./review-panel";
import { ThreadMessages, type Line } from "./thread";
import { useTurnStream, type PendingTurn } from "./turn-stream";
import { PrimaryButton, SecondaryButton } from "./ui";
import { useWidgetHost, WidgetHost } from "./widget-host";
import { exploreItem, PinnedExplore } from "./widget-panel";
import { StatusCard, type Place } from "./workspace-parts";

export type { Line, PendingTurn };

/**
 * The Study Workspace: the status card, folded review and quiz, and the conversation on the left; the
 * Widget panel on the right. Replies stream in through assistant-ui's external-store runtime; widget
 * blocks are pulled out of the prose as they arrive, and a chip stands where each belongs.
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
  const { messages, running, announcement, fixing, error, notice, canRetry, cutShort, send, runtime } = useTurnStream({ initial, pending, onTurnStart: () => host.showNewest() });
  const host = useWidgetHost({ messages, running, explore });
  const { slot } = host;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)] items-start gap-6 lg:gap-8">
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
            <PastePanel disabled={running} onSend={(message, paste) => void send({ message, paste }, `${message}\n\n${pastePreview(paste)}`)} />
          </ThreadPrimitive.Viewport>
          <p role="status" aria-live="polite" className="sr-only" data-testid="turn-status">
            {announcement}
          </p>
          <div className="relative">
            <div aria-hidden className="fade-above pointer-events-none absolute inset-x-0 -top-6 h-6" />
            <ComposerPrimitive.Root className="flex gap-2">
              <ComposerPrimitive.Input
                placeholder="Ask the Tutor"
                aria-label="Message"
                minRows={1}
                maxRows={6}
                className="flex-1 resize-none rounded border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-base leading-6 placeholder:text-[var(--muted)] focus:border-[var(--brand)] focus:outline-hidden focus:ring-1 focus:ring-[var(--brand)]"
              />
              <ComposerPrimitive.Send className="rounded bg-[var(--brand)] px-4 text-base text-[var(--brand-ink)] transition-colors duration-200 hover:bg-[var(--brand-hover)] disabled:opacity-50 disabled:hover:bg-[var(--brand)]">
                Send
              </ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
          </div>
        </ThreadPrimitive.Root>
        {/* Capped at the column, so the panel is never taller than the space under the header. */}
        <aside aria-label="Widget panel" data-testid="widget-pane" className="sticky top-6 max-h-[min(100%,calc(100dvh-48px))] min-w-0 overflow-y-auto">
          <WidgetHost host={host} topicTitle={place?.title} />
        </aside>
      </div>
    </AssistantRuntimeProvider>
  );
}

/** How a paste shows in the thread: a short label, as the saved transcript shows it. */
function pastePreview(paste: string): string {
  const words = paste.split(/\s+/).filter(Boolean);
  return `(Pasted passage, ${words.length} words: "${words.slice(0, 6).join(" ")} …")`;
}

/**
 * Pasting the part of a piece being studied (for example a Zitron article read on his own site).
 * The text is saved privately with this Session and given to the Tutor with the message; it is
 * never added to the Library.
 */
function PastePanel({ disabled, onSend }: { disabled: boolean; onSend: (message: string, paste: string) => void }) {
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="mt-6 rounded-lg border border-[var(--border)] p-3 text-sm leading-5" data-testid="paste-panel">
      <summary className="cursor-pointer select-none">Paste a passage</summary>
      <p className="mt-2 text-xs leading-4 text-[var(--muted)]">
        Paste the part of the piece you are studying. It is kept privately with this Session and is never added to the Library. The Tutor works only from what you paste.
      </p>
      <textarea
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        aria-label="Passage to paste"
        rows={6}
        className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--field)] px-3 py-2"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="Message with the passage"
        placeholder="Optional: what you want to ask about it"
        className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--field)] px-3 py-2"
      />
      <PrimaryButton
        disabled={disabled || !paste.trim()}
        onClick={() => {
          onSend(note.trim() || "Here is the passage we are studying.", paste.trim());
          setPaste("");
          setNote("");
          setOpen(false);
        }}
        className="mt-2"
      >
        Send passage
      </PrimaryButton>
    </details>
  );
}
