"use client";

// The pop-up menus (the account menu and the Topic options menu): one row look and one lot of menu behaviour, so every
// menu opens, moves and closes the same way. Rows are flat 32px `.menu-item` rows (ADR 0013): a wash on hover and focus,
// the focus ring inset; the menu itself is a `.popover`. They carry role="menuitem", which the affordance audit judges.

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ComponentProps, type KeyboardEvent } from "react";

export function MenuItem({ className = "", type = "button", ...props }: ComponentProps<"button">) {
  return <button type={type} role="menuitem" data-affordance="button" className={`menu-item ${className}`.trim()} {...props} />;
}

/** A menu row that goes somewhere: the same flat row as MenuItem, as a link. */
export function MenuLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return <Link role="menuitem" data-affordance="button" className={`menu-item ${className}`.trim()} {...props} />;
}

/**
 * The shared menu behaviour of the header's menus, moved here in A5: open state; on open, focus the checked row (or the
 * first); a press outside closes; Enter, Space or ArrowDown on the toggle opens; the arrows, Home and End move;
 * Escape closes and returns focus to the toggle; Tab closes. The caller renders its own toggle and rows.
 */
export function useMenu(itemSelector = '[role^="menuitem"]') {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () => [...(menuRef.current?.querySelectorAll<HTMLElement>(itemSelector) ?? [])];

  useEffect(() => {
    if (!open) return;
    const rows = items();
    (rows.find((r) => r.getAttribute("aria-checked") === "true") ?? rows[0])?.focus();
    const away = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
    // items() reads the rendered rows; it is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rows = items();
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = { ArrowDown: (i + 1) % rows.length, ArrowUp: (i - 1 + rows.length) % rows.length, Home: 0, End: rows.length - 1 };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key in moves) {
      e.preventDefault();
      rows[moves[e.key]]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  // Enter and Space toggle here (their native click is prevented, so the menu toggles once) and ArrowDown opens.
  const onToggleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((o) => !o);
    }
  };

  return { open, setOpen, toggleRef, rootRef, menuRef, menuId, close, onMenuKeyDown, onToggleKeyDown };
}
