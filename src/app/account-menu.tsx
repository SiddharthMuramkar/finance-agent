"use client";

import { IconButton, MenuItem, MenuLink, Tag, useMenu } from "./primitives";

/**
 * The header's account menu (A5, ADR 0013): a 32px ghost icon button holding the Learner's initial in a 28px avatar circle
 * (a --wash face, a 1px --line edge, the initial in --ink-2), its face washed while the menu is open. The menu is a
 * .popover (12px corners, the pop shadow) with the Learner's name, their email when there is one, a hairline, then flat
 * rows: Settings and Sign out (the same plain form post to /api/logout as SignOutButton, drawn as a menu row so the arrows
 * reach it). The email is that of the Google or email-link account (accountFor); a passcode Learner has none. The owner
 * (and only the owner: `admin` comes from accountFor) also gets an Admin row first, with the number of people waiting as
 * a warning Tag, read out as "Admin, 2 waiting"; it shows even when nobody waits (ADR 0014). The keyboard works through
 * useMenu in primitives, like the Topic options menu.
 */
export function AccountMenu({ name, email, admin }: { name: string; email?: string; admin?: { waiting: number } }) {
  const { open, setOpen, toggleRef, rootRef, menuRef, menuId, onMenuKeyDown, onToggleKeyDown } = useMenu();
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    <div ref={rootRef} className="relative ml-1 flex items-center">
      <IconButton
        ref={toggleRef}
        label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onToggleKeyDown}
        data-testid="account-menu-button"
        className="aria-expanded:[--face:var(--wash)]"
      >
        <span
          aria-hidden="true"
          data-testid="account-avatar"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--wash)] text-xs font-semibold leading-4 text-[var(--ink-2)]"
        >
          {initial}
        </span>
      </IconButton>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          data-testid="account-menu"
          className="popover absolute right-0 top-full z-20 mt-2 flex w-60 flex-col gap-0.5"
        >
          <div className="px-3 pb-2 pt-1.5">
            <p className="truncate text-[length:var(--text-ui)] font-medium leading-5 text-[var(--ink)]">{name}</p>
            {email && (
              <p data-testid="account-email" className="truncate text-[13px] leading-[18px] text-[var(--muted)]">
                {email}
              </p>
            )}
          </div>
          <div role="separator" className="-mx-1 my-1 h-px bg-[var(--rule)]" />
          {admin && (
            <MenuLink href="/admin" data-testid="account-admin">
              Admin
              {admin.waiting > 0 && (
                <>
                  <span aria-hidden="true" className="ml-auto flex">
                    <Tag tone="warning">{admin.waiting}</Tag>
                  </span>
                  <span className="sr-only">, {admin.waiting} waiting</span>
                </>
              )}
            </MenuLink>
          )}
          <MenuLink href="/settings">Settings</MenuLink>
          <form action="/api/logout" method="post" className="contents">
            <MenuItem type="submit">Sign out</MenuItem>
          </form>
        </div>
      )}
    </div>
  );
}
