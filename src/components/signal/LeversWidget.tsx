"use client";

// Stub for the site pages slice: the widgets slice ships the real LeversWidget. Dropped at merge.
export function LeversWidget({ caseSlug }: { caseSlug?: string }) {
  return <div data-testid="signal-widget" data-widget="levers" data-case={caseSlug} />;
}
