import type { ReactNode } from "react";

/**
 * How the thread draws a Session item (src/tutor/session-items.ts), by its kind. Items are display-only: they
 * sit between messages and are never sent to the model. A kind with no view here (one added by a later
 * change, or an old one removed) draws nothing, so it never breaks the thread. Later dividers and cards
 * plug in by adding their kind to VIEWS.
 */

export type SessionItemData = { kind: string; data: Record<string, unknown> };

/** A small centred line across the thread with a short label: "Step 3 of 9 · Your turn". */
function Divider({ label, testId }: { label: string; testId: string }) {
  return (
    <div role="separator" aria-label={label} data-testid={testId} className="flex items-center justify-center gap-3 py-1 text-xs leading-4 text-[var(--muted)]">
      <span aria-hidden className="h-px flex-1 bg-[var(--border)]" />
      <span>{label}</span>
      <span aria-hidden className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}

const VIEWS: Record<string, (data: Record<string, unknown>) => ReactNode> = {
  // Stored when the Learner moves onto a new Teaching Step.
  step: (data) => (typeof data.label === "string" ? <Divider label={data.label} testId="step-divider" /> : null),
};

/** The item drawn by its kind; nothing for a kind it does not know. */
export function SessionItemView({ item }: { item: SessionItemData }) {
  return VIEWS[item.kind]?.(item.data) ?? null;
}
