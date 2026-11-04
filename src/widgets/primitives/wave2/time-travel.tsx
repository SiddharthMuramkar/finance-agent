"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { useId, useState } from "react";
import { z } from "zod/v4";
import { annuityPaymentCount, presentValue } from "@/finance/present-value";
import { trimmed } from "../wave1/format";
import { Icon } from "../wave1/icons";
import { usePrefersReducedMotion } from "../wave1/motion";
import { toneInk } from "../wave1/tones";
import { money } from "./shared";

// TimeTravel: present value as a physical journey. Drag a coin from today to year 30 and watch it shrink. With
// `payments`, a row of coins is the annuity: each coin is a payment, drawn at the size it is worth today, and the
// slider brings them to today, where they stack up. Every value is the tested present value formula.

export const timeTravelProps = z.object({
  amount: z.number().describe("The coin: what is paid (the first payment, with payments)"),
  ratePercent: z.number().describe("The discount rate in percent a year"),
  maxYears: z.number().describe("How far the slider travels, in years"),
  payments: z.number().optional().describe("How many yearly payments; the first is paid now. Left out: one coin"),
  growthPercent: z.number().optional().describe("How much each payment grows on the one before, in percent"),
  currency: z.enum(["inr", "usd"]).optional(),
});

const MIN_COIN = 14;
const MAX_COIN = 40;

/** The coin's diameter for the share of its face value it is still worth. */
export function coinSize(share: number): number {
  const s = Number.isFinite(share) ? Math.max(0, Math.min(1, share)) : 1;
  return Math.round(MIN_COIN + (MAX_COIN - MIN_COIN) * s);
}

export type Payment = { year: number; payment: number; worth: number };

/** Each yearly payment, and what it is worth today. The first is paid now and grows by `growthPercent` after that. */
export function paymentRows(amount: number, ratePercent: number, count: number, growthPercent = 0): Payment[] {
  return Array.from({ length: annuityPaymentCount(count) }, (_, year) => {
    const payment = amount * (1 + growthPercent / 100) ** year;
    return { year, payment, worth: presentValue(payment, ratePercent, year) };
  });
}

export function TimeTravelView({ amount, ratePercent, maxYears, payments, growthPercent, currency }: z.infer<typeof timeTravelProps>) {
  const id = useId();
  const reduced = usePrefersReducedMotion();
  const [position, setPosition] = useState(0);
  const many = payments !== undefined && Number.isFinite(payments) && payments > 1;
  const rows = many ? paymentRows(amount, ratePercent, payments, growthPercent ?? 0) : [];
  const top = many ? rows.length : Math.max(1, Math.round(maxYears));
  const at = Math.min(top, Math.max(0, position));
  if (![amount, ratePercent, maxYears].every(Number.isFinite)) return <p className="py-2 text-sm text-[var(--muted)]">Working out the journey…</p>;

  const transition = reduced ? undefined : "width 200ms var(--ease-out, ease-out), height 200ms var(--ease-out, ease-out)";
  const label = many ? "Payments brought to today" : "Years the coin travels";
  const slider = (
    <input
      id={`${id}-slider`}
      type="range"
      min={0}
      max={top}
      step={1}
      value={at}
      onChange={(e) => setPosition(Number(e.target.value))}
      aria-valuetext={many ? `${at} of ${top} payments brought to today` : at === 0 ? "Today" : `Year ${at}`}
      className="w-full accent-[var(--brand)]"
    />
  );

  if (!many) {
    const worth = presentValue(amount, ratePercent, at);
    const size = coinSize(amount ? worth / amount : 1);
    return (
      <div data-testid="time-travel" data-mode="coin" data-motion={reduced ? "reduced" : "full"} className="my-3">
        <label htmlFor={`${id}-slider`} className="text-sm font-medium">
          {label}
        </label>
        <div className="flex items-end justify-between gap-3 py-2" style={{ minHeight: MAX_COIN + 8 }}>
          <span className="text-xs text-[var(--muted)]">Today</span>
          <span data-testid="time-travel-coin" data-size={size} className="inline-flex" style={{ width: size, height: size, transition }} role="img" aria-label={`A coin worth ${money(worth, currency)} today`}>
            <Icon name="coin" ink={toneInk.neutral} size={size} />
          </span>
          <span className="text-xs text-[var(--muted)]">Year {trimmed(top)}</span>
        </div>
        {slider}
        <p role="status" data-testid="time-travel-caption" className="mt-1 text-sm">
          {at === 0 ? `${money(amount, currency)} paid today is worth ${money(amount, currency)} today.` : `${money(amount, currency)} paid in ${at} ${at === 1 ? "year" : "years"} is worth ${money(worth, currency)} today.`}
        </p>
      </div>
    );
  }

  const brought = rows.slice(0, at);
  const total = brought.reduce((sum, r) => sum + r.worth, 0);
  const all = rows.reduce((sum, r) => sum + r.worth, 0);
  return (
    <div data-testid="time-travel" data-mode="payments" data-motion={reduced ? "reduced" : "full"} className="my-3">
      <label htmlFor={`${id}-slider`} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex flex-wrap items-end gap-1 py-2" aria-hidden>
        {rows.map((r, i) => {
          const size = coinSize(r.payment ? r.worth / r.payment : 1);
          return (
            <span key={r.year} data-testid="time-travel-payment" data-state={i < at ? "today" : "waiting"} data-size={size} className="inline-flex" style={{ opacity: i < at ? 0.35 : 1, transition: reduced ? undefined : "opacity 200ms var(--ease-out, ease-out)" }}>
              <Icon name="coin" ink={toneInk.neutral} size={size} />
            </span>
          );
        })}
      </div>
      {slider}
      <p role="status" data-testid="time-travel-caption" className="mt-1 text-sm">
        {at === 0 ? `Move the slider to bring the ${rows.length} payments to today.` : `${at} of ${rows.length} payments brought to today are worth `}
        {at > 0 && (
          <strong data-testid="time-travel-total" className="tabular-nums">
            {money(total, currency)}
          </strong>
        )}
        {at > 0 && "."}
      </p>
      <p data-testid="time-travel-all" className="text-xs text-[var(--muted)]">
        All {rows.length} together: {money(all, currency)} today, against {money(rows.reduce((s, r) => s + r.payment, 0), currency)} on paper.
      </p>
    </div>
  );
}

export const TimeTravel = defineComponent({
  name: "TimeTravel",
  description:
    "Present value as a journey: TimeTravel(amount, ratePercent, maxYears, payments?, growthPercent?, currency?). Without payments the Learner drags one coin from today to year maxYears and watches it shrink; with payments a row of coins is the annuity and the slider brings them to today, where they stack up. Worked out by code.",
  props: timeTravelProps,
  component: ({ props }: ComponentRenderProps<z.infer<typeof timeTravelProps>>) => <TimeTravelView {...props} />,
});
