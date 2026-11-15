"use client";

import { ComposerPrimitive, useAuiState } from "@assistant-ui/react";
import { useEffect, useRef } from "react";
import type { TurnPhase, Waiting } from "./turn-stream";
import { Button, IconButton, Spinner } from "./ui";

/**
 * What the Tutor is doing, in plain words: the server's progress label when it has sent one ("Looking up Case Data…"),
 * else "Tutor is writing…" from Send until the first words of the reply, then "Still working on it…" after 8 seconds.
 */
export function WritingIndicator({
  waiting,
  label = null,
}: {
  waiting: Waiting;
  label?: string | null;
}) {
  if (!waiting && !label) return null;
  return (
    <p
      className="mb-2 text-[13px] leading-[18px] text-[var(--muted)]"
      data-testid="writing-indicator"
    >
      {label ??
        (waiting === "slow" ? "Still working on it…" : "Tutor is writing…")}
    </p>
  );
}

/**
 * Send, inside the field on the right: its title says why it is off while the box is empty. It is the view's one filled
 * primary only while the box has words; empty, it is off and drawn in the flat dim fill, so the Next chip is the one
 * primary (ADR 0015, #478).
 */
function SendButton() {
  const empty = useAuiState((st) => st.composer.isEmpty);
  return (
    <ComposerPrimitive.Send asChild>
      <Button
        variant="primary"
        size="sm"
        title={empty ? "Type a message to send" : "Send (Enter)"}
        className="shrink-0 whitespace-nowrap"
      >
        Send
      </Button>
    </ComposerPrimitive.Send>
  );
}

/** Lucide's paperclip (24 grid; .btn-icon draws it at 16px, stroke 1.75). */
function Paperclip() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

/**
 * The message box at the bottom of the Study Workspace's left column, pinned under the thread with a fade above it: one
 * 44px field (.field-shell, ADR 0015) holding Attach a passage on the left, the message box, and Send on the right; the
 * field takes the accent edge and halo while the message box has focus.
 * It stays editable while a turn runs, so the Learner can draft the next message; Send stays off during a turn and
 * while the box is empty (assistant-ui's composer rules). Attach a passage opens a small box above it: the text is
 * saved privately with this Session and given to the Tutor with the message, never added to the Library. The one
 * Send sends the message and the passage together. While a reply runs, Send becomes Stop: code holds every reply
 * until it has checked it (ADR 0006), so Stop drops the held reply. The Learner's message stays, with a Stopped note.
 */
export function MessageBox({
  phase,
  passage,
  onPassage,
  onStop,
}: {
  /**
   * The turn stream's phase. While a turn runs: what the writing indicator says (`waiting`, or the server's
   * plain-word `progress` label), and `stopping` once Stop was pressed and the Tutor is winding down.
   */
  phase: TurnPhase;
  passage: string | null;
  onPassage: (passage: string | null) => void;
  onStop?: () => void;
}) {
  const running = phase.kind === "running";
  const waiting: Waiting = running ? phase.waiting : null;
  const open = passage !== null;
  const label = open ? "Remove passage" : "Attach a passage";
  // Send and Stop are one place in the row: focus on either stays when they swap. Send is off on the empty box that comes
  // back after a turn, so focus then goes to the message box instead of being lost with the button.
  const box = useRef<HTMLDivElement>(null);
  const onSwapButton = useRef(false);
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current === running) return;
    wasRunning.current = running;
    const lost =
      onSwapButton.current &&
      (document.activeElement === document.body ||
        document.activeElement === null);
    onSwapButton.current = false;
    if (!lost) return;
    const next = running
      ? box.current?.querySelector<HTMLElement>('[data-testid="stop-reply"]')
      : box.current?.querySelector<HTMLElement>(
          "textarea[aria-label='Message']",
        );
    next?.focus();
  }, [running]);
  return (
    <div className="relative" ref={box}>
      <div
        aria-hidden
        className="fade-above pointer-events-none absolute inset-x-0 -top-6 h-6"
      />
      <WritingIndicator waiting={waiting} label={running ? phase.progress : null} />
      {open && (
        <div
          className="mb-2 rounded-xl border border-[var(--line)] p-3"
          data-testid="attach-box"
        >
          <p className="text-[13px] leading-[18px] text-[var(--muted)]">
            Paste the part of the piece you are studying. It is kept privately
            with this Session and is never added to the Library. It goes with
            your next message.
          </p>
          <textarea
            value={passage}
            onChange={(e) => onPassage(e.target.value)}
            aria-label="Passage to attach"
            rows={4}
            className="field mt-2 block w-full"
          />
        </div>
      )}
      {/* 1 + 5 + 32 + 5 + 1 = 44px: the 32px icon button, message line and Send sit 5px inside the field's edge. */}
      <ComposerPrimitive.Root data-testid="composer" className="field-shell flex items-end gap-1 p-[5px]">
        <IconButton
          label={label}
          pressed={open}
          onClick={() => onPassage(open ? null : "")}
          className="shrink-0"
        >
          <Paperclip />
        </IconButton>
        <ComposerPrimitive.Input
          placeholder="Ask the Tutor"
          aria-label="Message"
          // One row in the server's markup too: auto-grow only sets the height once the page's script runs, and a
          // textarea with no rows is two rows tall until then (#317: CI measured the row before that).
          rows={1}
          minRows={1}
          maxRows={6}
          // 26px line + 3px above and below = 32px, the height of the buttons beside it. outline-hidden keeps an outline
          // in forced colours, where the field's halo is not drawn.
          className="field-bare min-w-0 flex-1 resize-none px-1.5 py-[3px] text-[length:var(--text-chat)] leading-[var(--lh-chat)] focus:outline-hidden"
        />
        <span
          className="contents"
          onFocusCapture={() => (onSwapButton.current = true)}
          onBlurCapture={(e) => {
            if (e.relatedTarget) onSwapButton.current = false;
          }}
        >
          {running ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="stop-reply"
              disabled={phase.stopping}
              onClick={onStop}
              title="Stop the reply"
              className="shrink-0 whitespace-nowrap"
            >
              <Spinner />
              {phase.stopping ? "Stopping…" : "Stop"}
            </Button>
          ) : (
            <SendButton />
          )}
        </span>
      </ComposerPrimitive.Root>
    </div>
  );
}
