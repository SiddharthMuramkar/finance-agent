// The one button (spec A3a, Appendix B). The look is in globals.css (.btn, .btn-primary ...); this file only picks classes
// and sets data-affordance="button" so the audit can see it. Server-safe: no "use client".

import Link from "next/link";
import type { ComponentProps } from "react";

/** A small spinning ring for work in progress (hidden from screen readers: the control carries aria-busy). */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg data-testid="spinner" aria-hidden="true" viewBox="0 0 16 16" fill="none" className={`h-4 w-4 shrink-0 animate-spin ${className}`}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export type ButtonVariant = "primary" | "secondary" | "danger";
export type ButtonSize = "sm" | "md";

/** The classes of a raised button, for a Link or a form control that should look like one. */
export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `btn btn-${variant}${size === "sm" ? " btn-sm" : ""}`;
}

export const primaryButtonClass = buttonClass("primary");
export const secondaryButtonClass = buttonClass("secondary");

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Work in progress: a spinner shows at once, the button is busy (aria-busy) and ignores presses. */
  loading?: boolean;
  /** A toggle that is on: sets aria-pressed. */
  pressed?: boolean;
  /** Keep the semantics (type, busy, affordance) but not the raised look; the caller styles it (the landing page's links). */
  unstyled?: boolean;
};

/** Primary (blue, once per view), secondary (white) or danger (coral, destructive confirms only); small or medium; with a loading state. type defaults to "button". */
export function Button({ variant = "primary", size = "md", loading, pressed, unstyled, className = "", type = "button", disabled, children, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      data-affordance="button"
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      aria-pressed={pressed}
      className={`${unstyled ? "" : buttonClass(variant, size)} ${className}`.trim()}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/** A next/link Link that looks and reads like a Button. */
export function ButtonLink({ variant = "primary", size = "md", className = "", ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link data-affordance="button" className={`${buttonClass(variant, size)} ${className}`.trim()} {...props} />;
}

/** Blue primary button; every native button prop (type defaults to "button"). */
export function PrimaryButton(props: Omit<ButtonProps, "variant">) {
  return <Button variant="primary" {...props} />;
}

/** White secondary button; every native button prop (type defaults to "button"). */
export function SecondaryButton(props: Omit<ButtonProps, "variant">) {
  return <Button variant="secondary" {...props} />;
}
