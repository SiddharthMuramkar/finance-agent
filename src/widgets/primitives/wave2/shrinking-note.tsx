"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { presentValue } from "@/finance/present-value";
import { trimmed } from "../wave1/format";
import { useChangeFlash, usePrefersReducedMotion } from "../wave1/motion";
import { money } from "./shared";

// ShrinkingNote: a note whose printed value stays put while its buying power shrinks inside it. The buying power
// is the note's amount discounted at the yearly price rise, by the tested present value formula.

export const shrinkingNoteProps = z.object({
  amount: z.number().describe("The printed value of the note"),
  ratePercent: z.number().describe("Yearly price rise in percent: a $variable bound to a Slider"),
  years: z.number().describe("Years from now: a $variable bound to a Slider"),
  currency: z.enum(["inr", "usd"]).optional(),
});

/** What the note still buys, in today's money, after `years` of price rises at `ratePercent`. */
export function buyingPower(amount: number, ratePercent: number, years: number): number {
  return presentValue(amount, ratePercent, years);
}

export function ShrinkingNoteView({ amount, ratePercent, years, currency }: z.infer<typeof shrinkingNoteProps>) {
  const reduced = usePrefersReducedMotion();
  const ok = [amount, ratePercent, years].every(Number.isFinite) && amount > 0;
  const power = ok ? buyingPower(amount, ratePercent, years) : 0;
  const share = ok ? Math.max(0, Math.min(1, power / amount)) : 0;
  const printed = money(amount, currency);
  const worth = money(power, currency);
  const fresh = useChangeFlash(worth, reduced);
  if (!ok) return <p className="py-2 text-sm text-[var(--muted)]">Working out what the note buys…</p>;
  const text = `The note still says ${printed}. In ${trimmed(years)} ${years === 1 ? "year" : "years"} at ${trimmed(ratePercent)}% a year it buys what ${worth} buys today.`;
  return (
    <figure data-testid="shrinking-note" data-motion={reduced ? "reduced" : "full"} data-share={trimmed(share, 4)} role="img" aria-label={text} className="@container my-3">
      <div className="relative h-24 max-w-sm overflow-hidden rounded-md border border-[var(--muted)] bg-[var(--field)] @min-[720px]:max-w-none">
        <div
          data-testid="shrinking-note-power"
          aria-hidden
          className="absolute inset-y-0 left-0 bg-[var(--data)]"
          style={{ width: `${share * 100}%`, transition: reduced ? undefined : "width 200ms var(--ease-out, ease-out)" }}
        />
        <div className="relative flex h-full items-center justify-between px-4">
          <span data-testid="shrinking-note-printed" className="text-3xl font-semibold tabular-nums">
            {printed}
          </span>
          <span className="text-xs text-[var(--muted)]">printed value</span>
        </div>
      </div>
      <figcaption className="mt-1 text-sm">
        Buys what{" "}
        <span
          data-testid="shrinking-note-worth"
          className="font-semibold tabular-nums"
          style={{ opacity: fresh ? 0.35 : 1, transition: reduced ? undefined : "opacity 160ms var(--ease-out, ease-out)" }}
        >
          {worth}
        </span>{" "}
        buys today.
      </figcaption>
      <p className="text-xs text-[var(--muted)]">The grey part is the buying power left. The number printed on the note never changes.</p>
    </figure>
  );
}

export const ShrinkingNote = defineComponent({
  name: "ShrinkingNote",
  description:
    "A note whose printed value stays the same while its buying power shrinks: ShrinkingNote(amount, ratePercent, years, currency?). ratePercent and years are $variables bound to Sliders; the buying power is worked out by code.",
  props: shrinkingNoteProps,
  component: ({ props }: ComponentRenderProps<z.infer<typeof shrinkingNoteProps>>) => <ShrinkingNoteView {...props} />,
});
