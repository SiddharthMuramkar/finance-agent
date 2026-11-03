"use client";

import { useState } from "react";
import type { SavedItem } from "@/learner/saved";
import type { WidgetSlot } from "../reply-markdown";
import { ReadOnlyThread } from "../thread";
import { WidgetView } from "../widget-view";

// A Widget in a saved reply is drawn in place: the Notes page has no Widget panel.
const inline: WidgetSlot = ({ code, complete }) => (
  <span className="my-3 block">
    <WidgetView code={code} complete={complete} />
  </span>
);

async function remove(id: number): Promise<boolean> {
  const res = await fetch("/api/notes/saved", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
  return res?.ok ?? false;
}

/**
 * What the Learner saved while studying a Topic, on one Topic Note: a reply drawn like an old Session (sources
 * folded, the as-of rule already applied by the server) or a Widget that reopens with its saved settings.
 * "Remove" does not print.
 */
export function SavedItems({ items }: { items: SavedItem[] }) {
  const [gone, setGone] = useState<number[]>([]);
  const [error, setError] = useState(false);
  const shown = items.filter((i) => !gone.includes(i.id));
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
            <button
              type="button"
              onClick={async () => {
                if (await remove(item.id)) setGone((g) => [...g, item.id]);
                else setError(true);
              }}
              className="mt-2 cursor-pointer text-xs leading-4 text-[var(--muted)] underline underline-offset-2 hover:text-[var(--ink)] print:hidden"
            >
              Remove from notes
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-1 text-xs leading-4 text-[var(--danger)] print:hidden">Could not remove it. Try again.</p>}
    </div>
  );
}
