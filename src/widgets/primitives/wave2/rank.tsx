"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { z } from "zod/v4";
import { rankProblem } from "../../part-rules";
import { usePrefersReducedMotion } from "../wave1/motion";

export { rankProblem };

// Rank: put the items in order (of liquidity, of risk), then check. A row can be dragged, or moved by keyboard:
// Space picks it up, the arrow keys move it, Space puts it down. Checking marks each row and shows the reason it
// belongs where it does. Practice: never marked, never saved as a score.

export const rankProps = z.object({
  prompt: z.string(),
  items: z.array(z.string()).describe("2 to 8 things to put in order, in any order"),
  correctOrder: z.array(z.number()).describe("Indexes into items, from the low end to the high end"),
  reasons: z.array(z.string()).describe("One reason per item, in the same order as items"),
  lowLabel: z.string().describe('The low end, e.g. "Hardest to turn into cash"'),
  highLabel: z.string().describe('The high end, e.g. "Easiest to turn into cash"'),
});

/** The order the Learner starts from: the right order, shifted and swapped so it is never already right. */
export function startOrder(correctOrder: readonly number[]): number[] {
  const n = correctOrder.length;
  const shifted = correctOrder.map((_, i) => correctOrder[(i + Math.ceil(n / 2)) % n]);
  if (n > 2) [shifted[0], shifted[1]] = [shifted[1], shifted[0]];
  return shifted.every((v, i) => v === correctOrder[i]) ? [...correctOrder].reverse() : shifted;
}

