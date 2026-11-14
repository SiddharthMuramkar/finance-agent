"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/icons/icon";
import { CHECK_TAB_ICON, NO_KIND_ICON } from "@/icons/kinds";
import type { IconName } from "@/icons/names";
import { Button, IconButton } from "./ui";

/** One stop in the Widget panel's pager: a Widget (or the explore Widget), or the open quiz's Check. */
export type PagerEntry = {
  key: string;
  /** Its title (or "Check 1 of 2"). */
  title: string;
  /** Its kind Icon for its tab (A1b, A6): its archetype's Icon (`kindIconOf`). */
  icon?: IconName;
  /** The explore Widget: listed, but hidden from the strip below the laptop breakpoint (it stands in the conversation then). */
  explore?: boolean;
  /** The open quiz's Check. */
  check?: boolean;
};

const Chevron = ({ dir }: { dir: "left" | "right" }) => (
  <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d={dir === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"} />
  </svg>
);

/**
 * Where ‹ and › go from the entry showing (`current`), by key: the one before it (`prev`) and after it (`next`) in
 * `paged`, none past either end. From an entry they do not walk (the explore Widget below the laptop breakpoint)
 * › goes to the first and ‹ to the last. `at` is where `current` stands in `paged`, -1 when it is not there. The
 * panel's ← and → page by the same stops.
 */
export function pagerStops(paged: readonly PagerEntry[], current: string | undefined) {
  const at = paged.findIndex((e) => e.key === current);
  const stop = (step: -1 | 1) => paged[at < 0 ? (step > 0 ? 0 : paged.length - 1) : at + step]?.key;
  return { at, prev: stop(-1), next: stop(1) };
}

/** Keys that belong to the control that has focus, so ← and → must not page the panel from it (a slider, a field, the filmstrip). */
const OWN_ARROWS = "input, textarea, select, [role=slider], [role=listbox], [contenteditable=true], [data-filmstrip]";

/**
 * A text tab, like a header page link (spec 2026-11-11 A6): one line, a kind Icon, and a 2 px accent bar under the
 * current one, Highlight in forced colours. Focus is the 2 px ring. No border, no shadow, no inset line, no motion.
 */
const THUMB =
  "relative inline-flex h-8 max-w-56 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium leading-5 text-[var(--ink-2)] hover:bg-[var(--wash)] hover:text-[var(--ink)] aria-[current=true]:text-[var(--ink)] aria-[current=true]:after:absolute aria-[current=true]:after:inset-x-2.5 aria-[current=true]:after:bottom-0 aria-[current=true]:after:h-0.5 aria-[current=true]:after:bg-[var(--accent)] forced-colors:after:forced-color-adjust-none forced-colors:aria-[current=true]:after:bg-[Highlight] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

/** The current tab's mark (`aria-current`), which THUMB draws as its accent bar. */
const showing = (on: boolean) => ({ "aria-current": on || undefined }) as const;

/**
 * The Widget panel's header: ‹ and › (32px) and "3 of 11 · <title>", then a row of text tabs, one per Widget in this
 * Session, oldest first, each with its kind Icon at 16 px and one line of its title. The current tab carries
 * `aria-current` and a 2 px accent bar along its bottom,
 * which is not the focus outline, since ← and → move focus without selecting; the strip scrolls inside itself,
 * never the page. Tab enters the strip once (roving tabindex), ← and → move focus, and Enter opens. "Back to
 * latest" stands beside the strip whenever a Widget other than the latest is showing. The open quiz's Check
 * keeps its own first button in the strip (`check-tab`), as before. `paged` is the entries ‹ and › walk
 * through (the explore Widget is left out below the laptop breakpoint, and hidden there in the strip too).
 */
export function WidgetPager({
  entries,
  paged,
  current,
  latest,
  onSelect,
}: {
  entries: readonly PagerEntry[];
  paged: readonly PagerEntry[];
  current: string | undefined;
  /** The newest Widget's key: what "Back to latest" returns to. */
  latest?: string;
  onSelect: (key: string) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const { at, prev, next } = pagerStops(paged, current);
  const now = entries.find((e) => e.key === current);

  // Roving tabindex: the tab that Tab lands on. It follows the showing Widget, and the arrow keys move it.
  const [cursor, setCursorState] = useState<{ current: string | undefined; key: string | undefined }>({ current, key: current });
  if (cursor.current !== current) setCursorState({ current, key: current });
  const setCursor = (key: string) => setCursorState({ current, key });
  const tabbable = entries.some((e) => e.key === cursor.key) ? cursor.key : (current ?? entries[0]?.key);

  const thumbs = () => [...(strip.current?.querySelectorAll<HTMLElement>("[data-thumb-key]") ?? [])].filter((b) => getComputedStyle(b).display !== "none");

  // Keep the showing Widget's tab in view inside the strip (the strip scrolls, never the page).
  useEffect(() => {
    const el = thumbs().find((b) => b.dataset.thumbKey === current);
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [current]);

  const onStripKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = thumbs();
    const focused = buttons.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const to = buttons[Math.min(buttons.length - 1, Math.max(0, focused + (e.key === "ArrowRight" ? 1 : -1)))];
      if (to?.dataset.thumbKey) {
        setCursor(to.dataset.thumbKey);
        to.focus();
      }
    } else if (e.key === "Enter" && focused >= 0) {
      e.preventDefault();
      const key = buttons[focused].dataset.thumbKey;
      if (key) onSelect(key);
    }
  };

  const backToLatest = !!latest && !!current && current !== latest && !now?.check;

  return (
    <div className="relative mb-4" role="group" aria-label="Widgets in this Session" data-testid="widget-pager">
      <div className="flex items-center gap-1">
        <IconButton label="Previous widget" onClick={() => prev && onSelect(prev)} disabled={at >= 0 && !prev} data-testid="pager-prev">
          <Chevron dir="left" />
        </IconButton>
        <p className="min-w-0 flex-1 truncate text-center text-[13px] leading-[18px]" aria-live="polite" data-testid="pager-position" title={now?.title}>
          {at >= 0 && (
            <span className="text-[var(--muted)]">
              {at + 1} of {paged.length} ·{" "}
            </span>
          )}
          <span className="font-medium">{now?.title}</span>
        </p>
        <IconButton label="Next widget" onClick={() => next && onSelect(next)} disabled={at >= 0 && !next} data-testid="pager-next">
          <Chevron dir="right" />
        </IconButton>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div ref={strip} data-testid="widget-filmstrip" data-filmstrip onKeyDown={onStripKey} className="quiet-scroll -mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 py-1">
          {entries.map((e) => {
            const selected = e.key === current;
            return (
              <Button
                unstyled
                key={e.key}
                data-affordance="nav"
                data-testid={e.check ? "check-tab" : e.explore ? "explore-chip" : "filmstrip-thumb"}
                data-thumb-key={e.key}
                {...showing(selected)}
                tabIndex={e.key === tabbable ? 0 : -1}
                title={e.title}
                onClick={() => onSelect(e.key)}
                onFocus={() => setCursor(e.key)}
                className={`${THUMB}${e.explore ? " max-lg:hidden" : ""}`}
              >
                <Icon name={e.icon ?? (e.check ? CHECK_TAB_ICON : NO_KIND_ICON)} size={16} className="shrink-0" />
                <span className="min-w-0 truncate">{e.title}</span>
              </Button>
            );
          })}
        </div>
        {backToLatest && (
          <Button variant="tertiary" size="sm" data-testid="back-to-latest" onClick={() => latest && onSelect(latest)} className="shrink-0">
            Back to latest
          </Button>
        )}
      </div>
    </div>
  );
}

/** Whether a key press belongs to the control that has focus rather than to the pager (a slider, a field, the filmstrip). */
export const keepsOwnArrows = (target: EventTarget | null): boolean => target instanceof Element && !!target.closest(OWN_ARROWS);
