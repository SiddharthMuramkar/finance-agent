import type { ReactNode } from "react";

/**
 * The Study Workspace's frame: two equal columns under the header, the conversation on the left and the
 * Widget panel on the right. Both are fixed to the space the page gives them (the viewport under the header)
 * and scroll inside themselves, so nothing in either column can make the page grow past the viewport. It owns
 * only the layout; what goes in each column comes from its parts.
 */
export function WorkspaceFrame({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div data-testid="workspace-frame" className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)] gap-6 overflow-hidden lg:gap-8">
      {left}
      <aside aria-label="Widget panel" data-testid="widget-pane" className="quiet-scroll relative min-h-0 min-w-0 overflow-y-auto overflow-x-clip overscroll-contain [scrollbar-gutter:stable]">
        {right}
      </aside>
    </div>
  );
}
