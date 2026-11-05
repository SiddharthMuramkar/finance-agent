"use client";

import { useEffect } from "react";
import { EMOJI, EMOJI_NAMES } from "@/emoji/registry";
import { Emoji } from "@/emoji/emoji";
import { THEMES, THEME_KIND, applyTheme } from "../../theme";

/**
 * The whole emoji subset on a page, at 48 px, on the chosen theme (developer tool, spec 2026-11-05 ticket E1).
 * `theme` switches the page's tokens to the first theme of that kind; the colour and liveliness critic reads the
 * contact sheet in both.
 */
export function EmojiSheet({ theme }: { theme: "light" | "dark" }) {
  useEffect(() => {
    const before = document.documentElement.dataset.theme as (typeof THEMES)[number] | undefined;
    const wanted = THEMES.find((t) => THEME_KIND[t] === theme);
    if (wanted) applyTheme(wanted);
    return () => {
      if (before && THEMES.includes(before)) applyTheme(before);
    };
  }, [theme]);

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--ink)]" data-testid="emoji-sheet" data-theme={theme}>
      <h1 className="text-xl font-semibold leading-7">Emoji kit</h1>
      <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
        {EMOJI_NAMES.length} Fluent Emoji 3D pictures from public/emoji/, drawn by the Emoji component at 48 px.
      </p>
      <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3">
        {EMOJI_NAMES.map((name) => (
          <li key={name} data-emoji={name} className="flex flex-col items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bubble)] p-2 text-center">
            <Emoji name={name} size={48} label />
            <span className="text-xs leading-4 text-[var(--muted)]">{name}</span>
            <span className="sr-only">{EMOJI[name].alt}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
