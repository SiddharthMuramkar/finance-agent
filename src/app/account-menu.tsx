"use client";

import { chrome } from "@/site/copy";
import { IconButton, MenuItem, MenuLink, useMenu } from "./primitives";
import { SignOutForm } from "./sign-out";
import { ThemeSwitch, usePhone } from "./theme-switch";

/**
 * The header's account menu (A5): a 32px ghost icon button holding the Learner's initial in a 28px avatar circle
 * (a --wash face, a 1px --line edge, the initial in --ink-2), its face washed while the menu is open. The menu is a
 * .popover (12px corners, the pop shadow) with the Learner's name, their email when there is one, a hairline, then flat
 * rows: Settings and Sign out (the same SignOutForm as SignOutButton, drawn as a menu row so the arrows reach it). The
 * email is the one the account's Clerk session carries (accountFor); a passcode Learner has none. The admin (and only an
 * account whose session says admin: `admin` comes from accountFor) also gets an Admin row first (issue #33: who waits
 * is Clerk's Waitlist now, so the row carries no count). On a phone the sun/moon switch is a row here too, after
 * Settings (the app bar shows it only from 768 px: AppBarThemeSwitch). The keyboard works through useMenu in
 * primitives, like the Topic options menu.
 */
export function AccountMenu({ name, email, admin }: { name: string; email?: string; admin?: boolean }) {
  const { open, setOpen, toggleRef, rootRef, menuRef, menuId, onMenuKeyDown, onToggleKeyDown } = useMenu();
  const phone = usePhone();
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    // 4px more air from the gear from 768 px; a phone's one-line bar has none to spare (spec #68, #84).
    <div ref={rootRef} className="relative flex items-center md:ml-1">
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
            </MenuLink>
          )}
          <MenuLink href="/settings">Settings</MenuLink>
          {/* ADR 0019: as in the site's Menu sheet, the phone's switch is a row with a word beside the icon. */}
          {phone && <ThemeSwitch role="menuitem" className="menu-item" text={chrome.theme} />}
          <SignOutForm>
            <MenuItem type="submit">Sign out</MenuItem>
          </SignOutForm>
        </div>
      )}
    </div>
  );
}
