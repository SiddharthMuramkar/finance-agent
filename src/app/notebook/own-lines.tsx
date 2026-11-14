"use client";

import { useState } from "react";
import { LinkButton, PrimaryButton, SecondaryButton } from "../ui";
import { useOfferUndo } from "./undo";

/** `ownRule`: a rule in the Learner's own words that the Tutor saved; the page labels it "Your rule". */
export type OwnLine = { id: number; text: string; ownRule?: boolean };

const MAX = 2000;

export async function send(method: "POST" | "PATCH" | "DELETE", body: object): Promise<{ ok: true; line?: OwnLine } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch("/api/notes", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
  const data = (await res.json().catch(() => null)) as { id?: number; text?: string; ownRule?: boolean; error?: string } | null;
  if (!res.ok) return { ok: false, error: data?.error ?? `Something went wrong (${res.status}).` };
  return { ok: true, line: data?.id !== undefined && data.text !== undefined ? { id: data.id, text: data.text, ...(data.ownRule && { ownRule: true }) } : undefined };
}

/** A text field (ADR 0013's .field: a strong edge, the accent edge and halo on focus), full width. */
const field = "field w-full";

/**
 * The Learner's own lines on one Topic Note: add, edit and delete. Delete shows an Undo toast, which adds the line
 * back in its old place. The controls do not print; the lines do. A part of the row under a hairline (ADR 0013).
 */
export function OwnLines({ topicId, initial }: { topicId: string; initial: OwnLine[] }) {
  const [lines, setLines] = useState(initial);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offerUndo = useOfferUndo();

  const add = async () => {
    const r = await send("POST", { topicId, text: draft });
    if (!r.ok) return setError(r.error);
    setError(null);
    setDraft("");
    if (r.line) setLines((l) => [...l, r.line!]);
  };
  const save = async () => {
    if (!editing) return;
    const r = await send("PATCH", { id: editing.id, text: editing.text });
    if (!r.ok) return setError(r.error);
    setError(null);
    setLines((l) => l.map((x) => (x.id === editing.id && r.line ? r.line : x)));
    setEditing(null);
  };
  const remove = async (line: OwnLine) => {
    const r = await send("DELETE", { id: line.id });
    if (!r.ok) return setError(r.error);
    setError(null);
    const at = lines.findIndex((x) => x.id === line.id);
    setLines((l) => l.filter((x) => x.id !== line.id));
    offerUndo({
      message: "Line removed from notes.",
      undo: async () => {
        const back = await send("POST", { topicId, text: line.text });
        if (!back.ok || !back.line) return false;
        setLines((l) => [...l.slice(0, at), back.line!, ...l.slice(at)]);
        return true;
      },
    });
  };

  return (
    <div data-own-lines={topicId} className="mt-5 border-t border-[var(--rule)] pt-4">
      {lines.length > 0 && (
        <>
          <h3 className="type-eyebrow text-[var(--muted)]">Your lines</h3>
          <ul className="mt-1 divide-y divide-[var(--rule)]">
            {lines.map((line) => (
              <li key={line.id} data-line={line.id} className="py-2 text-sm leading-6">
                {editing?.id === line.id ? (
                  <div className="flex flex-col gap-2 print:hidden">
                    <textarea
                      aria-label="Edit your line"
                      autoFocus
                      rows={2}
                      maxLength={MAX}
                      value={editing.text}
                      onChange={(e) => setEditing({ id: line.id, text: e.target.value })}
                      onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                      className={field}
                    />
                    <div className="flex gap-2">
                      <PrimaryButton size="sm" data-save-line onClick={() => void save()}>
                        Save
                      </PrimaryButton>
                      <SecondaryButton size="sm" onClick={() => setEditing(null)}>
                        Cancel
                      </SecondaryButton>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="whitespace-pre-wrap">
                      {line.ownRule && (
                        // A static tag (6px corners, ADR 0013), not a pill.
                        <span data-own-rule-label data-affordance="tag" className="tag mr-2">
                          Your rule
                        </span>
                      )}
                      {line.text}
                    </span>
                    <span className="flex shrink-0 gap-3 text-xs print:hidden">
                      <LinkButton data-edit-line={line.id} onClick={() => setEditing({ id: line.id, text: line.text })}>
                        Edit
                      </LinkButton>
                      <LinkButton data-delete-line={line.id} onClick={() => void remove(line)} className="!text-[var(--danger)]">
                        Delete
                      </LinkButton>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <form
        className={`${lines.length > 0 ? "mt-2" : ""} flex gap-2 print:hidden`}
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          aria-label="Add a line to these notes"
          placeholder="Add a line of your own"
          maxLength={MAX}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={field}
        />
        <SecondaryButton type="submit" data-add-line={topicId} disabled={!draft.trim()} className="shrink-0">
          Add
        </SecondaryButton>
      </form>
      {error && (
        <p role="alert" className="mt-1 text-xs text-[var(--danger)] print:hidden">
          {error}
        </p>
      )}
    </div>
  );
}
