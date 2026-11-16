"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { JOIN_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "@/auth/destination";
import { BRAND, chrome, NAV } from "@/site/copy";
import type { Viewer } from "@/site/viewer";
import { Button } from "../primitives";
import { SignOutForm } from "../sign-out";
import { ThemeSwitch } from "../theme-switch";
import { ContinueButton, PrimaryCta } from "./cta";
import { Glyph } from "./parts";

// The sticky nav (spec 4.2): brand, page links, and the right side by viewer state. At 860 px and below the links give way
// to a Menu button and its sheet. The hairline under it shows once the page has scrolled 4 px. On a session's first load
// the brand glyph grows in (4.4), remembered in sessionStorage["vi-grown"].

const under = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

/** The page link that is showing: a case page counts as Examples. */
export function currentLink(pathname: string): string | undefined {
  return NAV.find((link) => under(pathname, link.href))?.href;
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

/** The member's avatar and its menu: Course map, Notebook, Account settings, Sign out (a form post, and Clerk's sign-out while Clerk runs). */
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
        <SignOutForm>
          <Button type="submit" unstyled>
            {chrome.signOut}
          </Button>
        </SignOutForm>
      </div>
    </details>
  );
}

export function SiteNav({ viewer }: { viewer: Viewer }) {
  // No router (a static render in a test) reads as no page showing.
  const pathname = usePathname() ?? "";
  const current = currentLink(pathname);
  // On the sign-in pages (issue #33) the page's own form is its one primary (5), so a visitor's nav there has no Join
  // early access: on /sign-in (and Clerk's steps under it) Sign in is the page showing, and on the joining flow (/join,
  // Clerk's Waitlist, and /sign-up, where its invitation lands) a Join would only lead back to the same task.
  const onSignIn = under(pathname, SIGN_IN_PATH);
  const onJoin = under(pathname, JOIN_PATH) || under(pathname, SIGN_UP_PATH);
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
              <Link href={SIGN_IN_PATH} className="v-tlink ink v-signin" aria-current={onSignIn ? "page" : undefined} data-affordance="nav">
                {chrome.signIn}
              </Link>
              {!onSignIn && !onJoin && <PrimaryCta viewer={viewer} size="md" />}
            </>
          )}
          {viewer.state === "member" && (
            <>
              <ContinueButton button={viewer.button} />
              <AccountMenu name={viewer.name} />
            </>
          )}
          {/* ADR 0019: the sun/moon switch. At 860 px and below it moves into the Menu sheet, with a word beside it. */}
          <ThemeSwitch className="v-btn v-btn-quiet v-btn-sm v-theme-btn" />
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
            <Link href={SIGN_IN_PATH} aria-current={onSignIn ? "page" : undefined} data-affordance="nav">
              {chrome.signIn}
            </Link>
          )}
          <ThemeSwitch className="v-sheet-theme" text={chrome.theme} />
        </nav>
      )}
    </header>
  );
}
