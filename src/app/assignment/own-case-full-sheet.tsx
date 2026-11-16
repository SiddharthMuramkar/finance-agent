"use client";

import { useMemo, useState } from "react";
import { Chevron } from "@/app/ui";
import type { OwnCaseEstimate, OwnCaseInputs } from "@/finance/own-case";
import { NO_ROW_CHANGES, rowSpecs, type RowId, type RowSettings } from "@/widgets/workbench/full-sheet";
import { ownCaseSheet } from "@/widgets/workbench/own-case-sheet";
import { priceText } from "@/widgets/workbench/value-levers-model";
import { FullSheetRowView, RowSlider } from "@/widgets/workbench/value-levers-view";

/**
 * Go deeper on an Own Case (spec #68, ticket #111): the Full sheet with every input of the Own Case, each saying where it
 * came from: typed from the report, the industry's yardstick, a default, or the Learner's Estimate. A row that can change
 * has #104's slider with tap buttons, never a typed number (ADR 0020); a change revalues the Own Case through the engine.
 */
export function OwnCaseFullSheet({ inputs, estimate }: { inputs: OwnCaseInputs; estimate: OwnCaseEstimate }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<RowSettings>(NO_ROW_CHANGES);
  const sheet = useMemo(() => (open ? ownCaseSheet(inputs, estimate, rows) : null), [open, inputs, estimate, rows]);
  const block = sheet?.ok ? sheet.block : null;
  const sliders = useMemo(() => (block ? new Map(rowSpecs(block).map((s) => [s.id as string, s])) : null), [block]);
  const change = (id: RowId, by: number) => setRows((all) => ({ ...all, [id]: by }));
  return (
    <details className="group border-t border-[var(--hairline)] pt-1" data-testid="own-case-go-deeper" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm text-[var(--ink-2)] [&::-webkit-details-marker]:hidden">
        <Chevron />
        Go deeper: the Full sheet
      </summary>
      {sheet && !sheet.ok && <p className="text-sm text-[var(--muted)]">{sheet.error}</p>}
      {sheet?.ok && (
        <>
          <p data-testid="own-case-sheet-value" role="status" className="text-sm font-semibold leading-5">
            The engine&rsquo;s value with these rows: {priceText(sheet.valuePerShare, sheet.block)} a share.
          </p>
          <ul className="mb-2 text-sm" data-testid="full-sheet" aria-label="Every input of your Own Case">
            {sheet.rows.map((row) => (
              <FullSheetRowView key={row.input} row={row}>
                <p data-origin={row.origins.join(" ")} className="-mt-1 pb-1 text-xs leading-4 text-[var(--muted)]">
                  {row.originWords}
                </p>
                {sliders?.has(row.input) && <RowSlider spec={sliders.get(row.input)!} change={rows[row.input as RowId]} onChange={change} />}
              </FullSheetRowView>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
