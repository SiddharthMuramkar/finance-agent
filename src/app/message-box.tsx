"use client";

import { ComposerPrimitive } from "@assistant-ui/react";
import { useState } from "react";
import { PrimaryButton } from "./ui";

/** The message box at the bottom of the Study Workspace's left column, pinned under the thread with a fade above it. */
export function MessageBox() {
  return (
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
  );
}

/** How a paste shows in the thread: a short label, as the saved transcript shows it. */
export function pastePreview(paste: string): string {
  const words = paste.split(/\s+/).filter(Boolean);
  return `(Pasted passage, ${words.length} words: "${words.slice(0, 6).join(" ")} …")`;
}

/**
 * Pasting the part of a piece being studied (for example a Zitron article read on his own site).
 * The text is saved privately with this Session and given to the Tutor with the message; it is
 * never added to the Library.
 */
export function PastePanel({ disabled, onSend }: { disabled: boolean; onSend: (message: string, paste: string) => void }) {
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
