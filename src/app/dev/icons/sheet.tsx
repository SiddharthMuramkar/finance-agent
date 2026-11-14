"use client";

import { useEffect } from "react";
import { ICON_SET, ICON_SET_NAMES } from "@/icons/names";
import { Icon } from "@/icons/icon";
import { THEMES, THEME_KIND, applyTheme } from "../../theme";

/**
 * The whole Icon set on a page, at 32 px, with each name and its Lucide drawing, on the chosen theme (developer tool,
 * spec 2026-11-11 ticket A1a). `theme` switches the page's tokens to the first theme of that kind, so the colour and
 * liveliness critic can read the sheet in Light and Dark.
 */
export function IconSheet({ theme }: { theme: "light" | "dark" }) {
  useEffect(() => {
    const before = document.documentElement.dataset.theme as (typeof THEMES)[number] | undefined;
    const wanted = THEMES.find((t) => THEME_KIND[t] === theme);
    if (wanted) applyTheme(wanted);
    return () => {
      if (before && THEMES.includes(before)) applyTheme(before);
    };
  }, [theme]);

  return (
    <main className="min-h-screen bg-[var(--paper)] p-4 text-[var(--ink)]" data-testid="icon-sheet" data-theme={theme}>
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
