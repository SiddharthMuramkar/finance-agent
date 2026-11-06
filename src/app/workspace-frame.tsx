import type { ReactNode } from "react";

/**
 * The Study Workspace's frame: two columns under the header (chat 2fr, Widget panel 3fr of the space inside the page gutters), the conversation on the left and, on the right,
 * the Topic bar (`top`) over the Widget panel. Both columns are fixed to the space the page gives them (the viewport
 * under the header); the chat and the Widget panel scroll inside themselves while the Topic bar stays put, so nothing
 * in either column can make the page grow past the viewport. It owns only the layout; what goes in each column comes
 * from its parts.
 */
export function WorkspaceFrame({ left, top, right }: { left: ReactNode; top: ReactNode; right: ReactNode }) {
  return (
    <div data-testid="workspace-frame" className="grid min-h-0 flex-1 grid-cols-[minmax(360px,2fr)_minmax(0,3fr)] grid-rows-[minmax(0,1fr)] gap-[var(--gap)] overflow-hidden pt-3">
      {left}
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        {top}
        {/* A size container named pane (#528), so a Widget's stage can grow with the panel's height (cqh, height queries).
            Its content is a column at least the panel's height, so the Widget card (flex-1) reaches the panel bottom. */}
        <aside aria-label="Widget panel" data-testid="widget-pane" className="quiet-scroll @container-size/pane relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain [scrollbar-gutter:stable]">
          <div data-testid="widget-pane-column" className="flex min-h-full flex-col">
            {right}
          </div>
        </aside>
      </div>
    </div>
  );
}
