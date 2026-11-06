"use client";

import { IconButton } from "./primitives";

/**
 * The header's account button: a round button with the Learner's initial on the soft brand surface. It opens the
 * account menu (the Learner's name and email, Settings, Sign out). Email is empty until Google sign-in supplies it.
 */
export function AccountMenu({ name }: { name: string; email?: string }) {
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    <IconButton
      label="Account menu"
      aria-haspopup="menu"
      aria-expanded={false}
      data-testid="account-menu-button"
      className="[--face:var(--brand-soft)] [--label:var(--brand-deep)] [--rim:var(--brand-deep)] [--lip-colour:var(--brand-deep)] text-sm"
    >
      <span aria-hidden="true">{initial}</span>
    </IconButton>
  );
}
