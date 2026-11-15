// What a page shows while its data loads (the loading.tsx of each route): the real header, so the nav never jumps,
// and hairline blocks where the content will be. No spinners for a whole page.

import type { ReactNode } from "react";
import { splitStyle } from "./split";
import { readSplit } from "./split-cookie";
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

/** A reading page's frame (Course Map, Notebook, Settings): same box, spacing and header as ReadingPage (the header flush at the top, the content 32px under it). */
export async function ReadingSkeleton({ current, children }: { current: HeaderPage; children: ReactNode }) {
  return (
    <main data-testid="route-skeleton" aria-busy="true" className="mx-auto w-full max-w-[var(--page-max)] px-[var(--gutter)] pb-16">
      <AppHeader current={current} />
      <div className="w-full space-y-6 pt-8">{children}</div>
    </main>
  );
}

/**
 * The Study Workspace's frame, as /study draws it: the header flush at the top, the Topic bar's empty Band across the
 * width (spec 2026-11-12 F3: about 76px, its height with a one-line goal), and two columns at the saved split (the
 * `split` cookie, spec 2026-11-11 C2a), the conversation left, the Split handle's empty place, and the Widget panel
 * right. The skeleton and the page then draw the same columns.
 */
export async function WorkspaceSkeleton() {
  return (
    <SignedInFrame>
      <main data-testid="route-skeleton" data-route="study" aria-busy="true" className="mx-auto flex h-dvh w-full max-w-[var(--page-max)] px-[var(--gutter)] flex-col overflow-hidden pb-3">
        <AppHeader current="workspace" />
        <div data-testid="topic-bar-skeleton" className="band -mx-[var(--gutter)] h-[76px] shrink-0" />
        <div className="workspace-split min-h-0 flex-1 overflow-hidden pt-3" style={splitStyle(await readSplit())}>
          <div className="flex min-h-0 flex-col gap-4">
            <SkeletonBlock className="h-8 w-1/2" />
            <SkeletonLines count={4} />
            <SkeletonBlock className="h-24 w-full" />
            <SkeletonLines count={3} />
            <div className="mt-auto">
              <SkeletonBlock className="h-14 w-full" />
            </div>
          </div>
          <div aria-hidden="true" />
          <div className="min-h-0 space-y-4">
            <SkeletonBlock className="h-8 w-1/3" />
            <SkeletonBlock className="h-48 w-full" />
            <SkeletonLines count={3} />
          </div>
        </div>
      </main>
    </SignedInFrame>
  );
}
