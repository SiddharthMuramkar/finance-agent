"use client";

import { IconButton, MenuItem, MenuLink, useMenu } from "./primitives";

/**
 * The header's account menu (A5): a round 36px button with the Learner's initial on the soft brand surface, opening a
 * menu with the Learner's name, their email when there is one, Settings and Sign out (the same plain form post to
 * /api/logout as SignOutButton, drawn as a menu row so the arrows reach it). Email is empty until C1b supplies it.
 * The keyboard works like the Theme menu's, through useMenu in primitives.
 */
export function AccountMenu({ name, email }: { name: string; email?: string }) {
  const menu = useMenu();
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    <div ref={menu.rootRef} className="relative inline-flex">
      <IconButton
        ref={menu.toggleRef}
        label="Account menu"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? menu.menuId : undefined}
        onClick={() => menu.setOpen((o) => !o)}
        onKeyDown={menu.onToggleKeyDown}
        data-testid="account-menu-button"
        className="[--face:var(--brand-soft)] [--label:var(--brand-deep)] [--rim:var(--brand-deep)] [--lip-colour:var(--brand-deep)] text-sm"
      >
        <span aria-hidden="true">{initial}</span>
      </IconButton>
      {menu.open && (
        <div
          ref={menu.menuRef}
          id={menu.menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={menu.onMenuKeyDown}
          data-testid="account-menu"
          className="absolute top-full right-0 z-20 mt-1 flex w-60 flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1"
        >
          <div className="px-3 py-1.5">
            <p className="truncate text-[length:var(--text-ui)] font-medium leading-5 text-[var(--ink)]">{name}</p>
            {email && (
              <p data-testid="account-email" className="truncate text-xs leading-4 text-[var(--muted)]">
                {email}
              </p>
            )}
          </div>
          <MenuLink href="/settings">Settings</MenuLink>
          <form action="/api/logout" method="post" className="contents">
            <MenuItem type="submit">Sign out</MenuItem>
          </form>
        </div>
      )}
    </div>
  );
}
