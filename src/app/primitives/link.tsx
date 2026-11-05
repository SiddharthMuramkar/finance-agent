// The inline link: underlined, so it never reads as plain words (spec A3a, Appendix B).

import Link from "next/link";
import type { ComponentProps } from "react";

/** A navigation link inside a sentence. */
export function TextLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return <Link data-affordance="link" className={`link ${className}`.trim()} {...props} />;
}
