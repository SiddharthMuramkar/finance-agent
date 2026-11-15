"use client";

// Stub for the site pages slice: the widgets slice ships the real CompoundWidget. Dropped at merge.
export function CompoundWidget({ caseSlug }: { caseSlug?: string }) {
  return <div data-testid="signal-widget" data-widget="compound" data-case={caseSlug} />;
}
