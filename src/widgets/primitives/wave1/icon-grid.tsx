"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { usePrefersReducedMotion } from "./motion";
import { toneInk, type Tone } from "./tones";

// IconGrid: a wrapping grid of one object drawn many times. Pictogram and MoneyStack are both this grid with
// different cells. A cell is full, partly filled (a fraction of an icon) or a ghost (a faint outline, for what
// was there before). Icons enter with a 120 ms scale-from-0.8 and fade, staggered so the whole entrance takes
// at most 300 ms; under reduced motion they are simply there.

export type Cell = { tone: Tone; fill?: number; ghost?: boolean };

export const ENTER_MS = 120;
export const MAX_STAGGER_MS = 180;

/** The delay before cell `index` of `total` enters: spread over the stagger, so the total stays within 300 ms. */
export function enterDelay(index: number, total: number): number {
  if (total <= 1) return 0;
  return Math.round((index / (total - 1)) * MAX_STAGGER_MS);
}

function IconCell({ object, cell, index, total, size, reduced }: { object: string; cell: Cell; index: number; total: number; size: number; reduced: boolean }) {
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setArrived(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const entered = reduced || arrived;
  const ink = toneInk[cell.tone];
  const fraction = cell.fill !== undefined && cell.fill < 1 ? Math.max(0, cell.fill) : 1;
  let inner: ReactNode;
  if (cell.ghost) inner = <Icon name={object} ink={ink} ghost size={size} />;
  else if (fraction < 1) {
    inner = (
      <span className="relative inline-block" style={{ width: size, height: size }}>
        <span className="absolute inset-0">
          <Icon name={object} ink={ink} ghost size={size} />
        </span>
        <span className="absolute inset-0" style={{ clipPath: `inset(0 ${(1 - fraction) * 100}% 0 0)` }}>
          <Icon name={object} ink={ink} size={size} />
        </span>
      </span>
    );
  } else inner = <Icon name={object} ink={ink} size={size} />;
  return (
    <span
      data-testid="icon-cell"
      data-state={cell.ghost ? "ghost" : fraction < 1 ? "partial" : "full"}
      data-tone={cell.tone}
      className="inline-flex"
      style={{
        opacity: entered ? 1 : 0,
        transform: entered ? "none" : "scale(0.8)",
        transition: reduced ? undefined : `opacity ${ENTER_MS}ms var(--ease-out, ease-out) ${enterDelay(index, total)}ms, transform ${ENTER_MS}ms var(--ease-out, ease-out) ${enterDelay(index, total)}ms`,
      }}
    >
      {inner}
    </span>
  );
}

export function IconGrid({ object, cells, size = 28, label }: { object: string; cells: Cell[]; size?: number; label?: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <div data-testid="icon-grid" data-motion={reduced ? "reduced" : "full"} data-object={object} data-count={cells.length} className="flex flex-wrap gap-1" role={label ? "img" : undefined} aria-label={label}>
      {cells.map((cell, i) => (
        <IconCell key={i} object={object} cell={cell} index={i} total={cells.length} size={size} reduced={reduced} />
      ))}
    </div>
  );
}
