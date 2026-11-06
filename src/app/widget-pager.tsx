"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button, IconButton } from "./ui";

/** One stop in the Widget panel's pager: a Widget (or the explore Widget), or the open quiz's Check. */
export type PagerEntry = {
  key: string;
  /** Its title (or "Check 1 of 2"). */
  title: string;
  /** What it shows: the concept eyebrow ("Case Data", "Explore"), or "Quiz". */
  eyebrow: string;
  /** The number of the conversation message it came from, when known. */
  from?: number;
  /** The explore Widget: listed, but hidden from the menu below the laptop breakpoint (it stands in the conversation then). */
  explore?: boolean;
  /** The open quiz's Check. */
  check?: boolean;
};

const Chevron = ({ dir }: { dir: "left" | "right" | "down" }) => (
  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d={dir === "left" ? "M10 3 5 8l5 5" : dir === "right" ? "M6 3l5 5-5 5" : "M3.5 6 8 10.5 12.5 6"} />
  </svg>
);

/** Keys that belong to the control that has focus, so ← and → must not page the panel from it (a slider, a field). */
const OWN_ARROWS = "input, textarea, select, [role=slider], [role=listbox], [contenteditable=true]";

/**
 * The Widget panel's header: ‹ and › (32px), "3 of 11 · <title>", and an "All ▾" listbox. A row of the listbox shows
 * the eyebrow, the title and "from message N", with the current one checked. While the panel has focus, ← and →
 * page (not from a slider or a field, which keep their arrows); Escape closes the listbox and returns focus to its button.
 * `paged` is the entries ← and → walk through (the explore Widget is left out below the laptop breakpoint);
 * the listbox holds every entry, with the explore row hidden there. It stays in the page, hidden, while closed.
 */
export function WidgetPager({
  entries,
  paged,
  current,
  onSelect,
}: {
  entries: readonly PagerEntry[];
  paged: readonly PagerEntry[];
  current: string | undefined;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLUListElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const at = paged.findIndex((e) => e.key === current);
  const now = entries.find((e) => e.key === current);
  const go = (to: number) => {
    const target = paged[to];
    if (target) onSelect(target.key);
  };
  const prev = at < 0 ? paged.length - 1 : at - 1;
  const next = at < 0 ? 0 : at + 1;

  const options = () => [...(menu.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])].filter((o) => getComputedStyle(o).display !== "none");
  useEffect(() => {
    if (!open) return;
    const rows = options();
    (rows.find((o) => o.getAttribute("aria-selected") === "true") ?? rows[0])?.focus();
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) toggle.current?.focus();
  };
  const choose = (key: string) => {
    onSelect(key);
    close(true);
  };
  const onMenuKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const rows = options();
    const i = rows.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      rows[Math.min(rows.length - 1, i + 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      rows[Math.max(0, i - 1)]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      rows[e.key === "Home" ? 0 : rows.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={root} className="relative mb-3 flex items-center gap-1" role="group" aria-label="Widgets in this Session" data-testid="widget-pager">
      <IconButton label="Previous widget" onClick={() => go(prev)} disabled={at <= 0 && at !== -1} data-testid="pager-prev">
        <Chevron dir="left" />
      </IconButton>
      <p className="min-w-0 flex-1 truncate text-center text-sm leading-5" aria-live="polite" data-testid="pager-position" title={now?.title}>
        {at >= 0 && (
          <span className="text-[var(--muted)]">
            {at + 1} of {paged.length} ·{" "}
          </span>
        )}
        <span className="font-medium">{now?.title}</span>
      </p>
      <IconButton label="Next widget" onClick={() => go(next)} disabled={at >= paged.length - 1 && at !== -1} data-testid="pager-next">
        <Chevron dir="right" />
      </IconButton>
      <Button ref={toggle} variant="secondary" size="sm" aria-haspopup="listbox" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)} data-testid="pager-all" className="gap-1">
        All
        <Chevron dir="down" />
      </Button>
      <ul
        ref={menu}
        id={menuId}
        role="listbox"
        aria-label="All widgets"
        hidden={!open}
        onKeyDown={onMenuKey}
        data-testid="pager-menu"
        className="quiet-scroll absolute top-full right-0 z-10 mt-1 max-h-72 w-full max-w-md overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1"
      >
        {entries.map((e) => {
          const selected = e.key === current;
          return (
            <li
              key={e.key}
              role="option"
              aria-selected={selected}
              tabIndex={-1}
              onClick={() => choose(e.key)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  choose(e.key);
                }
              }}
              className={`pressable flex min-h-9 cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm leading-5 hover:bg-[var(--hairline)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)] ${selected ? "bg-[var(--brand-tint)]" : ""} ${e.explore ? "max-lg:hidden" : ""}`}
              data-testid={e.explore ? "explore-chip" : e.check ? "check-tab" : undefined}
            >
              <span aria-hidden="true" className="mt-0.5 w-4 shrink-0 text-[var(--brand)]">
                {selected ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs leading-4 text-[var(--muted)]">{e.eyebrow}</span>
                <span className="block truncate">{e.title}</span>
                {e.from !== undefined && <span className="block text-xs leading-4 text-[var(--muted)]">from message {e.from}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Whether a key press belongs to the control that has focus rather than to the pager (a slider, a field, an open listbox). */
export const keepsOwnArrows = (target: EventTarget | null): boolean => target instanceof Element && !!target.closest(OWN_ARROWS);
