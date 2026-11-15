"use client";

// Stub for the site pages slice: the widgets slice ships the real RatesWidget. Dropped at merge.
export function RatesWidget({ caseSlug }: { caseSlug?: string }) {
  return <div data-testid="signal-widget" data-widget="rates" data-case={caseSlug} />;
}
