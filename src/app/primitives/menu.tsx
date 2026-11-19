"use client";

// The pop-up menus (the account menu and the Topic options menu): one row look and one lot of menu behaviour, so every
// menu opens, moves and closes the same way. Rows are flat 32px `.menu-item` rows (ADR 0018): a wash on hover and focus,
// the focus ring inset; the menu itself is a `.popover`, a native popover (usePopover). They carry role="menuitem", which
// the affordance audit judges.

import Link from "next/link";
import type { ComponentProps, KeyboardEvent, ToggleEvent } from "react";
import { popoverOpen, usePopover } from "./popover";

export function MenuItem({ className = "", type = "button", ...props }: ComponentProps<"button">) {
  return <button type={type} role="menuitem" data-affordance="button" className={`menu-item ${className}`.trim()} {...props} />;
}

/** A menu row that goes somewhere: the same flat row as MenuItem, as a link. */
export function MenuLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return <Link role="menuitem" data-affordance="button" className={`menu-item ${className}`.trim()} {...props} />;
}

/**
 * The shared menu behaviour of the header's menus (A5), on a native popover since audit batch 2 (usePopover): the toggle
 * opens and closes it with a press, Enter or Space (the browser's popovertarget), and ArrowDown opens it too; on open,
 * focus goes to the checked row (or the first); the arrows, Home and End move and wrap; Escape closes and returns focus to
 * the toggle; Tab, or a press outside, closes. Spread `toggleProps` on the caller's toggle and `menuProps` on the menu,
 * right after the toggle; the caller draws its own rows.
 */
export function useMenu(itemSelector = '[role^="menuitem"]') {
  const popover = usePopover();
  const { popoverRef: menuRef, buttonRef: toggleRef } = popover;

  const items = () => [...(menuRef.current?.querySelectorAll<HTMLElement>(itemSelector) ?? [])];
  const enter = () => {
    const rows = items();
    (rows.find((r) => r.getAttribute("aria-checked") === "true") ?? rows[0])?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rows = items();
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = { ArrowDown: (i + 1) % rows.length, ArrowUp: (i - 1 + rows.length) % rows.length, Home: 0, End: rows.length - 1 };
    if (e.key in moves) {
      e.preventDefault();
      rows[moves[e.key]]?.focus();
    } else {
      popover.popoverProps.onKeyDown(e);
    }
  };

  // Enter and Space are the toggle's own click, which its popovertarget turns into open or close; ArrowDown opens a closed
  // menu and enters an open one. Focus moves in the toggle event, once the menu shows.
  const onToggleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowDown") return;
    e.preventDefault();
    if (popoverOpen(menuRef.current)) enter();
    else popover.show();
  };

  const onToggle = (e: ToggleEvent<HTMLDivElement>) => {
    popover.popoverProps.onToggle(e);
    if (e.newState === "open") enter();
  };

  return {
    open: popover.open,
    menuId: popover.id,
    toggleRef,
    menuRef,
    /** Closes the menu and returns focus to the toggle. */
    close: () => popover.close(true),
    /** Closes the menu and leaves focus to the caller (a row that opens something else moves it there). */
    hide: () => popover.close(false),
    toggleProps: { ...popover.buttonProps, "aria-haspopup": "menu" as const, onKeyDown: onToggleKeyDown },
    menuProps: { ...popover.popoverProps, role: "menu", onKeyDown: onMenuKeyDown, onToggle },
  };
}
