// The chip: a small, flat choice or filter inside content, 8px corners and a 1px edge (spec A3a; the look is ADR 0018's).

import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "./button";

export type ChipState = "idle" | "showing" | "drawing";

/**
 * Small selectable button, at least 28px tall. state: idle, showing (its item is on screen) or drawing (its item is
 * being made: a spinner and aria-busy). active is the older spelling of state="showing".
 */
export function Chip({
  active,
  state,
  className = "",
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; state?: ChipState }) {
  const now: ChipState = state ?? (active ? "showing" : "idle");
  return (
    <button
      type={type}
      data-affordance="chip"
      aria-pressed={state === undefined ? (active ?? undefined) : now === "showing"}
      aria-busy={now === "drawing" ? true : undefined}
      data-state={now}
      className={`chip ${className}`.trim()}
      {...props}
    >
      {now === "drawing" && <Spinner className="h-3 w-3" />}
      {children}
    </button>
  );
}
