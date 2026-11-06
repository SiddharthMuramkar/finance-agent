"use client";

import { IconButton, MenuItem, MenuLink, useMenu } from "./primitives";

/**
 * The header's account menu (A5): a round 36px button with the Learner's initial on the soft brand surface, opening a
 * menu with the Learner's name, their email when there is one, Settings and Sign out (the same plain form post to
 * /api/logout as SignOutButton, drawn as a menu row so the arrows reach it). Email is empty until C1b supplies it.
 * In Dark the soft face is nearly the deep label's colour (1.3:1), so the label switches to --brand (about 6:1). The keyboard works like the Theme menu's, through useMenu in primitives.
 */
export function AccountMenu({ name, email }: { name: string; email?: string }) {
  const { open, setOpen, toggleRef, rootRef, menuRef, menuId, onMenuKeyDown, onToggleKeyDown } = useMenu();
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    <div ref={rootRef} className="relative inline-flex">
      <IconButton
        ref={toggleRef}
        label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onToggleKeyDown}
        data-testid="account-menu-button"
        className="[--face:var(--brand-soft)] [--label:var(--brand-deep)] [.dark_&]:[--label:var(--brand)] [--rim:var(--brand-deep)] [--lip-colour:var(--brand-deep)] text-sm"
      >
        <span aria-hidden="true">{initial}</span>
      </IconButton>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
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
