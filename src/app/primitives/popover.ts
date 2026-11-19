"use client";

// The app's floating layers that a button opens (the account menu, the Topic options menu, the All steps list) are native
// popovers (audit batch 2, finding 5): popover="auto", opened by their button's popovertarget. The browser puts an open
// one in the top layer, over everything, so no z-index or positioned parent is needed, and closes it on Esc or a press
// outside, so nothing here listens to the document. The layer is always in the page, hidden until opened; its toggle event
// keeps `open` (and the button's aria-expanded) true to what shows. It hangs under its button by anchor positioning where
// the browser has it (globals.css, `.popover[popover]`); elsewhere usePopover works out where it goes when it opens.

import { useId, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ToggleEvent } from "react";

/** Whether `el` is an open popover. An engine without the Popover API (a test DOM) has none open. */
export function popoverOpen(el: Element | null): boolean {
  if (!el) return false;
  try {
    return el.matches(":popover-open");
  } catch {
    return false;
  }
}

/** Opens a closed popover. Where the Popover API is missing (a test DOM) nothing opens, as before any script ran. */
function show(el: HTMLElement | null) {
  if (el && typeof el.showPopover === "function" && !popoverOpen(el)) el.showPopover();
}

/** Closes an open popover; a browser (or test DOM) without the Popover API never opened one. */
function hide(el: HTMLElement | null) {
  if (el && typeof el.hidePopover === "function" && popoverOpen(el)) el.hidePopover();
}

/** Whether CSS hangs the layer under its button (anchor positioning). Where it cannot, usePopover places it. */
function anchored(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("position-area", "block-end");
}

/** The least room a layer placed by script keeps from the window's edges, in px. */
const EDGE = 8;

type Size = { width: number; height: number };

/**
 * Where a layer goes when the browser has no anchor positioning: `gap` px under its button with the two right edges lined
 * up (as the menus have always hung), or above the button when it would run past the window's bottom and there is more
 * room above; pulled in from the window's left edge when it is wider than the room left of the button's right edge. The
 * layer is position: fixed, so the answer is its top and right, in px from the window's top and right edges.
 */
export function placeUnder(button: DOMRect, layer: Size, view: Size, gap: number): { top: number; right: number } {
  const below = button.bottom + gap;
  const fitsBelow = below + layer.height <= view.height - EDGE;
  const roomAbove = button.top - gap;
  const top = fitsBelow || roomAbove <= view.height - below ? below : Math.max(EDGE, roomAbove - layer.height);
  const right = Math.max(0, Math.min(view.width - button.right, view.width - EDGE - layer.width));
  return { top, right };
}

/**
 * One button and the popover it opens. Spread `buttonProps` on the button and `popoverProps` on the layer, which should
 * come right after the button in the DOM: Tab then goes from the button into it, and the browser adds no aria-details.
 * Esc in the layer closes it and hands focus back to the button (the browser's own Esc does that only some of the time:
 * Safari never focused a pressed button); focus moving on past the layer (Tab out of it) closes it, so focus never lands
 * on the page under it (WCAG 2.4.11). `gap` is the room between the button and the layer, in px.
 */
export function usePopover({ gap = 8 }: { gap?: number } = {}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const id = useId();
  // An anchor name of this instance's own, so two of these on a page never hang off each other's button.
  const anchor = `--popover${id.replace(/[^\w-]/g, "")}`;

  /**
   * Without anchor positioning: as it opens, the layer goes under its button (its size is not known yet); once it shows,
   * its measured size can flip it above or pull it in from the left edge. The answer goes to CSS as custom properties,
   * read only where anchor positioning is missing (globals.css).
   */
  const place = (measured: boolean) => {
    const layer = popoverRef.current;
    const button = buttonRef.current;
    if (!layer || !button || anchored()) return;
    const root = document.documentElement;
    const size = measured ? layer.getBoundingClientRect() : { width: 0, height: 0 };
    const { top, right } = placeUnder(button.getBoundingClientRect(), size, { width: root.clientWidth, height: root.clientHeight }, gap);
    layer.style.setProperty("--popover-top", `${top}px`);
    layer.style.setProperty("--popover-right", `${right}px`);
  };

  /** Closes the layer; `returnFocus` first hands focus back to the button, so it never stays in a hidden layer. */
  const close = (returnFocus = false) => {
    if (returnFocus) buttonRef.current?.focus();
    hide(popoverRef.current);
  };

  const buttonProps = {
    ref: buttonRef,
    popoverTarget: id,
    "aria-controls": id,
    "aria-expanded": open,
    style: { anchorName: anchor } as CSSProperties,
  };

  const popoverProps = {
    ref: popoverRef,
    id,
    popover: "auto" as const,
    style: { positionAnchor: anchor, "--popover-gap": `${gap}px` } as CSSProperties,
    onBeforeToggle: (event: ToggleEvent<HTMLDivElement>) => {
      if (event.newState === "open") place(false);
    },
    onToggle: (event: ToggleEvent<HTMLDivElement>) => {
      const nowOpen = event.newState === "open";
      setOpen(nowOpen);
      if (nowOpen) place(true);
    },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Escape") return;
      // Ours, not the browser's close request (cancelled), so focus always goes back to the button.
      event.preventDefault();
      event.stopPropagation();
      close(true);
    },
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      const to = event.relatedTarget;
      // A press elsewhere is the browser's light dismiss, and a blur with nowhere to go (the window losing focus) leaves it.
      if (!(to instanceof Node) || popoverRef.current?.contains(to) || buttonRef.current?.contains(to)) return;
      // Once focus has moved, not while it moves: a popover hidden while it holds focus hands focus back to its button.
      setTimeout(() => hide(popoverRef.current));
    },
  };

  return { open, id, buttonRef, popoverRef, buttonProps, popoverProps, show: () => show(popoverRef.current), close };
}
