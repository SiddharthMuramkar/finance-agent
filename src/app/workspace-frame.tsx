import type { ReactNode } from "react";
import { SplitHandle } from "./split-handle";
import { SPLIT_DEFAULT, splitStyle } from "./split";

/**
 * The Study Workspace's frame, under the header: first the Topic bar (`bar`), a Band across the whole width above both
 * columns (spec 2026-11-12 F3), then two columns, the conversation on the left and, on the right, what stands above the
 * Widget panel (`top`: the pinned explore Widget and the folded review) over the Widget panel. The conversation takes the
 * Learner's share (`split`, from the `split` cookie; 45 % of the width the two columns share by default) and the Widget
 * panel the rest, with the Split handle's place between them (`.workspace-split` in globals.css; spec 2026-11-11, C2a).
 * Both columns are fixed to the space the page gives them (the viewport under the header and the bar); the chat and the
 * Widget panel scroll inside themselves while the bar stays put, so nothing in either column can make the page grow past
 * the viewport. It owns only the layout; what goes in each place comes from its parts.
 */
export function WorkspaceFrame({ left, bar = null, top, right, split = SPLIT_DEFAULT }: { left: ReactNode; bar?: ReactNode; top: ReactNode; right: ReactNode; split?: number }) {
  return (
    <>
      {bar}
      <div data-testid="workspace-frame" data-split-frame className="workspace-split min-h-0 flex-1 overflow-hidden pt-3" style={splitStyle(split)}>
        {left}
        <SplitHandle initial={split} />
        <div id="widget-column" data-testid="panel-column" className="flex min-h-0 min-w-0 flex-col gap-3">
          {top}
          {/* A size container named pane (#528), so a Widget's stage can grow with the panel's height (cqh, height queries).
              Its content is a column at least the panel's height, so the Widget card (flex-1) reaches the panel bottom. Its
              4 px of padding keeps room for the pager's and the thumbnails' focus rings inside this scroll box. */}
          <aside aria-label="Widget panel" data-testid="widget-pane" className="quiet-scroll @container-size/pane relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain px-1 pt-1 [scrollbar-gutter:stable]">
            <div data-testid="widget-pane-column" className="flex min-h-full flex-col">
              {right}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
