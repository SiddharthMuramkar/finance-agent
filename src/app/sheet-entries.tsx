"use client";

import { Chip } from "./ui";
import { CHECK_VIEW, EXPLORE_KEY, REVIEW_VIEW } from "./widget-panel";

/** One way into the phone's sheet from the conversation: the view it opens, and what the Learner reads on it. */
export type SheetEntry = { view: string; label: string };

/**
 * What the phone's sheet holds besides a Widget's chip (spec #68, #83): the open quiz Check (its tab's name, "Check 1 of
 * 2"), the Topic's explore Widget, and a due spaced Review. On a tablet or a laptop they stand in the right column already.
 */
export function sheetEntries({ check, explore, reviewDue }: { check?: string; explore: boolean; reviewDue: number }): SheetEntry[] {
  return [
    ...(check ? [{ view: CHECK_VIEW, label: check }] : []),
    ...(explore ? [{ view: EXPLORE_KEY, label: "Explore" }] : []),
    ...(reviewDue > 0 ? [{ view: REVIEW_VIEW, label: `Spaced review · ${reviewDue} due` }] : []),
  ];
}

/**
 * The entries as a row of chips above the message box, on a phone only (CSS, so first paint is right): pressing one slides
 * its view up in the full-screen sheet. Opening the sheet sends no turn (ADR 0012).
 */
export function SheetEntries({ entries, onOpen }: { entries: readonly SheetEntry[]; onOpen: (view: string) => void }) {
  if (!entries.length) return null;
  return (
    <div className="relative z-[1] mb-2 flex flex-wrap gap-2 md:hidden" aria-label="Open beside the conversation" role="group">
      {entries.map((e) => (
        <Chip key={e.view} data-testid="sheet-entry" data-view={e.view} onClick={() => onOpen(e.view)} className="min-h-10! text-sm!">
          {e.label} <span aria-hidden="true">→</span>
        </Chip>
      ))}
    </div>
  );
}
