"use client";

import { useRef, type ReactNode } from "react";
import { useModalSheet } from "./modal-sheet";
import { Button } from "./primitives/button";
import { SplitHandle } from "./split-handle";
import { SPLIT_DEFAULT, splitStyle } from "./split";
import { useScreen } from "./widget-panel";

/**
 * The Study Workspace's frame, under the header: first the Topic bar (`bar`), a Band across the whole width above both
 * columns (spec 2026-11-12 F3), then two columns, the conversation on the left and, on the right, what stands above the
 * Widget panel (`top`: the pinned explore Widget and the folded review) over the Widget panel. The conversation takes the
 * Learner's share (`split`, from the `split` cookie; 45 % of the width the two columns share by default) and the Widget
 * panel the rest, with the Split handle's place between them (`.workspace-split` in globals.css; spec 2026-11-11, C2a).
 * Both columns are fixed to the space the page gives them (the viewport under the header and the bar); the chat and the
 * Widget panel scroll inside themselves while the bar stays put, so nothing in either column can make the page grow past
 * the viewport. It owns only the layout; what goes in each place comes from its parts.
 *
 * On a phone (below 768 px, CSS so the first paint is right; spec #68, #82) the conversation fills the screen and the right
 * column is a full-screen sheet that slides up while `open` (a Widget's chip opened it) and waits below the screen
 * otherwise. Both stay mounted, so the thread keeps its scroll and the Widget its state; the sheet's own Back button calls
 * `onClose`. While it is up the sheet is a modal dialog (useModalSheet): the conversation and the header behind it are
 * inert, focus moves to its Back button, Escape closes it, and focus returns to the chip that opened it. Tablets and
 * laptops ignore `open`: the two columns are as they were.
 */
export function WorkspaceFrame({
  left,
  bar = null,
  top,
  right,
  split = SPLIT_DEFAULT,
  open = false,
  view,
  onClose,
  testId = "workspace-frame",
}: {
  left: ReactNode;
  bar?: ReactNode;
  top: ReactNode;
  right: ReactNode;
  split?: number;
  /** Whether a phone's sheet is up (the open view of useWidgetHost). */
  open?: boolean;
  /**
   * What the sheet shows (useWidgetHost's view). On a phone the explore Widget and a spaced Review fill the sheet from
   * `top` (#83), and the Widget panel steps aside; for a Widget or the Check, `top` steps aside instead.
   */
  view?: string;
  /** The sheet's Back button (on a phone, through the Back history: useWidgetHost's `close`). */
  onClose?: () => void;
  /** The frame's test id: an old Session's page (old-session.tsx) uses the same frame under its own name. */
  testId?: string;
}) {
  const sheet = open
    ? "max-md:visible max-md:translate-y-0"
    : "max-md:invisible max-md:translate-y-full";
  const column = useRef<HTMLDivElement>(null);
  const phone = useScreen() === "phone";
  const modal = open && phone;
  useModalSheet(column, modal, onClose);
  return (
    <>
      {bar}
      <div data-testid={testId} data-split-frame className="workspace-split min-h-0 flex-1 overflow-hidden pt-3" style={splitStyle(split)}>
        {left}
        <SplitHandle initial={split} />
        <div
          ref={column}
          id="widget-column"
          role={modal ? "dialog" : undefined}
          aria-modal={modal || undefined}
          aria-label={modal ? "Widget sheet" : undefined}
          data-testid="panel-column"
          data-open={open || undefined}
          data-view={view}
          className={`group/sheet flex min-h-0 min-w-0 flex-col gap-3 max-md:fixed max-md:inset-0 max-md:z-40 max-md:h-dvh max-md:bg-[var(--paper)] max-md:px-[var(--gutter)] max-md:pb-3 max-md:pt-2 max-md:transition-[translate,visibility] max-md:duration-200 motion-reduce:transition-none ${sheet}`}
        >
          {/* A phone's way back to the conversation (the browser's Back does the same); hidden on tablets and laptops. */}
          <div className="shrink-0 md:hidden">
            <Button variant="tertiary" size="sm" onClick={onClose} data-sheet-start>
              <span aria-hidden="true">←</span> Back to the conversation
            </Button>
          </div>
          {top}
          {/* A size container named pane (#528), so a Widget's stage can grow with the panel's height (cqh, height queries).
              Its content is a column at least the panel's height, so the Widget card (flex-1) reaches the panel bottom. Its
              4 px of padding keeps room for the pager's and the thumbnails' focus rings inside this scroll box. */}
          <aside aria-label="Widget panel" data-testid="widget-pane" className="quiet-scroll @container-size/pane max-md:group-data-[view=explore]/sheet:hidden max-md:group-data-[view=review]/sheet:hidden relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain px-1 pt-1 [scrollbar-gutter:stable]">
            <div data-testid="widget-pane-column" className="flex min-h-full flex-col">
              {right}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
