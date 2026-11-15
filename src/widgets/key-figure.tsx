import { createElement, type ElementType, type ReactNode } from "react";

/**
 * A Widget's one key figure (spec 2026-11-11, A3b). The element carries `data-key-figure` and no weight
 * class of its own; CSS sets it to 600. `markKeyFigures` keeps the first mark in a Widget and demotes the rest.
 */
export function KeyFigure({ as = "span", className, children }: { as?: ElementType; className?: string; children?: ReactNode }) {
  return createElement(as, { "data-key-figure": "", className }, children);
}

/** The smallest size a Widget's key number is drawn at, in pixels (spec 2026-11-12, F2). */
export const KEY_NUMBER_MIN_PX = 20;

/**
 * True when a key figure's text is a number, as a reading shows one ("$877.8 million", "₹9.76 lakh", "35%"): it holds a
 * digit and is a few words at most. A sentence that holds a number ("Found it: 3.38% ...") or a word ("Yield") is not.
 */
export function isKeyNumber(text: string): boolean {
  const trimmed = text.trim();
  return /\d/.test(trimmed) && trimmed.length <= 24 && trimmed.split(/\s+/).length <= 3;
}

function mark(el: Element, name: string, on: boolean) {
  if (on) el.setAttribute(name, "");
  else el.removeAttribute(name);
}

/**
 * The first `[data-key-figure]` in `host` is the lead. Every later one is marked extra, at weight 500. A lead that is a
 * number is the Widget's one key number (F2): marked `data-key-number` (the accent, never underlined), and
 * `data-key-number-small` when its part draws it below 20px, which CSS raises to 20px. An SVG label keeps its size.
 */
export function markKeyFigures(host: Element) {
  const figures = [...host.querySelectorAll("[data-key-figure]")];
  figures.forEach((el, i) => {
    mark(el, "data-key-figure-extra", i > 0);
    const number = i === 0 && isKeyNumber(el.textContent ?? "");
    mark(el, "data-key-number", number);
    if (!number) el.removeAttribute("data-key-number-small");
    // Measured once, before the mark raises it: a figure already marked small keeps the mark.
    else if (!el.hasAttribute("data-key-number-small") && !(el instanceof SVGElement)) {
      const px = parseFloat(typeof getComputedStyle === "function" ? getComputedStyle(el).fontSize : "");
      if (px < KEY_NUMBER_MIN_PX) el.setAttribute("data-key-number-small", "");
    }
  });
}
