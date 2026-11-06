"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Emoji } from "@/emoji/emoji";
import type { EmojiName } from "@/emoji/registry";
import { Button, IconButton } from "./ui";

/** One stop in the Widget panel's pager: a Widget (or the explore Widget), or the open quiz's Check. */
export type PagerEntry = {
  key: string;
  /** Its title (or "Check 1 of 2"). */
  title: string;
  /** What it shows: the concept eyebrow ("Case Data", "Explore"), or "Quiz". */
  eyebrow: string;
  /** Its lead emoji for the filmstrip thumbnail (E5): the first emoji in its params, else its archetype's. */
  emoji?: EmojiName;
  /** The number of the conversation message it came from, when known. */
  from?: number;
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

/** Keys that belong to the control that has focus, so ← and → must not page the panel from it (a slider, a field, the filmstrip). */
const OWN_ARROWS = "input, textarea, select, [role=slider], [role=listbox], [contenteditable=true], [data-filmstrip]";

/**
 * The Widget panel's header: ‹ and › (32px) and "3 of 11 · <title>", then the filmstrip (E5): a row of 96×64
 * thumbnails, one per Widget in this Session, oldest first, each with its lead emoji at 24px and two lines of
 * its title. The current thumbnail carries `aria-current` and the B.2 showing face (brand tint, brand rim and lip),
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
  const at = paged.findIndex((e) => e.key === current);
  const now = entries.find((e) => e.key === current);
  const go = (to: number) => {
    const target = paged[to];
    if (target) onSelect(target.key);
  };
  const prev = at < 0 ? paged.length - 1 : at - 1;
  const next = at < 0 ? 0 : at + 1;

  // Roving tabindex: the thumbnail Tab lands on. It follows the showing Widget, and the arrow keys move it.
  const [cursor, setCursorState] = useState<{ current: string | undefined; key: string | undefined }>({ current, key: current });
  if (cursor.current !== current) setCursorState({ current, key: current });
  const setCursor = (key: string) => setCursorState({ current, key });
  const tabbable = entries.some((e) => e.key === cursor.key) ? cursor.key : (current ?? entries[0]?.key);

  const thumbs = () => [...(strip.current?.querySelectorAll<HTMLElement>("[data-thumb-key]") ?? [])].filter((b) => getComputedStyle(b).display !== "none");

  // Keep the showing Widget's thumbnail in view inside the strip (the strip scrolls, never the page).
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
    <div className="relative mb-3" role="group" aria-label="Widgets in this Session" data-testid="widget-pager">
      <div className="flex items-center gap-1">
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
      </div>
      <div className="mt-2 flex items-start gap-2">
        <div ref={strip} data-testid="widget-filmstrip" data-filmstrip onKeyDown={onStripKey} className="quiet-scroll flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {entries.map((e) => {
            const selected = e.key === current;
            return (
              <Button
                key={e.key}
                variant="secondary"
                size="sm"
                data-testid={e.check ? "check-tab" : e.explore ? "explore-chip" : "filmstrip-thumb"}
                data-thumb-key={e.key}
                aria-current={selected || undefined}
                tabIndex={e.key === tabbable ? 0 : -1}
                title={e.title}
                onClick={() => onSelect(e.key)}
                onFocus={() => setCursor(e.key)}
                className={`h-16! w-24! shrink-0 flex-col! items-center! justify-center! gap-0.5! px-1! py-1! ${e.explore ? "max-lg:hidden" : ""}`}
              >
                <Emoji name={e.emoji ?? (e.check ? "check-mark-button" : "sparkles")} size={24} />
                <span className="line-clamp-2 w-full overflow-hidden text-center text-[11px] leading-[14px] font-normal">{e.title}</span>
              </Button>
            );
          })}
        </div>
        {backToLatest && (
          <Button variant="secondary" size="sm" data-testid="back-to-latest" onClick={() => latest && onSelect(latest)} className="mt-1 shrink-0">
            Back to latest
          </Button>
        )}
      </div>
    </div>
  );
}

/** Whether a key press belongs to the control that has focus rather than to the pager (a slider, a field, the filmstrip). */
export const keepsOwnArrows = (target: EventTarget | null): boolean => target instanceof Element && !!target.closest(OWN_ARROWS);
