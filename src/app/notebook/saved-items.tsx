"use client";

import { useState } from "react";
import type { SavedItem } from "@/learner/saved";
import type { WidgetSlot } from "../reply-markdown";
import { ReadOnlyThread } from "../thread";
import { LinkButton } from "../ui";
import { WidgetView } from "../widget-view";
import { useOfferUndo } from "./undo";

// A Widget in a saved reply is drawn in place: the Notebook has no Widget panel.
const inline: WidgetSlot = ({ code, complete }) => (
  <span className="my-3 block">
    <WidgetView code={code} complete={complete} />
  </span>
);

async function remove(id: number): Promise<boolean> {
  const res = await fetch("/api/notes/saved", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
  return res?.ok ?? false;
}

/** Saves a removed item again from where it came from (the server checks it as any save); its new id, or null. */
async function saveAgain(item: SavedItem): Promise<number | null> {
  const res = await fetch("/api/notes/saved", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.again) }).catch(() => null);
  const data = res?.ok ? ((await res.json().catch(() => null)) as { id?: number } | null) : null;
  return typeof data?.id === "number" ? data.id : null;
}

/**
 * What the Learner saved while studying a Topic, on one Topic Note: a reply drawn like an old Session (sources
 * folded, the as-of rule already applied by the server) or a Widget that reopens with its saved settings.
 * "Remove from notes" shows an Undo toast, which saves the item again in its old place. Neither prints.
 */
export function SavedItems({ items }: { items: SavedItem[] }) {
  const [shown, setShown] = useState(items);
  const [error, setError] = useState(false);
  const offerUndo = useOfferUndo();
  const removeItem = async (item: SavedItem) => {
    if (!(await remove(item.id))) return setError(true);
    setError(false);
    const at = shown.findIndex((i) => i.id === item.id);
    setShown((list) => list.filter((i) => i.id !== item.id));
    offerUndo({
      message: "Removed from notes.",
      undo: async () => {
        const id = await saveAgain(item);
        if (id === null) return false;
        setShown((list) => [...list.slice(0, at), { ...item, id }, ...list.slice(at)]);
        return true;
      },
    });
  };
  if (!shown.length) return null;
  return (
    <div data-saved className="mt-4">
      <h3 className="text-xs font-semibold uppercase leading-4 tracking-wide text-[var(--muted)]">Saved from Topics</h3>
      <ul className="mt-1 flex flex-col gap-3">
        {shown.map((item) => (
          <li key={item.id} data-saved-item={item.kind} className="break-inside-avoid rounded-lg border border-[var(--border)] p-3 text-sm leading-6">
            {item.kind === "reply" ? (
              <ReadOnlyThread lines={[{ role: "assistant", text: item.text }]} slot={inline} />
            ) : (
              <>
                {item.title && <p className="mb-1 text-xs leading-4 text-[var(--muted)]">Widget · {item.title}</p>}
                <WidgetView code={item.code} complete bare />
              </>
            )}
            <LinkButton data-remove-saved={item.id} onClick={() => void removeItem(item)} className="mt-2 block text-xs leading-4 print:hidden">
              Remove from notes
            </LinkButton>
          </li>
        ))}
      </ul>
      {error && <p className="mt-1 text-xs leading-4 text-[var(--danger)] print:hidden">Could not remove it. Try again.</p>}
    </div>
  );
}
