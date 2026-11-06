// The inline link: underlined, so it never reads as plain words (spec A3a, Appendix B).

import Link from "next/link";
import type { ComponentProps } from "react";

/** A navigation link inside a sentence. */
export function TextLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return <Link data-affordance="link" className={`link ${className}`.trim()} {...props} />;
}

/** A button that reads as a link: underlined, no button chrome. For a small action beside text (Edit, Delete, Undo) or a row title that posts a form. */
export function LinkButton({ className = "", type = "button", ...props }: ComponentProps<"button">) {
  return <button type={type} data-affordance="link" className={`link link-button ${className}`.trim()} {...props} />;
}
