"use client";

// Stub for the site pages slice: the widgets slice ships the real WeWorkWidget. Dropped at merge.
export function WeWorkWidget({ caseSlug }: { caseSlug?: string }) {
  return <div data-testid="signal-widget" data-widget="wework" data-case={caseSlug} />;
}
