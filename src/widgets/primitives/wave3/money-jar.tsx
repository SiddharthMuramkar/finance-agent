"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { useState } from "react";
import { z } from "zod/v4";
import { Button } from "@/app/primitives";
import { usePrefersReducedMotion } from "../wave1/motion";
import { motionFlag, Pic } from "./shared";

// MoneyJar: a jar that fills or drains one object at a time, with its size said in words ("about twice as full").
// Mint when it fills (gains), coral when it drains (losses). The only numerals the part may show are inside `each`.
// A still frame tells the change too (ticket R-E2a): the jar has a neck, the objects that came in wear a mint ring, and the
// places the drained objects left stay as dashed coral outlines.

export const moneyJarProps = z.object({
  label: z.string().describe('What the jar holds, e.g. "Asha\'s savings"'),
  start: z.number().describe("Objects at the start: 0 to 20"),
  end: z.number().describe("Objects at the end: 0 to 20"),
  unit: z.string().describe("An emoji name for one object: coin, dollar-banknote and so on"),
  each: z.string().optional().describe('What one object is worth: at most 6 words, e.g. "each coin is ₹1 lakh"'),
  words: z.string().describe("The size of the jar in words, at most 12 words, no digits, e.g. \"about twice as full\""),
});

type Props = z.infer<typeof moneyJarProps>;

const MAX_OBJECTS = 20;
const OBJECT_MS = 150;
const ALL_MS = 400;

/** A small tilt for each coin in turn, so the pile looks tossed in rather than a printed row. */
const TILTS = [-8, 5, -3, 9, -6, 3];

const count = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(MAX_OBJECTS, Math.round(n))) : 0);

/** Gap between one object and the next: 40 ms, squeezed so the last one still finishes inside 400 ms. */
export function jarStep(objects: number): number {
  if (objects <= 1) return 0;
  return Math.min(40, Math.floor((ALL_MS - OBJECT_MS) / (objects - 1)));
}

export function MoneyJarView({ label, start, end, unit, each, words }: Props) {
  const reduced = usePrefersReducedMotion();
  const [round, setRound] = useState(0);
  const from = count(start);
  const to = count(end);
  const draining = to < from;
  // Under reduced motion the jar is simply the end state; otherwise the emptied objects stay just long enough to leave.
  const drawn = reduced ? to : Math.max(from, to);
  const step = jarStep(Math.abs(to - from));
  const tone = draining ? "coral" : "mint";

  return (
    <section data-testid="money-jar" data-motion={motionFlag(reduced)} aria-label={label} className="@container py-1">
      <p className="mb-1 text-base font-semibold leading-6 text-[var(--ink)]">{label}</p>
      <div key={round} className="mx-auto flex w-full max-w-56 flex-col items-center @min-[480px]:max-w-64">
        <span
          aria-hidden="true"
          data-testid="jar-neck"
          className={`h-3 w-2/3 max-w-60 rounded-full border-2 ${draining ? "border-[var(--coral)] bg-[var(--coral-tag)]" : "border-[var(--mint)] bg-[var(--mint-tag)]"}`}
        />
        <div
          data-testid="jar"
          data-tone={tone}
          className={`flex min-h-40 w-full flex-wrap-reverse content-start justify-center gap-1 rounded-b-[2.5rem] rounded-t-2xl border-2 px-3 pb-4 pt-2 shadow-[inset_0_-10px_18px_-12px_var(--shadow)] ${
            draining ? "border-[var(--coral)] bg-[var(--coral-tint)]" : "border-[var(--mint)] bg-[var(--mint-tint)]"
          }`}
        >
          {Array.from({ length: drawn }, (_, i) => {
            const entering = !reduced && to > from && i >= from;
            const leaving = !reduced && draining && i >= to;
            const delay = entering ? (i - from) * step : leaving ? (i - to) * step : 0;
            const fresh = to > from && i >= from;
            const gone = draining && i >= to;
            return (
              <span
                key={i}
                data-new={fresh ? "true" : undefined}
                data-testid={gone ? "jar-gap" : undefined}
                className={`grid place-items-center rounded-full border-2 [&_img]:size-8 @min-[480px]:[&_img]:size-12 ${fresh ? "border-[var(--mint)] bg-[var(--mint-tag)]" : gone ? "border-dashed border-[var(--coral)]" : "border-transparent"}`}
              >
                <span
                  data-leaving={leaving ? "true" : undefined}
                  className={entering ? "jar-in" : leaving ? "jar-out" : ""}
                  style={{ ...(entering || leaving ? { animationDelay: `${delay}ms` } : null), rotate: `${TILTS[i % TILTS.length]}deg` }}
                >
                  <Pic name={unit} size={48} />
                </span>
              </span>
            );
          })}
          {reduced &&
            draining &&
            Array.from({ length: from - to }, (_, i) => (
              <span key={`gap-${i}`} data-testid="jar-gap" aria-hidden="true" className="size-9 rounded-full border-2 border-dashed border-[var(--coral)] @min-[480px]:size-[52px]" />
            ))}
        </div>
      </div>
      <p className="mt-2 text-base font-medium leading-6 text-[var(--ink)]">{words}</p>
      {each && (
        <p data-testid="jar-each" className="text-sm leading-5 text-[var(--muted)]">
          {each}
        </p>
      )}
      <div className="mt-2">
        <Button variant="secondary" size="sm" onClick={() => setRound((r) => r + 1)} data-testid="jar-again">
          Again
        </Button>
      </div>
    </section>
  );
}

export const MoneyJar = defineComponent({
  name: "MoneyJar",
  description:
    'A jar that fills or drains one object at a time, sized in words: MoneyJar(label, start, end, unit, each, words). start and end are 0 to 20 objects; unit is an emoji name (coin, dollar-banknote); each (optional, at most 6 words) is the only place numerals may appear; words is e.g. "about twice as full".',
  props: moneyJarProps,
  component: ({ props }: ComponentRenderProps<Props>) => <MoneyJarView {...props} />,
});
