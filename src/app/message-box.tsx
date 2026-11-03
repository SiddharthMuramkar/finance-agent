"use client";

import { ComposerPrimitive } from "@assistant-ui/react";
import type { Waiting } from "./turn-stream";

/** "Tutor is writing…" from Send until the first words of the reply, then "Still working on it…" after 8 seconds. */
export function WritingIndicator({ waiting }: { waiting: Waiting }) {
  if (!waiting) return null;
  return (
    <p className="mb-2 text-sm leading-5 text-[var(--muted)]" data-testid="writing-indicator">
      {waiting === "slow" ? "Still working on it…" : "Tutor is writing…"}
    </p>
  );
}

/**
 * The message box at the bottom of the Study Workspace's left column, pinned under the thread with a fade above it.
 * It stays editable while a turn runs, so the Learner can draft the next message; Send stays off during a turn and
 * while the box is empty (assistant-ui's composer rules). Attach a passage opens a small box beside it: the text is
 * saved privately with this Session and given to the Tutor with the message, never added to the Library. The one
 * Send sends the message and the passage together.
 */
export function MessageBox({ waiting, passage, onPassage }: { waiting: Waiting; passage: string | null; onPassage: (passage: string | null) => void }) {
  const open = passage !== null;
  return (
    <div className="relative">
      <div aria-hidden className="fade-above pointer-events-none absolute inset-x-0 -top-6 h-6" />
      <WritingIndicator waiting={waiting} />
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
        <button
          type="button"
          aria-expanded={open}
          onClick={() => onPassage(open ? null : "")}
          className="rounded border border-[var(--border)] px-3 text-sm leading-5 text-[var(--muted)] transition-colors duration-200 hover:border-[var(--brand-line)] hover:text-[var(--brand)]"
        >
          {open ? "Remove passage" : "Attach a passage"}
        </button>
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
  );
}
