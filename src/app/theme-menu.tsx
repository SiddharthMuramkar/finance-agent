"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { IconButton } from "./icon-button";
import { MenuItem } from "./primitives";
import { THEMES, THEME_LABEL, THEME_SWATCH, resolveTheme, type ThemeId, type ThemePref } from "./theme";
import { followSystem, pinTheme, useThemeState } from "./theme-store";

const icon = { viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

/** The three dots of a theme: its page, text and brand colours, drawn whichever theme the page is in. */
function Swatch({ theme }: { theme: ThemeId }) {
  const { bg, ink, brand } = THEME_SWATCH[theme];
  return (
    <span aria-hidden="true" data-testid={`swatch-${theme}`} className="flex shrink-0 items-center gap-0.5">
      {[bg, ink, brand].map((colour, i) => (
        <span key={i} className="h-2.5 w-2.5 rounded-full border border-[var(--border)]" style={{ backgroundColor: colour }} />
      ))}
    </span>
  );
}

function Item({ checked, swatch, onPick, children }: { checked: boolean; swatch: ThemeId; onPick: () => void; children: ReactNode }) {
  return (
    <MenuItem role="menuitemradio" aria-checked={checked} onClick={onPick} className="py-1.5 !px-2">
      <Swatch theme={swatch} />
      <span className="min-w-0 flex-1">{children}</span>
      <svg {...icon} className={`h-4 w-4 shrink-0 text-[var(--brand)] ${checked ? "" : "invisible"}`}>
        <path d="M4.5 10.5 8 14l7.5-8" />
      </svg>
    </MenuItem>
  );
}

/**
 * The header's Theme menu: an icon button named "Theme: Dark" that opens Light, Dark and Match my Mac. The button shows
 * the sun, the moon or the laptop of the current choice. A pick applies at once and saves. Enter, Space or ArrowDown
 * opens; the arrows, Home and End move; Enter or Space picks; Escape closes and returns focus to the button. `initial`
 * comes from readTheme(), so the right icon is there from the first frame.
 */
export function ThemeMenu({ initial, className = "" }: { initial: ThemePref; className?: string }) {
  const { pref, osDark, theme } = useThemeState(initial);
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? [])];
  useEffect(() => {
    if (!open) return;
    const rows = items();
    (rows.find((row) => row.getAttribute("aria-checked") === "true") ?? rows[0])?.focus();
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };
  const pick = (apply: () => void) => {
    apply();
    close();
  };
  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const rows = items();
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = { ArrowDown: (i + 1) % rows.length, ArrowUp: (i - 1 + rows.length) % rows.length, Home: 0, End: rows.length - 1 };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key in moves) {
      e.preventDefault();
      rows[moves[e.key]]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={root} className="relative inline-flex">
      <IconButton
        ref={toggle}
        label={theme ? `Theme: ${THEME_LABEL[theme]}` : "Theme"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        data-testid="theme-menu-button"
        className={className}
      >
        {pref.mode === "system" ? (
          <svg {...icon} className="h-4 w-4" data-testid="theme-icon-system">
            <rect x="3" y="4" width="14" height="9" rx="1.5" />
            <path d="M7 16.5h6M10 13v3.5" />
          </svg>
        ) : pref.theme === "light" ? (
          <svg {...icon} className="h-4 w-4" data-testid="theme-icon-light">
            <circle cx="10" cy="10" r="3.5" />
            <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
          </svg>
        ) : (
          <svg {...icon} className="h-4 w-4" data-testid="theme-icon-dark">
            <path d="M16.5 11.5A6.5 6.5 0 0 1 8.5 3.5a6.5 6.5 0 1 0 8 8Z" />
          </svg>
        )}
      </IconButton>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label="Theme"
          onKeyDown={onMenuKey}
          data-testid="theme-menu"
          className="absolute top-full right-0 z-20 mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1"
        >
          {THEMES.map((id) => (
            <Item key={id} checked={pref.mode === "single" && pref.theme === id} swatch={id} onPick={() => pick(() => pinTheme(id))}>
              {THEME_LABEL[id]}
            </Item>
          ))}
          <Item checked={pref.mode === "system"} swatch={resolveTheme({ mode: "system" }, osDark ?? false)} onPick={() => pick(followSystem)}>
            Match my Mac
          </Item>
        </div>
      )}
    </div>
  );
}
