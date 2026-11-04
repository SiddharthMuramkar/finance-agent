"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { inflationAdjusted } from "@/finance/tvm";
import { trimmed } from "../wave1/format";
import { useChangeFlash, usePrefersReducedMotion } from "../wave1/motion";
import { money } from "./shared";

// PriceTag: the price of one thing, ticking up as the years pass. Today's tag stays beside it, faint, so the
// rise is something the Learner sees. The later price is worked out by code (the tested inflation formula).

export const priceTagProps = z.object({
  item: z.string().describe('What is being priced, e.g. "Vada pav"'),
  price: z.number().describe("Today's price"),
  ratePercent: z.number().describe("Yearly price rise in percent: a $variable bound to a Slider"),
  years: z.number().describe("Years from now: a $variable bound to a Slider"),
  currency: z.enum(["inr", "usd"]).optional(),
});

/** The price after `years` of yearly rises of `ratePercent`. */
export function futurePrice(price: number, ratePercent: number, years: number): number {
  return inflationAdjusted(price, ratePercent, years);
}

function Tag({ label, value, faint, testId }: { label: string; value: string; faint?: boolean; testId: string }) {
  const reduced = usePrefersReducedMotion();
  const fresh = useChangeFlash(value, reduced);
  return (
    <div
      data-testid={testId}
      className="relative rounded-md border px-4 py-2 text-center"
      style={{ borderColor: faint ? "var(--border)" : "var(--ink)", opacity: faint ? 0.6 : 1 }}
    >
      <span aria-hidden className="absolute left-2 top-1/2 size-1.5 -translate-y-1/2 rounded-full border border-[var(--muted)]" />
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div
        data-testid={`${testId}-value`}
        className="text-xl font-semibold tabular-nums"
        style={{ opacity: fresh ? 0.35 : 1, transition: reduced ? undefined : "opacity 160ms var(--ease-out, ease-out)" }}
      >
        {value}
      </div>
    </div>
  );
}

export function PriceTagView({ item, price, ratePercent, years, currency }: z.infer<typeof priceTagProps>) {
  const reduced = usePrefersReducedMotion();
  if (![price, ratePercent, years].every(Number.isFinite)) return <p className="py-2 text-sm text-[var(--muted)]">Working out the price…</p>;
  const later = futurePrice(price, ratePercent, years);
  const now = money(price, currency);
  const then = money(later, currency);
  const rise = price ? (later / price - 1) * 100 : 0;
  const span = `${trimmed(years)} ${years === 1 ? "year" : "years"}`;
  const text = `${item}: ${now} today, ${then} in ${span} at ${trimmed(ratePercent)}% a year.`;
  return (
    <figure data-testid="price-tag" data-motion={reduced ? "reduced" : "full"} role="img" aria-label={text} className="my-3">
      <figcaption className="mb-1 text-sm font-medium">{item}</figcaption>
      <div className="flex flex-wrap items-center gap-3">
        <Tag label="Today" value={now} faint testId="price-tag-now" />
        <span aria-hidden className="text-[var(--muted)]">
          →
        </span>
        <Tag label={`In ${span}`} value={then} testId="price-tag-later" />
      </div>
      <p data-testid="price-tag-caption" className="mt-1 text-xs text-[var(--muted)]">
        {rise >= 0 ? "Up" : "Down"} {trimmed(Math.abs(rise), 1)}% at {trimmed(ratePercent)}% a year.
      </p>
    </figure>
  );
}

export const PriceTag = defineComponent({
  name: "PriceTag",
  description:
    "The price of one thing ticking up with the years: PriceTag(item, price, ratePercent, years, currency?). ratePercent and years are $variables bound to Sliders; the later price is worked out by code. Pair it with ShrinkingNote for inflation.",
  props: priceTagProps,
  component: ({ props }: ComponentRenderProps<z.infer<typeof priceTagProps>>) => <PriceTagView {...props} />,
});
