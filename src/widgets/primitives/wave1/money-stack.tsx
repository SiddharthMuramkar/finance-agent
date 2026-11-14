"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { calculateParts, CALCULATORS, PARTS_CALCULATOR_IDS, type CalculatorPart, type Currency } from "@/finance/calculators";
import { formatAmount } from "./format";
import { IconGrid, type Cell } from "./icon-grid";
import { useHeld, usePrefersReducedMotion } from "./motion";
import { toneInk } from "./tones";

// MoneyStack: count the notes. Runs the tested calculator (the same code as Calculator) and draws its total as
// identical notes, coloured by part: what you put in (stone), growth (teal), a lender's interest (amber). The
// number of rupees each note stands for is chosen so the total is 10 to 60 notes, and then held, so more years
// means more notes, not smaller ones.

export const moneyStackProps = z.object({
  calculator: z.string().describe(`One of ${PARTS_CALCULATOR_IDS.join(", ")}`),
  inputs: z.record(z.string(), z.number()).describe("The calculator's inputs; values may be $variables bound to Sliders"),
  currency: z.enum(["inr", "usd"]).optional(),
  title: z.string().optional(),
});

export const MIN_NOTES = 10;
export const MAX_NOTES = 60;
const MAX_DRAWN = 200;

/** A round amount (1, 2 or 5 times a power of ten) at which `total` is at most MAX_NOTES notes. */
export function noteValueFor(total: number): number {
  if (!(total > 0)) return 1;
  for (let power = 0; power < 15; power++) {
    for (const base of [1, 2, 5]) {
      const value = base * 10 ** power;
      if (total / value <= MAX_NOTES) return value;
    }
  }
  return 10 ** 15;
}

/** How many notes each part gets at `unit`: rounded, but never nothing for a part that is something. */
export function notesFor(parts: readonly CalculatorPart[], unit: number): number[] {
  return parts.map((p) => (p.value <= 0 ? 0 : Math.max(1, Math.round(p.value / unit))));
}

export function MoneyStackView({ parts, currency, title }: { parts: CalculatorPart[]; currency: Currency; title?: string }) {
  const reduced = usePrefersReducedMotion();
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  const wanted = noteValueFor(total);
  // Held while the widget lives; only changed when the pile would be absurdly big or almost empty.
  const scale = useHeld(wanted, (held, next) => !(total / held > 3 * MAX_NOTES || (total / held < 3 && next < held)));
  const counts = notesFor(parts, scale);
  const cells: Cell[] = parts.flatMap((p, i) => Array.from({ length: Math.min(counts[i], MAX_DRAWN) }, () => ({ tone: p.tone })));
  const caption = `Each ▮ = ${formatAmount(scale, currency)} · ${parts.map((p, i) => `${p.label} ${formatAmount(p.value, currency)} (${counts[i]} ▮)`).join(" · ")}`;
  return (
    <figure data-testid="money-stack" data-motion={reduced ? "reduced" : "full"} data-note-value={scale} className="my-3">
      {title && <figcaption className="mb-1 text-sm font-medium">{title}</figcaption>}
      <IconGrid object={currency === "usd" ? "note-usd" : "note-inr"} cells={cells} size={30} label={caption} />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]" aria-hidden>
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border" style={{ background: toneInk[p.tone].fill, borderColor: toneInk[p.tone].line }} />
            {p.label}
          </span>
        ))}
      </div>
      <p data-testid="money-stack-caption" className="mt-1 text-xs text-[var(--muted)]">
        {caption}
      </p>
    </figure>
  );
}

function MoneyStackBound({ props }: ComponentRenderProps<z.infer<typeof moneyStackProps>>) {
  const currency: Currency = props.currency ?? CALCULATORS.find((c) => c.id === props.calculator)?.defaultCurrency ?? "inr";
  const done = calculateParts(props.calculator, props.inputs, currency);
  if (!done.ok) return <p className="py-2 text-sm text-[var(--muted)]">{done.error}</p>;
  return <MoneyStackView parts={done.parts} currency={currency} title={props.title} />;
}

export const MoneyStack = defineComponent({
  name: "MoneyStack",
  description: `Count the notes: MoneyStack(calculator, inputs, currency?, title?). Runs a tested calculator (${PARTS_CALCULATOR_IDS.join(", ")}) and draws its total as notes coloured by part (what you put in, growth or interest), with a caption built by code. Show "how much do I end up with or pay in total" with MoneyStack.`,
  props: moneyStackProps,
  component: MoneyStackBound,
});
