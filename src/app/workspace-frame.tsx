import type { ReactNode } from "react";

/**
 * The Study Workspace's frame: two equal columns under the header, the conversation on the left and the
 * Widget panel on the right. It owns only the layout; what goes in each column comes from its parts.
 */
export function WorkspaceFrame({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)] items-start gap-6 lg:gap-8">
      {left}
      {/* Capped at the column, so the panel is never taller than the space under the header. */}
      <aside aria-label="Widget panel" data-testid="widget-pane" className="sticky top-6 max-h-[min(100%,calc(100dvh-48px))] min-w-0 overflow-y-auto">
        {right}
      </aside>
    </div>
  );
}
