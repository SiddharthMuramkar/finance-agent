"use client";

// Stub for the site pages slice: the widgets slice ships the real JackpotWidget. Dropped at merge.
export function JackpotWidget({ caseSlug }: { caseSlug?: string }) {
  return <div data-testid="signal-widget" data-widget="jackpot" data-case={caseSlug} />;
}
