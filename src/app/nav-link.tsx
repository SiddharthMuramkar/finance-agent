"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

// Lives apart from ui.tsx (which stays server-safe) because useLinkStatus is a hook. ui.tsx re-exports it.

/**
 * A ghost page link (ADR 0015): 32px tall, 8px corners, 14/20 at weight 500 in --ink-2, a --wash face on hover. The page
 * showing is ink at weight 600 (the header adds the 2px accent bar under it). Focus is the app's one 2px ring
 * (globals.css). data-force pins hover, press and focus for the button sheet at /dev/widgets#buttons.
 */
const NAV_LINK =
  "relative inline-flex h-8 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium leading-5 text-[var(--ink-2)] transition-colors duration-[var(--dur-ui)] ease-[var(--ease-out)] hover:bg-[var(--wash)] hover:text-[var(--ink)] active:bg-[var(--press)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--ink)] data-[force=hover]:bg-[var(--wash)] data-[force=hover]:text-[var(--ink)] data-[force=pressed]:bg-[var(--press)] data-[force=focus]:outline-2 data-[force=focus]:outline-offset-2 data-[force=focus]:outline-[var(--ring)]";

/**
 * The label, with a hidden bold copy of itself (::after, visibility hidden, so it is in neither textContent nor the
 * accessible name) that holds the bold width: the link is as wide at 500 as at 600, so nothing shifts between pages.
 */
const LABEL = "inline-flex flex-col items-center after:invisible after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)]";

/** A small accent dot in the link's right padding while that Link's page is still loading. It takes no room, so nothing moves. */
function PendingDot() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" data-link-pending={pending ? "true" : undefined} className="absolute right-1 top-[13px] hidden h-1.5 w-1.5 rounded-full bg-[var(--accent)] data-[link-pending=true]:block" />;
}

/**
 * A page link that says when it is loading: a dot inside it carries data-link-pending="true" until the next page is ready.
 * aria-current="page" marks the page showing: pass `current` yourself, or leave it out and the link compares its href to
 * the address. className adds to the ghost look (layout, not colour).
 */
export function NavLink({ current, children, className = "", ...props }: ComponentProps<typeof Link> & { current?: boolean }) {
  const pathname = usePathname();
  const href = typeof props.href === "string" ? props.href : (props.href.pathname ?? "");
  const here = current ?? (pathname !== null && pathname === href);
  return (
    <Link data-affordance="nav" {...props} className={`${NAV_LINK} ${className}`.trim()} aria-current={here ? "page" : undefined}>
      <span data-label={typeof children === "string" ? children : undefined} className={LABEL}>
        {children}
      </span>
      <PendingDot />
    </Link>
  );
}
