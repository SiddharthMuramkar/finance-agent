"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { countOf } from "./format";
import { IconGrid, type Cell } from "./icon-grid";
import { ICON_NAMES, isKnownObject } from "./icons";
import { useHeld, usePrefersReducedMotion } from "./motion";
import type { Tone } from "./tones";

// Pictogram: draw the thing itself. When the topic is gold, the Learner sees gold bars, not a price. `count`
// copies of the object (a fraction fills the last one partly); above 40 icons it groups into 5s, 10s and up.
// `compareTo` is the earlier count, drawn as faint outlines, so a change reads as icons appearing or vanishing.

export const pictogramProps = z.object({
  object: z.string().describe(`One of ${ICON_NAMES.join(", ")}. Any other name is drawn as a coin`),
  count: z.number().describe("How many: from a calculator or an expression of $variables, never typed by hand"),
  label: z.string(),
  perIcon: z.string().optional().describe('What one icon stands for, e.g. "1 bar = 1 g"'),
  compareTo: z.number().optional().describe("The earlier count: shown as faint outlines"),
  tone: z.enum(["you", "src", "neutral"]).optional(),
});

export const MAX_ICONS = 40;
const GROUPS = [1, 5, 10, 50, 100, 500, 1000, 5000, 10_000, 100_000, 1_000_000];

/** The smallest grouping (1, 5, 10, 50, ...) at which `count` fits in at most 40 icons. */
export function groupFor(count: number): number {
  return GROUPS.find((g) => count / g <= MAX_ICONS) ?? GROUPS[GROUPS.length - 1];
}

/** The cells for a count: full icons, one partly filled for a fraction, and ghosts for what `compareTo` had more of. */
export function pictogramCells(count: number, group: number, tone: Tone, compareTo?: number): Cell[] {
  const units = Math.max(0, count) / group;
  const earlier = compareTo !== undefined && Number.isFinite(compareTo) ? Math.max(0, compareTo) / group : 0;
  const whole = Math.floor(units + 1e-9);
  const fraction = units - whole;
  const cells: Cell[] = Array.from({ length: whole }, () => ({ tone }));
  if (fraction > 1e-6) cells.push({ tone, fill: fraction });
  for (let i = cells.length; i < Math.ceil(earlier - 1e-9); i++) cells.push({ tone, ghost: true });
  return cells;
}

export function PictogramView({ object, count, label, perIcon, compareTo, tone = "neutral" }: z.infer<typeof pictogramProps> & { tone?: Tone }) {
  const reduced = usePrefersReducedMotion();
  // The grouping only grows while the widget lives, so more of the thing means more icons, not smaller ones.
  const valid = Number.isFinite(count) && count >= 0;
  const wanted = valid ? groupFor(Math.max(count, compareTo !== undefined && Number.isFinite(compareTo) ? compareTo : 0)) : 1;
  const group = useHeld(wanted, (held, next) => held >= next);
  if (!valid) return <p className="py-2 text-sm text-[var(--muted)]">Working out how many…</p>;
  const cells = pictogramCells(count, group, tone, compareTo);
  const name = isKnownObject(object) ? object : "coin";
  const caption = [perIcon, group > 1 ? `each icon stands for ${group}` : null, countOf(count, name)].filter(Boolean).join(" · ");
  return (
    <figure data-testid="pictogram" data-motion={reduced ? "reduced" : "full"} role="img" aria-label={`${label}: ${countOf(count, name)}`} className="my-3">
      <figcaption className="mb-1 text-sm font-medium">{label}</figcaption>
      {cells.length ? <IconGrid object={name} cells={cells} /> : <p className="text-sm text-[var(--muted)]">None</p>}
      <p data-testid="pictogram-caption" className="mt-1 text-xs text-[var(--muted)]">
        {caption}
      </p>
    </figure>
  );
}

export const Pictogram = defineComponent({
  name: "Pictogram",
  description: `Draw the thing itself: Pictogram(object, count, label, perIcon?, compareTo?, tone?). object is one of ${ICON_NAMES.join(", ")}. count is a computed quantity (it may be fractional); compareTo the earlier count, shown as faint outlines. When the topic is a physical thing (gold, a house, a vada pav, a phone), show it with Pictogram, never only a price.`,
  props: pictogramProps,
  component: ({ props }: ComponentRenderProps<z.infer<typeof pictogramProps>>) => <PictogramView {...props} />,
});
