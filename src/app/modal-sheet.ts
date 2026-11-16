"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Makes everything on the page but `sheet` inert: each sibling of the sheet and of each of its ancestors up to <body>.
 * Returns the undo, which frees only what it made inert.
 */
export function inertOutside(sheet: HTMLElement): () => void {
  const made: HTMLElement[] = [];
  for (let node: HTMLElement | null = sheet; node && node !== document.body; node = node.parentElement) {
    for (const sibling of node.parentElement?.children ?? []) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue;
      sibling.inert = true;
      made.push(sibling);
    }
  }
  return () => made.forEach((el) => (el.inert = false));
}

/**
 * A full-screen sheet that behaves as a modal dialog while `active` (the phone's Widget sheet, #82): the rest of the page
 * is inert (out of the tab order and the accessibility tree), focus moves to the sheet's `[data-sheet-start]` element (its
 * Back button), Escape calls `onClose`, and on closing focus goes back to what opened it (the chip), with no scroll.
 */
export function useModalSheet(sheet: RefObject<HTMLElement | null>, active: boolean, onClose?: () => void): void {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const el = sheet.current;
    if (!active || !el) return;
    const before = document.activeElement;
    const opener = before instanceof HTMLElement && before !== document.body && !el.contains(before) ? before : null;
    const free = inertOutside(el);
    (el.querySelector<HTMLElement>("[data-sheet-start]") ?? el).focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close.current?.();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      free();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [sheet, active]);
}
