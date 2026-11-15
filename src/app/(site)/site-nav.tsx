"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND, chrome, NAV } from "@/site/copy";
import type { Viewer } from "@/site/viewer";
import { Button } from "../primitives";
import { ContinueButton, PrimaryCta } from "./cta";
import { Glyph, Pill } from "./parts";

// The sticky nav (spec 4.2): brand, page links, and the right side by viewer state. At 860 px and below the links give way
// to a Menu button and its sheet. The hairline under it shows once the page has scrolled 4 px. On a session's first load
// the brand glyph grows in (4.4), remembered in sessionStorage["vi-grown"].

/** The page link that is showing: a case page counts as Examples. */
export function currentLink(pathname: string): string | undefined {
  return NAV.find((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))?.href;
}

const onScroll = (notify: () => void) => {
  window.addEventListener("scroll", notify, { passive: true });
  return () => window.removeEventListener("scroll", notify);
};

/** Whether the page has scrolled more than 4 px (false on the server). */
function useScrolled() {
  return useSyncExternalStore(
    onScroll,
    () => window.scrollY > 4,
    () => false,
  );
}

/** True on the first page a session loads, once: the brand glyph grows in then. */
function useFirstVisit() {
  const [grow, setGrow] = useState(false);
  useEffect(() => {
    let first = false;
    try {
      first = !sessionStorage.getItem("vi-grown");
      sessionStorage.setItem("vi-grown", "1");
    } catch {
      // No storage (a private window): the glyph simply does not grow.
    }
    if (first) requestAnimationFrame(() => setGrow(true));
  }, []);
  return grow;
}

/** The member's avatar and its menu: Course map, Notebook, Account settings, Sign out (a plain form post). */
function AccountMenu({ name }: { name: string }) {
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    <details className="v-account">
      <summary aria-label={chrome.account}>
        <span className="v-avatar" aria-hidden="true">
          {initial}
        </span>
      </summary>
      <div className="v-account-menu">
        <p className="name">{name}</p>
        {chrome.accountLinks.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
        <form action="/api/logout" method="post">
          <Button type="submit" unstyled>
            {chrome.signOut}
          </Button>
        </form>
      </div>
    </details>
  );
}

export function SiteNav({ viewer }: { viewer: Viewer }) {
  // No router (a static render in a test) reads as no page showing.
  const pathname = usePathname() ?? "";
  const current = currentLink(pathname);
  const scrolled = useScrolled();
  const grow = useFirstVisit();
  // The sheet is open for the page it was opened on, so a route change closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  return (
    <header className={`v-nav${scrolled ? " scrolled" : ""}`} data-site-section="nav">
      <div className="v-wrap v-nav-row">
        <Link href="/" className="v-brand" data-affordance="nav">
          <Glyph size={22} grow={grow} />
          {BRAND}
        </Link>
        <nav aria-label="Main" className="v-navlinks">
          {NAV.map((link) => (
            <Link key={link.href} href={link.href} aria-current={current === link.href ? "page" : undefined} data-affordance="nav">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="v-nav-right">
          {viewer.state === "visitor" && (
            <>
              <Link href="/login" className="v-tlink ink v-signin" data-affordance="nav">
                {chrome.signIn}
              </Link>
              <PrimaryCta viewer={viewer} size="md" />
            </>
          )}
          {viewer.state === "applicant" && (
            <Link href="/login" className="v-status-link" data-affordance="nav">
              <Pill tone="wait">
                <span className="v-dot" aria-hidden="true" />
                {chrome.inReview}
              </Pill>
            </Link>
          )}
          {viewer.state === "member" && (
            <>
              <ContinueButton button={viewer.button} />
              <AccountMenu name={viewer.name} />
            </>
          )}
          <Button unstyled className="v-btn v-btn-quiet v-btn-sm v-menu-btn" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpenOn(open ? null : pathname)}>
            {open ? chrome.close : chrome.menu}
          </Button>
        </div>
      </div>
      {open && (
        <nav id="site-menu" aria-label="Menu" className="v-sheet">
          <Link href="/" data-affordance="nav">
            {chrome.home}
          </Link>
          {NAV.map((link) => (
            <Link key={link.href} href={link.href} aria-current={current === link.href ? "page" : undefined} data-affordance="nav">
              {link.label}
            </Link>
          ))}
          {viewer.state === "visitor" && (
            <Link href="/login" data-affordance="nav">
              {chrome.signIn}
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
