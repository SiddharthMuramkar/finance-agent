"use client";

import { ComposerPrimitive } from "@assistant-ui/react";
import type { Waiting } from "./turn-stream";
import { Button, Spinner } from "./ui";

/**
 * What the Tutor is doing, in plain words: the server's progress label when it has sent one ("Looking up Case Data…"),
 * else "Tutor is writing…" from Send until the first words of the reply, then "Still working on it…" after 8 seconds.
 */
export function WritingIndicator({ waiting, label = null }: { waiting: Waiting; label?: string | null }) {
  if (!waiting && !label) return null;
  return (
    <p className="mb-2 text-sm leading-5 text-[var(--muted)]" data-testid="writing-indicator">
      {label ?? (waiting === "slow" ? "Still working on it…" : "Tutor is writing…")}
    </p>
  );
}

function Paperclip() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-4 w-4 shrink-0">
      <path d="M13 7.5 8 12.5a3 3 0 0 1-4.2-4.2l5-5a2 2 0 0 1 2.8 2.8l-5 5a1 1 0 0 1-1.4-1.4L10 5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The message box at the bottom of the Study Workspace's left column, pinned under the thread with a fade above it.
 * It stays editable while a turn runs, so the Learner can draft the next message; Send stays off during a turn and
 * while the box is empty (assistant-ui's composer rules). Attach a passage opens a small box beside it: the text is
 * saved privately with this Session and given to the Tutor with the message, never added to the Library. The one
 * Send sends the message and the passage together. While a reply runs, Send becomes Stop: the reply ends where it
 * is and what it had written is kept.
 */
export function MessageBox({
  waiting,
  passage,
  onPassage,
  running = false,
  stopping = false,
  progress = null,
  onStop,
}: {
  waiting: Waiting;
  passage: string | null;
  onPassage: (passage: string | null) => void;
  running?: boolean;
  /** Stop was pressed and the Tutor is winding down. */
  stopping?: boolean;
  /** The server's plain-word label for what the Tutor is doing now. */
  progress?: string | null;
  onStop?: () => void;
}) {
  const open = passage !== null;
  return (
    <div className="relative">
      <div aria-hidden className="fade-above pointer-events-none absolute inset-x-0 -top-6 h-6" />
      <WritingIndicator waiting={waiting} label={progress} />
      {open && (
        <div className="mb-2 rounded-lg border border-[var(--border)] p-3" data-testid="attach-box">
          <p className="text-xs leading-4 text-[var(--muted)]">
            Paste the part of the piece you are studying. It is kept privately with this Session and is never added to the Library. It goes with your next message.
          </p>
          <textarea
            value={passage}
            onChange={(e) => onPassage(e.target.value)}
            aria-label="Passage to attach"
            rows={4}
            className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-sm leading-5"
          />
        </div>
      )}
      <ComposerPrimitive.Root className="flex gap-2">
        <Button type="button" variant="ghost" pressed={open} onClick={() => onPassage(open ? null : "")} className={open ? "bg-[var(--brand-tint)] text-[var(--brand)]" : ""}>
          <Paperclip />
          {open ? "Remove passage" : "Attach a passage"}
        </Button>
        <ComposerPrimitive.Input
          placeholder="Ask the Tutor"
          aria-label="Message"
          minRows={1}
          maxRows={6}
          className="flex-1 resize-none rounded border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-base leading-6 placeholder:text-[var(--muted)] focus:border-[var(--brand)] focus:outline-hidden focus:ring-1 focus:ring-[var(--brand)]"
        />
        {running ? (
          <Button type="button" variant="secondary" data-testid="stop-reply" disabled={stopping} onClick={onStop} title="Stop the reply and keep what is written">
            <Spinner />
            {stopping ? "Stopping…" : "Stop"}
          </Button>
        ) : (
          <ComposerPrimitive.Send asChild>
            <Button variant="primary" title="Send (Enter)">
              Send
            </Button>
          </ComposerPrimitive.Send>
        )}
      </ComposerPrimitive.Root>
    </div>
  );
}
