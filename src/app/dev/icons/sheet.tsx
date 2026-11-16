"use client";

import { ICON_SET, ICON_SET_NAMES } from "@/icons/names";
import { Icon } from "@/icons/icon";

/**
 * The whole Icon set on a page, at 32 px, with each name and its Lucide drawing (developer tool, spec 2026-11-11 ticket
 * A1a), in the app's one Light theme.
 */
export function IconSheet() {
  return (
    <main className="min-h-screen bg-[var(--paper)] p-4 text-[var(--ink)]" data-testid="icon-sheet">
      <h1 className="type-h1">Icon set</h1>
      <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
        {ICON_SET_NAMES.length} Icons from lucide-react 1.71.0, drawn by the Icon component at 32 px: each name, then its
        Lucide drawing.
      </p>
      <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3">
        {ICON_SET_NAMES.map((name) => (
          <li
            key={name}
            data-icon-name={name}
            className="flex flex-col items-center gap-1 rounded-lg border border-[var(--rule)] bg-[var(--frame)] p-2 text-center"
          >
            <Icon name={name} size={32} label />
            <span className="text-xs leading-4 text-[var(--ink-2)]">{name}</span>
            <span className="text-xs leading-4 text-[var(--muted)]">{ICON_SET[name].drawing}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
