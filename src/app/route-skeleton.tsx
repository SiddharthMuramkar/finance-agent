// What a page shows while its data loads (the loading.tsx of each route): the real header, so the nav never jumps,
// and hairline blocks where the content will be. No spinners for a whole page.

import type { ReactNode } from "react";
import { readTheme } from "./theme-cookie";
import { AppHeader, SignedInFrame, type HeaderPage } from "./ui";

/** One hairline block. className sizes it. */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

/** Lines of text-shaped blocks, the last one shorter. */
export function SkeletonLines({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock key={i} className={`h-4 ${i === count - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/** A reading page's frame (Course Map, Progress, Past Sessions, Notes, Settings): same box and header as ReadingPage. */
export async function ReadingSkeleton({ current, children }: { current: HeaderPage; children: ReactNode }) {
  return (
    <main data-testid="route-skeleton" aria-busy="true" className="mx-auto w-full max-w-[var(--page-max)] px-[var(--gutter)] pb-12 pt-3">
      <AppHeader current={current} theme={await readTheme()} />
      <div className="w-full space-y-6 pt-3">{children}</div>
    </main>
  );
}

/** The Study Workspace's frame: the header and two columns, the conversation left and the Topic bar over the Widget panel right. */
export async function WorkspaceSkeleton() {
  return (
    <SignedInFrame>
      <main data-testid="route-skeleton" data-route="study" aria-busy="true" className="mx-auto flex h-dvh w-full max-w-[var(--page-max)] px-[var(--gutter)] flex-col overflow-hidden pb-3 pt-3">
        <AppHeader current="workspace" theme={await readTheme()} />
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,2fr)_minmax(0,3fr)] grid-rows-[minmax(0,1fr)] gap-[var(--gap)] overflow-hidden pt-3">
          <div className="flex min-h-0 flex-col gap-4">
            <SkeletonBlock className="h-8 w-1/2" />
            <SkeletonLines count={4} />
            <SkeletonBlock className="h-24 w-full" />
            <SkeletonLines count={3} />
            <div className="mt-auto">
              <SkeletonBlock className="h-14 w-full" />
            </div>
          </div>
          <div className="min-h-0 space-y-4">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-8 w-1/3" />
            <SkeletonBlock className="h-48 w-full" />
            <SkeletonLines count={3} />
          </div>
        </div>
      </main>
    </SignedInFrame>
  );
}
