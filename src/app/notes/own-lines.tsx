"use client";

import { useState } from "react";
import { PrimaryButton, SecondaryButton } from "../ui";

export type OwnLine = { id: number; text: string };

const MAX = 2000;

async function send(method: "POST" | "PATCH" | "DELETE", body: object): Promise<{ ok: true; line?: OwnLine } | { ok: false; error: string }> {
  const res = await fetch("/api/notes", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => null)) as { id?: number; text?: string; error?: string } | null;
  if (!res.ok) return { ok: false, error: data?.error ?? `Something went wrong (${res.status}).` };
  return { ok: true, line: data?.id !== undefined && data.text !== undefined ? { id: data.id, text: data.text } : undefined };
}

const field = "w-full rounded border border-[var(--border)] bg-[var(--field)] px-2 py-1 text-sm leading-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]";

/** The Learner's own lines on one Topic Note: add, edit and delete. The controls do not print; the lines do. */
export function OwnLines({ topicId, initial }: { topicId: string; initial: OwnLine[] }) {
  const [lines, setLines] = useState(initial);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const remove = async (id: number) => {
    const r = await send("DELETE", { id });
    if (!r.ok) return setError(r.error);
    setError(null);
    setLines((l) => l.filter((x) => x.id !== id));
  };

  return (
    <div data-own-lines={topicId} className="mt-4">
      {lines.length > 0 && (
        <>
          <h3 className="text-xs font-semibold uppercase leading-4 tracking-wide text-[var(--muted)]">Your lines</h3>
          <ul className="mt-1 flex flex-col gap-1">
            {lines.map((line) => (
              <li key={line.id} data-line={line.id} className="text-sm leading-6">
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
                      <PrimaryButton data-save-line onClick={() => void save()} className="!px-2 !py-1 text-xs">
                        Save
                      </PrimaryButton>
                      <SecondaryButton onClick={() => setEditing(null)} className="!px-2 !py-1 text-xs">
                        Cancel
                      </SecondaryButton>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="whitespace-pre-wrap">{line.text}</span>
                    <span className="flex shrink-0 gap-3 text-xs print:hidden">
                      <button type="button" data-edit-line={line.id} onClick={() => setEditing({ id: line.id, text: line.text })} className="text-[var(--muted)] underline hover:text-[var(--brand)]">
                        Edit
                      </button>
                      <button type="button" data-delete-line={line.id} onClick={() => void remove(line.id)} className="text-[var(--muted)] underline hover:text-[var(--danger)]">
                        Delete
                      </button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <form
        className="mt-2 flex gap-2 print:hidden"
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
        <SecondaryButton type="submit" data-add-line={topicId} disabled={!draft.trim()} className="shrink-0 !px-3 !py-1 text-xs">
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
