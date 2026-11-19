"use client";

import { IconButton, MenuItem, MenuLink, useMenu } from "./primitives";
import { SignOutForm } from "./sign-out";

/**
 * The header's account menu (A5): a 32px ghost icon button holding the Learner's initial in a 28px avatar circle
 * (a --wash face, a 1px --line edge, the initial in --ink-2), its face washed while the menu is open. The menu is a
 * .popover (12px corners, the pop shadow) with the Learner's name, their email when there is one, a hairline, then flat
 * rows: Settings and Sign out (the same SignOutForm as SignOutButton, drawn as a menu row so the arrows reach it). The
 * email is the one the account's Clerk session carries (accountFor); a passcode Learner has none. The admin (and only an
 * account whose session says admin: `admin` comes from accountFor) also gets an Admin row first (issue #33: who waits
 * is Clerk's Waitlist now, so the row carries no count). The keyboard works through
 * useMenu in primitives, like the Topic options menu. The menu is a native popover (audit batch 2): always in the page
 * right after its button, hidden until opened, drawn in the top layer, so it drops over the Study Workspace's Topic bar
 * with no z-index; it hangs 8px under the button, their right edges lined up (usePopover).
 */
export function AccountMenu({ name, email, admin }: { name: string; email?: string; admin?: boolean }) {
  const { toggleProps, menuProps } = useMenu();
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    <div className="flex items-center md:ml-1">
      <IconButton {...toggleProps} label="Account menu" data-testid="account-menu-button" className="aria-expanded:[--face:var(--wash)]">
        <span
          aria-hidden="true"
          data-testid="account-avatar"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--wash)] text-xs font-semibold leading-4 text-[var(--ink-2)]"
        >
          {initial}
        </span>
      </IconButton>
      {/* Laid out only while open (open:flex): a display class of its own would show it closed too. */}
      <div {...menuProps} aria-label="Account" data-testid="account-menu" className="popover w-60 flex-col gap-0.5 open:flex">
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
          </MenuLink>
        )}
        <MenuLink href="/settings">Settings</MenuLink>
        <SignOutForm>
          <MenuItem type="submit">Sign out</MenuItem>
        </SignOutForm>
      </div>
    </div>
  );
}