/** `order` with the row at `from` moved to `to`. */
export function moved(order: readonly number[], from: number, to: number): number[] {
  if (to < 0 || to >= order.length || from === to) return [...order];
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** How many rows sit where they belong. */
export function rightPlaces(order: readonly number[], correctOrder: readonly number[]): number {
  return order.filter((item, i) => item === correctOrder[i]).length;
}

export function RankView({ prompt, items, correctOrder, reasons, lowLabel, highLabel }: z.infer<typeof rankProps>) {
  const id = useId();
  const reduced = usePrefersReducedMotion();
  const problem = rankProblem(items, correctOrder, reasons);
  const [order, setOrder] = useState(() => (problem ? [] : startOrder(correctOrder)));
  const [held, setHeld] = useState<number | null>(null); // the position of the row picked up by keyboard
  const [dragging, setDragging] = useState<number | null>(null); // the position of the row being dragged
  const [checked, setChecked] = useState(false);
  const [said, setSaid] = useState("");
  const rows = useRef<(HTMLLIElement | null)[]>([]);

  if (problem) return <p data-testid="rank-problem" className="py-2 text-sm text-[var(--muted)]">{problem}.</p>;

  const go = (from: number, to: number) => {
    if (checked || to < 0 || to >= order.length) return;
    setOrder(moved(order, from, to));
    setSaid(`${items[order[from]]}, position ${to + 1} of ${order.length}`);
  };
  const focusRow = (position: number) => requestAnimationFrame(() => rows.current[position]?.focus());

  const onKey = (e: KeyboardEvent<HTMLLIElement>, position: number) => {
    if (checked) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (held === position) {
        setHeld(null);
        setSaid(`Dropped ${items[order[position]]} at position ${position + 1} of ${order.length}`);
      } else {
        setHeld(position);
        setSaid(`Picked up ${items[order[position]]}. Use the arrow keys to move it, Space to drop it.`);
      }
    } else if (e.key === "Escape" && held !== null) {
      setHeld(null);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const to = position + (e.key === "ArrowUp" ? -1 : 1);
      if (held === position) {
        go(position, to);
        if (to >= 0 && to < order.length) {
          setHeld(to);
          focusRow(to);
        }
      } else if (to >= 0 && to < order.length) rows.current[to]?.focus();
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLLIElement>, position: number) => {
    if (checked) return;
    setDragging(position);
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* a pointer that cannot be captured still drags */
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLLIElement>) => {
    if (dragging === null) return;
    const under = rows.current.findIndex((el) => {
      const r = el?.getBoundingClientRect();
      return !!r && e.clientY >= r.top && e.clientY < r.bottom;
    });
    if (under >= 0 && under !== dragging) {
      go(dragging, under);
      setDragging(under);
    }
  };

  const right = rightPlaces(order, correctOrder);
  return (
    <div data-testid="rank" data-checked={checked} data-motion={reduced ? "reduced" : "full"} className="my-3">
      <p id={`${id}-p`} className="text-sm font-medium">
        {prompt}
      </p>
      <p id={`${id}-help`} className="text-xs text-[var(--muted)]">
        Drag a row, or press Space on it, use the arrow keys, and press Space again.
      </p>
      <div className="mt-2 flex justify-between text-xs text-[var(--muted)]">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
      <ol aria-labelledby={`${id}-p`} aria-describedby={`${id}-help`} className="mt-1 space-y-1">
        {order.map((item, position) => {
          const state = !checked ? undefined : item === correctOrder[position] ? "right" : "wrong";
          const lifted = held === position || dragging === position;
          return (
            <li
              key={item}
              ref={(el) => {
                rows.current[position] = el;
              }}
              tabIndex={0}
              aria-roledescription="sortable item"
              aria-label={`${items[item]}, position ${position + 1} of ${order.length}${lifted ? ", picked up" : ""}`}
              data-testid="rank-item"
              data-item={item}
              data-state={state}
              data-lifted={lifted}
              onKeyDown={(e) => onKey(e, position)}
              onPointerDown={(e) => onPointerDown(e, position)}
              onPointerMove={onPointerMove}
              onPointerUp={() => setDragging(null)}
              onPointerCancel={() => setDragging(null)}
              className="min-h-11 touch-none select-none rounded-md border bg-[var(--field)] px-3 py-2 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-line)]"
              style={{
                borderColor: state === "right" ? "var(--you)" : state === "wrong" ? "var(--danger)" : lifted ? "var(--ink)" : "var(--border)",
                cursor: checked ? "default" : "grab",
                transition: reduced ? undefined : "border-color 160ms var(--ease-out, ease-out)",
              }}
            >
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-[var(--muted)]">
                  ⠿
                </span>
                <span className="flex-1">{items[item]}</span>
                {state && (
                  <span aria-hidden className="text-xs font-medium" style={{ color: state === "right" ? "var(--you)" : "var(--danger)" }}>
                    {state === "right" ? "✓" : "✗"}
                  </span>
                )}
              </div>
              {checked && (
                <p data-testid="rank-reason" className="mt-1 text-xs text-[var(--muted)]">
                  {state === "wrong" && <span className="sr-only">Not in the right place. </span>}
                  {reasons[item]}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <p role="status" aria-live="polite" className="sr-only" data-testid="rank-said">
        {said}
      </p>
      <div className="mt-2 flex items-center gap-3">
        {!checked ? (
          <button
            type="button"
            onClick={() => {
              setHeld(null);
              setChecked(true);
            }}
            className="min-h-10 rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-[var(--brand-ink)] hover:bg-[var(--brand-hover)]"
          >
            Check the order
          </button>
        ) : (
          <>
            <p role="status" data-testid="rank-result" className="text-sm font-medium">
              {right === order.length ? "All in the right place." : `${right} of ${order.length} in the right place.`}
            </p>
            <button
              type="button"
              onClick={() => {
                setChecked(false);
                setOrder(startOrder(correctOrder));
              }}
              className="min-h-10 rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--brand-tint)]"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export const Rank = defineComponent({
  name: "Rank",
  description:
    "Put things in order, then check: Rank(prompt, items, correctOrder, reasons, lowLabel, highLabel). items are 2 to 8 names; correctOrder lists item indexes from the low end to the high end; reasons has one reason per item (shown after the check). For ordering by liquidity, risk or safety. Practice only.",
  props: rankProps,
  component: ({ props }: ComponentRenderProps<z.infer<typeof rankProps>>) => <RankView {...props} />,
});
