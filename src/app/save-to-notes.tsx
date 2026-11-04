"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAnnounce } from "./announcer";
import { Button } from "./ui";

/**
 * What to save: a reply (its Session and turn), or a Widget of one (also its number in the reply; the explore Widget
 * is number -1, and `widgetKey` is the key its Widget state is saved under in that Session).
 */
export type SaveTarget =
  | { kind: "reply"; sessionId: number; turnSeq: number }
  | { kind: "widget"; sessionId?: number; turnSeq?: number; widgetIndex: number; widgetKey?: string };

/**
 * Where the control is: not saved, saving, saved as item `id` on Topic `topicId` (`settled`: the "Saved ✓" moment is over and
 * the control is back to offering Save to notes, with a quiet Saved badge), or a failed save or Undo.
 */
export type SaveState =
  | { status: "idle" | "saving" }
  | { status: "saved"; id: number; topicId: string; settled?: boolean }
  | { status: "failed"; message: string };

/** How long "Saved ✓" stays before the control settles back. */
export const SAVED_HOLD_MS = 1600;

function Bookmark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <path d="M4 2.5h8v11L8 10.5l-4 3Z" />
    </svg>
  );
}

/**
 * What the Save to notes control shows (it announces nothing itself: the app announcer does). Idle: a ghost button with a
 * bookmark. Saving: the same button with a spinner and "Saving…". Just saved: "Saved ✓ · Undo · Open notes". A moment
 * later (`settled`): the button again, with a quiet "Saved" badge, Undo and Open notes; the server keeps one saved
 * item per reply or Widget, so pressing it again saves nothing twice. Failed: a visible alert and Retry.
 */
export function SaveToNotesView({ state, what, onSave, onUndo }: { state: SaveState; what: "reply" | "Widget"; onSave: () => void; onUndo: () => void }) {
  const saved = state.status === "saved";
  const justSaved = saved && !state.settled;
  const label = `Save this ${what} to notes`;
  return (
    <span className="relative inline-flex flex-wrap items-center gap-x-2 text-xs leading-4 text-[var(--muted)] print:hidden" data-testid="save-to-notes" data-save-state={state.status}>
      {justSaved ? (
        <span>Saved ✓</span>
      ) : state.status === "failed" ? (
        <>
          <span role="alert" className="text-[var(--danger)]">
            {state.message}
          </span>
          <Button variant="secondary" size="sm" onClick={onSave} aria-label={`Retry: ${label}`}>
            Retry
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="sm" onClick={onSave} loading={state.status === "saving"} aria-label={label} className="-ml-3">
          {state.status !== "saving" && <Bookmark />}
          {state.status === "saving" ? "Saving…" : "Save to notes"}
        </Button>
      )}
      {saved && (
        <>
          {!justSaved && (
            <span data-testid="saved-badge" className="rounded-full bg-[var(--hairline)] px-2 py-0.5 text-[11px] font-medium leading-4">
              Saved
            </span>
          )}
          <span aria-hidden>·</span>
          <Button variant="ghost" size="sm" data-undo-save onClick={onUndo} aria-label={`Undo: take this ${what} off your notes`} className="-my-2">
            Undo
          </Button>
          <span aria-hidden>·</span>
          <Link href={`/notes#note-${state.topicId}`} className="-my-2 py-2 underline underline-offset-2 hover:text-[var(--ink)]">
            Open notes
          </Link>
        </>
      )}
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
  const announce = useAnnounce();
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (hold.current && clearTimeout(hold.current)), []);
  const save = async () => {
    setState({ status: "saving" });
    try {
      const body = target.kind === "widget" ? { ...target, settings: getSettings?.() ?? {} } : target;
      const res = await fetch("/api/notes/saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => null)) as { id?: number; topicId?: string } | null;
      if (res.ok && typeof data?.id === "number" && typeof data.topicId === "string") {
        const { id, topicId } = data;
        setState({ status: "saved", id, topicId });
        announce("Saved to notes");
        if (hold.current) clearTimeout(hold.current);
        hold.current = setTimeout(() => setState((now) => (now.status === "saved" ? { ...now, settled: true } : now)), SAVED_HOLD_MS);
      } else setState({ status: "failed", message: "Could not save. Try again." });
    } catch {
      setState({ status: "failed", message: "Could not save. Try again." });
    }
  };
  const undo = async () => {
    if (state.status !== "saved") return;
    const kept = state;
    if (hold.current) clearTimeout(hold.current);
    setState({ status: "saving" });
    const res = await fetch("/api/notes/saved", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: kept.id }) }).catch(() => null);
    // Already gone (removed on Notes in another tab) counts as undone.
    if (res && (res.ok || res.status === 404)) {
      setState({ status: "idle" });
      announce("Removed from notes");
    } else setState(kept);
  };
  return <SaveToNotesView state={state} what={what} onSave={() => void save()} onUndo={() => void undo()} />;
}
