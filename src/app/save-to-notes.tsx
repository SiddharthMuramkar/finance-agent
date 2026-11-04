"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * What to save: a reply (its Session and turn), or a Widget of one (also its number in the reply; the explore Widget
 * is number -1, and `widgetKey` is the key its Widget state is saved under in that Session).
 */
export type SaveTarget =
  | { kind: "reply"; sessionId: number; turnSeq: number }
  | { kind: "widget"; sessionId?: number; turnSeq?: number; widgetIndex: number; widgetKey?: string };

/** Where the control is: not saved, saving, saved as item `id` on Topic `topicId`, or a failed save or Undo. */
export type SaveState =
  | { status: "idle" | "saving" }
  | { status: "saved"; id: number; topicId: string }
  | { status: "failed"; message: string };

const quiet =
  "-my-2 cursor-pointer py-2 underline-offset-2 hover:text-[var(--ink)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)] disabled:opacity-50";

/**
 * What the Save to notes control shows. Before a save, one quiet button. After it, "Saved ✓ · Undo · Open notes":
 * there is no button to save the same thing again, Undo takes the saved item back off, and Open notes goes to
 * that Topic's note.
 */
export function SaveToNotesView({ state, what, onSave, onUndo }: { state: SaveState; what: "reply" | "Widget"; onSave: () => void; onUndo: () => void }) {
  return (
    <span className="relative inline-flex items-center gap-2 text-xs leading-4 text-[var(--muted)] print:hidden" data-testid="save-to-notes">
      {state.status === "saved" ? (
        <>
          <span>Saved ✓</span>
          <span aria-hidden>·</span>
          <button type="button" data-undo-save onClick={onUndo} aria-label={`Undo: take this ${what} off your notes`} className={quiet}>
            Undo
          </button>
          <span aria-hidden>·</span>
          <Link href={`/notes#note-${state.topicId}`} className="underline underline-offset-2 hover:text-[var(--ink)]">
            Open notes
          </Link>
        </>
      ) : (
        <button type="button" onClick={onSave} disabled={state.status === "saving"} aria-label={`Save this ${what} to notes`} className={quiet}>
          Save to notes
        </button>
      )}
      <span role="status" className={state.status === "failed" ? "text-[var(--danger)]" : "sr-only"}>
        {state.status === "failed" ? state.message : state.status === "saved" ? "Saved to notes" : ""}
      </span>
    </span>
  );
}

/**
 * The quiet "Save to notes" action under a Tutor reply or a Widget. The server finds the Topic and takes
 * the Widget's code from the stored reply or the Topic file: only the place and the slider numbers
 * are sent. `getSettings` is read when the button is pressed, so it sends the numbers the Learner has now.
 * The server keeps one saved item per reply or Widget, so even two tabs cannot save a duplicate.
 */
export function SaveToNotes({ target, getSettings, what }: { target: SaveTarget; getSettings?: () => Record<string, number>; what: "reply" | "Widget" }) {
  const [state, setState] = useState<SaveState>({ status: "idle" });
  const save = async () => {
    setState({ status: "saving" });
    try {
      const body = target.kind === "widget" ? { ...target, settings: getSettings?.() ?? {} } : target;
      const res = await fetch("/api/notes/saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => null)) as { id?: number; topicId?: string } | null;
      if (res.ok && typeof data?.id === "number" && typeof data.topicId === "string") setState({ status: "saved", id: data.id, topicId: data.topicId });
      else setState({ status: "failed", message: "Could not save. Try again." });
    } catch {
      setState({ status: "failed", message: "Could not save. Try again." });
    }
  };
  const undo = async () => {
    if (state.status !== "saved") return;
    const kept = state;
    setState({ status: "saving" });
    const res = await fetch("/api/notes/saved", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: kept.id }) }).catch(() => null);
    // Already gone (removed on Notes in another tab) counts as undone.
    if (res && (res.ok || res.status === 404)) setState({ status: "idle" });
    else setState(kept);
  };
  return <SaveToNotesView state={state} what={what} onSave={() => void save()} onUndo={() => void undo()} />;
}
