"use client";

import Link from "next/link";
import { useState } from "react";

/** What to save: a reply (its Session and turn), or a Widget of one (also its number in the reply; the explore Widget is number -1). */
export type SaveTarget =
  | { kind: "reply"; sessionId: number; turnSeq: number }
  | { kind: "widget"; sessionId?: number; turnSeq?: number; widgetIndex: number };

type Status = "idle" | "saving" | "saved" | "failed";

/**
 * The quiet "Save to notes" action under a Tutor reply or a Widget. The server finds the Topic and takes
 * the Widget's code from the stored reply or the Topic file: only the place and the slider numbers
 * are sent. `getSettings` is read when the button is pressed, so it sends the numbers the Learner has now.
 */
export function SaveToNotes({ target, getSettings, what }: { target: SaveTarget; getSettings?: () => Record<string, number>; what: "reply" | "Widget" }) {
  const [status, setStatus] = useState<Status>("idle");
  const save = async () => {
    setStatus("saving");
    try {
      const body = target.kind === "widget" ? { ...target, settings: getSettings?.() ?? {} } : target;
      const res = await fetch("/api/notes/saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setStatus(res.ok ? "saved" : "failed");
    } catch {
      setStatus("failed");
    }
  };
  return (
    <span className="inline-flex items-center gap-2 text-xs leading-4 text-[var(--muted)] print:hidden" data-testid="save-to-notes">
      <button
        type="button"
        onClick={() => void save()}
        disabled={status === "saving"}
        aria-label={`Save this ${what} to notes`}
        className="-my-2 cursor-pointer py-2 underline-offset-2 hover:text-[var(--ink)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)] disabled:opacity-50"
      >
        {status === "saved" ? `Saved: save ${what === "Widget" ? "these settings" : "again"}` : "Save to notes"}
      </button>
      {status === "saved" && (
        <Link href="/notes" className="underline underline-offset-2">
          Open notes
        </Link>
      )}
      <span role="status" className={status === "failed" ? "text-[var(--danger)]" : "sr-only"}>
        {status === "failed" ? "Could not save. Try again." : status === "saved" ? "Saved to notes" : ""}
      </span>
    </span>
  );
}
