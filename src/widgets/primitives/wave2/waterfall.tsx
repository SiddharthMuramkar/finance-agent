"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { formatAmount } from "../wave1/format";
import { usePrefersReducedMotion } from "../wave1/motion";

// Waterfall: revenue, then each cost, then what is left. The values are changes (the first starts the total, a cost
// is negative); the closing bar is the total, added up by code. Neutral ink only: a rise is solid, a fall is hatched
// by its dashed outline, and every bar says its figure in words as well.

export const waterfallProps = z.object({
  labels: z.array(z.string()).describe("One label per value, e.g. [Revenue, Cost of goods, Salaries, Tax]"),
  values: z.array(z.number()).describe("The change each label makes, from tools or calculators: the first is the start (revenue), costs are negative"),
  unit: z.string().describe("inr, usd, percent, ... (as for Stat)"),
  totalLabel: z.string().optional().describe('The closing bar, e.g. "Profit". Default "Total"'),
});

export type Bar = { label: string; from: number; to: number; change: number; total: boolean };

/** The bars of a waterfall: each change starts where the last one ended, and a closing total bar stands on zero. */
export function waterfallBars(labels: readonly string[], values: readonly number[], totalLabel = "Total"): Bar[] {
  let running = 0;
  const bars: Bar[] = [];
  const n = Math.min(labels.length, values.length);
  for (let i = 0; i < n; i++) {
    const change = Number.isFinite(values[i]) ? values[i] : 0;
    bars.push({ label: labels[i], from: running, to: running + change, change, total: false });
    running += change;
  }
  bars.push({ label: totalLabel, from: 0, to: running, change: running, total: true });
  return bars;
}

const W = 600;
const H = 220;
const TOP = 24;
const BOTTOM = 36;

export function WaterfallView({ labels, values, unit, totalLabel }: z.infer<typeof waterfallProps>) {
  const reduced = usePrefersReducedMotion();
  if (!labels.length || !values.length) return <p className="py-2 text-sm text-[var(--muted)]">Working out the bars…</p>;
  const bars = waterfallBars(labels, values, totalLabel);
  const levels = bars.flatMap((b) => [b.from, b.to, 0]);
  const hi = Math.max(...levels);
  const lo = Math.min(...levels);
  const span = hi - lo || 1;
  const y = (v: number) => TOP + ((hi - v) / span) * (H - TOP - BOTTOM);
  const slot = W / bars.length;
  const barW = Math.min(64, slot * 0.6);
  const summary = bars.map((b) => `${b.label} ${b.change < 0 ? "minus " : b.total ? "" : "plus "}${formatAmount(Math.abs(b.change), unit)}`.replace(/\s+/g, " ")).join(", ");
  return (
    <figure data-testid="waterfall" data-motion={reduced ? "reduced" : "full"} role="img" aria-label={`Waterfall: ${summary}.`} className="my-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--border)" />
        {bars.map((b, i) => {
          const x = i * slot + (slot - barW) / 2;
          const top = y(Math.max(b.from, b.to));
          const height = Math.max(2, Math.abs(y(b.from) - y(b.to)));
          const down = !b.total && b.change < 0;
          const next = bars[i + 1];
          return (
            <g key={i} data-testid="waterfall-bar" data-kind={b.total ? "total" : down ? "fall" : "rise"}>
              <rect
                x={x}
                y={top}
                width={barW}
                height={height}
                rx={4}
                fill={b.total ? "var(--ink)" : down ? "var(--field)" : "var(--muted)"}
                stroke={b.total ? "var(--ink)" : "var(--muted)"}
                strokeWidth={1.5}
                strokeDasharray={down ? "4 3" : undefined}
                style={{ transition: reduced ? undefined : "y 200ms var(--ease-out, ease-out), height 200ms var(--ease-out, ease-out)" }}
              />
              {next && !next.total && <line x1={x + barW} x2={(i + 1) * slot + (slot - barW) / 2} y1={y(b.to)} y2={y(b.to)} stroke="var(--border)" />}
              <text x={x + barW / 2} y={top - 6} textAnchor="middle" fontSize={12} fill="var(--ink)" className="tabular-nums">
                {`${b.change < 0 ? "−" : ""}${formatAmount(Math.abs(b.change), unit)}`}
              </text>
              <text x={x + barW / 2} y={H - 14} textAnchor="middle" fontSize={12} fill="var(--muted)">
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export const Waterfall = defineComponent({
  name: "Waterfall",
  description:
    "Revenue, then each cost, then what is left: Waterfall(labels, values, unit, totalLabel?). values are the changes (the first is the start, costs are negative) from tools or calculators; the closing total bar is added up by code. For the statements topics.",
  props: waterfallProps,
  component: ({ props }: ComponentRenderProps<z.infer<typeof waterfallProps>>) => <WaterfallView {...props} />,
});
