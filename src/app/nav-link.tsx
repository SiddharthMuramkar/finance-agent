"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

// Lives apart from ui.tsx (which stays server-safe) because useLinkStatus is a hook. ui.tsx re-exports it.

/** A small dot inside a Link that shows while that Link's navigation is still loading. */
function PendingDot() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" data-link-pending={pending ? "true" : undefined} className="ml-1 hidden h-1.5 w-1.5 rounded-full bg-[var(--brand)] data-[link-pending=true]:inline-block" />;
}

/**
 * A page link that says when it is loading: a dot inside it carries data-link-pending="true" until the next page is ready.
 * aria-current="page" marks the page showing: pass `current` yourself, or leave it out and the link compares its href to the address.
 */
export function NavLink({ current, children, className = "", ...props }: ComponentProps<typeof Link> & { current?: boolean }) {
  const pathname = usePathname();
  const href = typeof props.href === "string" ? props.href : (props.href.pathname ?? "");
  const here = current ?? (pathname !== null && pathname === href);
  return (
    <Link data-affordance="nav" {...props} className={`chip ${className}`.trim()} aria-current={here ? "page" : undefined}>
      {children}
      <PendingDot />
    </Link>
  );
}
