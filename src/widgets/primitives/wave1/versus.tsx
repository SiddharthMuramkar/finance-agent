"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { formatAmount, trimmed } from "./format";
import { usePrefersReducedMotion, useStickyMax } from "./motion";

// Versus: two options on one shared scale, with a winner. The scale only grows while a slider moves, so a bar
// changes length because its number changed, never because the axis moved. The winner's bar is dark, the other
// is the data grey (no navy inside a chart).

export const versusProps = z.object({
  leftLabel: z.string(),
  leftValue: z.number().describe("From a tool, a calculator or Case Data"),
  rightLabel: z.string(),
  rightValue: z.number().describe("From a tool, a calculator or Case Data"),
  unit: z.string().describe("inr, usd, percent, ... (as for Stat)"),
  better: z.enum(["higher", "lower"]).optional().describe('Which side wins: "higher" (the default) or "lower"'),
});

export type Winner = "left" | "right" | "tie";

/** Which side wins, by `better`. Equal values (or a missing number) are a tie. */
export function winnerOf(left: number, right: number, better: "higher" | "lower" = "higher"): Winner {
  if (!Number.isFinite(left) || !Number.isFinite(right) || left === right) return "tie";
  const leftHigher = left > right;
  return leftHigher === (better === "higher") ? "left" : "right";
}

export function VersusView({ leftLabel, leftValue, rightLabel, rightValue, unit, better = "higher" }: z.infer<typeof versusProps>) {
  const reduced = usePrefersReducedMotion();
  const scale = useStickyMax(Math.max(Math.abs(leftValue), Math.abs(rightValue)));
  const winner = winnerOf(leftValue, rightValue, better);
  const margin = Math.abs(leftValue - rightValue);
  const base = Math.min(leftValue, rightValue);
  const percent = leftValue > 0 && rightValue > 0 ? (margin / base) * 100 : null;
  const winnerLabel = winner === "left" ? leftLabel : rightLabel;
  const chip = winner === "tie" ? "Level" : `+${formatAmount(margin, unit)}${percent === null ? "" : ` · ${trimmed(percent, percent < 10 ? 1 : 0)}%`}`;
  const sentence =
    winner === "tie"
      ? `${leftLabel} ${formatAmount(leftValue, unit)} and ${rightLabel} ${formatAmount(rightValue, unit)}: level.`
      : `${leftLabel} ${formatAmount(leftValue, unit)} vs ${rightLabel} ${formatAmount(rightValue, unit)}. ${winnerLabel} ${better} by ${formatAmount(margin, unit)}.`;

  const bar = (side: "left" | "right", label: string, value: number) => {
    const wins = winner === side;
    const width = scale > 0 && Number.isFinite(value) ? Math.min(100, (Math.abs(value) / scale) * 100) : 0;
    const negative = Number.isFinite(value) && value < 0;
    return (
      <div className="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-x-3 sm:grid-cols-[10rem_1fr]" data-testid={`versus-${side}`} data-winner={wins}>
        <span className={`text-sm ${wins ? "font-semibold" : ""}`}>{label}</span>
        <div className="flex items-center gap-2">
          <div className="h-5 flex-1 rounded-sm bg-[var(--field)]">
            <div
              data-testid={`versus-${side}-bar`}
              className="h-full rounded-sm"
              style={{
                width: `${width}%`,
                border: negative ? "1px dashed var(--ink)" : undefined,
                background: wins ? "var(--muted)" : "var(--data)",
                transition: reduced ? undefined : "width 160ms var(--ease-out, ease-out), background-color 200ms var(--ease-out, ease-out)",
              }}
            />
          </div>
          <span className="w-24 shrink-0 text-right text-sm tabular-nums">{negative ? "−" : ""}{formatAmount(Math.abs(value), unit)}</span>
        </div>
      </div>
    );
  };

  return (
    <figure data-testid="versus" data-winner={winner} data-motion={reduced ? "reduced" : "full"} role="img" aria-label={sentence} className="my-3 flex flex-col gap-2">
      {bar("left", leftLabel, leftValue)}
      {bar("right", rightLabel, rightValue)}
      <figcaption className="flex items-center gap-2 text-xs text-[var(--muted)]">
        <span
          data-testid="versus-chip"
          className="rounded border border-[var(--border)] px-2 py-0.5 font-medium tabular-nums text-[var(--ink)]"
          style={{ marginLeft: winner === "right" ? "auto" : undefined, transition: reduced ? undefined : "margin 200ms var(--ease-out, ease-out)" }}
        >
          {chip}
        </span>
        {winner !== "tie" && <span>{winnerLabel} is {better}</span>}
      </figcaption>
    </figure>
  );
}

export const Versus = defineComponent({
  name: "Versus",
  description:
    'Two options on one shared scale with a winner and the margin: Versus(leftLabel, leftValue, rightLabel, rightValue, unit, better?). better is "higher" (default) or "lower". Compare two options with Versus, not two Cards of numbers.',
  props: versusProps,
  component: ({ props }: ComponentRenderProps<z.infer<typeof versusProps>>) => <VersusView {...props} />,
});
