"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { useState } from "react";
import { z } from "zod/v4";
import { trimmed } from "./format";
import { usePrefersReducedMotion } from "./motion";

// Waffle: percent, percentage points and basis points as squares. 100 squares are the whole; `percent` of them
// are filled (the last one partly). `compareTo` is drawn as outlines and the difference is picked out dark, so
// 3% to 3.25% is seen to be a quarter of one square. No navy: the chart greys only.

export const waffleProps = z.object({
  label: z.string(),
  percent: z.number().describe("0 to 100: from a Slider's $variable or a calculator"),
  compareTo: z.number().optional().describe("The other percent, drawn as outlines; the difference is highlighted"),
  zoom: z.boolean().optional().describe('true adds "Zoom into one square": one square opened into its own 10 x 10 (100 basis points)'),
});

/** The caption code writes: "3% → 3.25%: +0.25 percentage points = +25 basis points = +8.3% relative." */
export function waffleCaption(percent: number, compareTo?: number): string {
  if (compareTo === undefined || !Number.isFinite(compareTo)) return `${trimmed(percent)}% of the whole = ${trimmed(percent * 100, 0)} basis points.`;
  const diff = percent - compareTo;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  const head = `${trimmed(compareTo)}% → ${trimmed(percent)}%:`;
  if (diff === 0) return `${head} no change.`;
  const relative = compareTo === 0 ? "" : ` = ${sign}${trimmed(Math.abs((diff / compareTo) * 100), 1)}% relative`;
  return `${head} ${sign}${trimmed(Math.abs(diff))} percentage points = ${sign}${trimmed(Math.abs(diff) * 100, 1)} basis points${relative}.`;
}

type Look = "filled" | "outline" | "change" | "empty";

/** How one square looks: filled, outlined only (in the comparison), the changed part, or empty. `part` is how much of it (0 to 1) is lit. */
function squareLook(index: number, percent: number, compareTo: number | undefined): { look: Look; part: number } {
  const lit = (p: number) => Math.min(1, Math.max(0, p - index));
  const now = lit(percent);
  if (compareTo === undefined) return now > 0 ? { look: "filled", part: now } : { look: "empty", part: 0 };
  const before = lit(compareTo);
  if (now === before) return before > 0 ? { look: "filled", part: now } : { look: "empty", part: 0 };
  // Between the two, the square holds the change; the smaller of the two is the steady part.
  return { look: now < before ? "outline" : "change", part: Math.abs(now - before) };
}

function Square({ look, part, startsAt, testId }: { look: Look; part: number; startsAt?: number; testId: string }) {
  const background = look === "filled" ? "var(--muted)" : look === "change" ? "var(--ink)" : "transparent";
  return (
    <span data-testid={testId} data-look={look} data-part={trimmed(part, 3)} className="relative block aspect-square overflow-hidden rounded-[2px] border border-[var(--border)] bg-[var(--field)]">
      {part > 0 && look !== "empty" && (
        <span
          className="absolute inset-y-0 block"
          style={{ left: `${(startsAt ?? 0) * 100}%`, width: `${part * 100}%`, background, border: look === "outline" ? "1px dashed var(--muted)" : undefined }}
        />
      )}
    </span>
  );
}

export function WaffleView({ label, percent, compareTo, zoom = false }: z.infer<typeof waffleProps>) {
  const reduced = usePrefersReducedMotion();
  const [zoomed, setZoomed] = useState(false);
  if (!Number.isFinite(percent)) return <p className="py-2 text-sm text-[var(--muted)]">Working out the grid…</p>;
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const now = clamp(percent);
  const before = compareTo !== undefined && Number.isFinite(compareTo) ? clamp(compareTo) : undefined;
  const caption = waffleCaption(percent, compareTo);
  // The zoom opens the square where the change (or the last partly filled square) is.
  const focusIndex = Math.min(99, Math.floor(before === undefined ? now : Math.min(now, before)));
  const lo = before === undefined ? Math.floor(now) : Math.min(now, before);
  const hi = before === undefined ? now : Math.max(now, before);
  const zoomStart = Math.max(0, lo - focusIndex);
  const zoomEnd = Math.min(1, hi - focusIndex);
  const zoomLit = (i: number) => {
    const cell = i / 100;
    const end = (i + 1) / 100;
    const inside = Math.max(0, Math.min(end, zoomEnd) - Math.max(cell, zoomStart)) * 100;
    return inside;
  };

  return (
    <figure data-testid="waffle" data-motion={reduced ? "reduced" : "full"} role="img" aria-label={`${label}. ${caption}`} className="my-3">
      <figcaption className="mb-1 text-sm font-medium">{label}</figcaption>
      <div className="grid max-w-72 grid-cols-10 gap-0.5" data-testid="waffle-grid">
        {Array.from({ length: 100 }, (_, i) => {
          const { look, part } = squareLook(i, now, before);
          return <Square key={i} look={look} part={part} startsAt={look === "change" ? Math.min(1, Math.max(0, Math.min(now, before ?? now) - i)) : 0} testId="waffle-square" />;
        })}
      </div>
      <p data-testid="waffle-caption" className="mt-1 text-xs text-[var(--muted)]">
        {caption}
      </p>
      {zoom && (
        <div className="mt-2">
          <button
            type="button"
            aria-expanded={zoomed}
            onClick={() => setZoomed((z) => !z)}
            className="min-h-8 rounded border border-[var(--border)] px-3 text-xs hover:bg-[var(--field)]"
          >
            {zoomed ? "Close the zoom" : "Zoom into one square"}
          </button>
          {zoomed && (
            <div className="mt-2" data-testid="waffle-zoom">
              <div className="grid max-w-48 grid-cols-10 gap-px" aria-hidden>
                {Array.from({ length: 100 }, (_, i) => {
                  const lit = zoomLit(i);
                  return <Square key={i} look={lit > 0 ? (before === undefined ? "filled" : now < before ? "outline" : "change") : "empty"} part={lit > 0 ? 1 : 0} testId="waffle-zoom-square" />;
                })}
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">One square is 1 percentage point, which is 100 basis points. Each small square here is 1 basis point.</p>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

export const Waffle = defineComponent({
  name: "Waffle",
  description:
    "A 10 x 10 grid for percent, percentage points and basis points: Waffle(label, percent, compareTo?, zoom?). compareTo draws the other percent as outlines and highlights the difference; zoom adds a zoom into one square (100 basis points). The caption is built by code. For percent vs points vs basis points, use Waffle.",
  props: waffleProps,
  component: ({ props }: ComponentRenderProps<z.infer<typeof waffleProps>>) => <WaffleView {...props} />,
});
