"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEvent } from "react";
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
// the brand glyph grows in (4.4), remembered in sessionStorage["vi-grown"]. The Menu sheet and the account menu are native
// popovers (popover="auto", opened by their button's popovertarget): the browser puts them in the top layer and closes
// them on Esc or a press outside, returning focus to the button, so nothing here listens to the document.

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

/** Closes a popover that is open. A browser (or test DOM) without the Popover API never opened one. */
function hide(popover: HTMLElement | null) {
  if (popover && typeof popover.hidePopover === "function" && popover.matches(":popover-open")) popover.hidePopover();
}

/**
 * For a blur in a popover or on its button: when focus moves on to something outside both (Tab or Shift+Tab past either
 * end), the popover closes, so focus never lands on the page under it (WCAG 2.4.11). A press elsewhere is the popover's
 * own light dismiss, and a blur with nowhere to go (the window losing focus) leaves it open.
 */
function closeWhenFocusLeaves(event: FocusEvent, popover: HTMLElement | null, button: HTMLElement | null) {
  const to = event.relatedTarget;
  if (!(to instanceof Node) || popover?.contains(to) || button?.contains(to)) return;
  // Once focus has moved, not while it moves: a popover hidden while it still holds focus hands focus back to its button.
  setTimeout(() => hide(popover));
}

/**
 * The member's avatar and its menu: Course map, Notebook, Account settings, Sign out (a form post, and Clerk's sign-out
 * while Clerk runs). A list of links in Tab order, not an arrow-key menu, so no menu roles. The menu follows its button in
 * the DOM, so Tab goes from the avatar into it. Where anchor positioning runs, it hangs under the avatar by an anchor name
 * of its own (site.css reads --v-account-anchor).
 */
function AccountMenu({ name }: { name: string }) {
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  const menuId = useId();
  const anchor = `--v-account${menuId.replace(/[^\w-]/g, "")}`;
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const leave = (event: FocusEvent) => closeWhenFocusLeaves(event, menu.current, button.current);
  return (
    <div className="v-account" style={{ "--v-account-anchor": anchor } as CSSProperties}>
      {/* An icon control, as the app header's Account menu is: the avatar's face and rim are its signifier (ADR 0018, G38). */}
      <Button
        ref={button}
        unstyled
        className="v-account-btn"
        aria-label={chrome.account}
        data-affordance="icon"
        popoverTarget={menuId}
        aria-controls={menuId}
        aria-expanded={open}
        onBlur={leave}
      >
        <span className="v-avatar" aria-hidden="true">
          {initial}
        </span>
      </Button>
      <div ref={menu} id={menuId} popover="auto" className="v-account-menu" onToggle={(event) => setOpen(event.newState === "open")} onBlur={leave}>
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
    </div>
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
  // The sheet is open for the page it was opened on (its toggle event says when), so a route change closes it.
  const sheet = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  useEffect(() => {
    if (openOn !== null && openOn !== pathname) hide(sheet.current);
  }, [openOn, pathname]);
  // Above 860 px the Menu button steps aside (site.css), so widening the window, or turning a tablet, closes the sheet.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const phone = window.matchMedia("(max-width: 860px)");
    const close = () => {
      if (!phone.matches) hide(sheet.current);
    };
    phone.addEventListener("change", close);
    return () => phone.removeEventListener("change", close);
  }, []);
  const leaveSheet = (event: FocusEvent) => closeWhenFocusLeaves(event, sheet.current, menuButton.current);

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
          <Button
            ref={menuButton}
            unstyled
            className="v-btn v-btn-quiet v-btn-sm v-menu-btn"
            popoverTarget="site-menu"
            aria-expanded={open}
            aria-controls="site-menu"
            onBlur={leaveSheet}
          >
            {open ? chrome.close : chrome.menu}
          </Button>
        </div>
      </div>
      {/* Always in the page, closed until Menu opens it; it comes next in the DOM after the row that ends with Menu, so Tab
          goes from Menu into it. */}
      <nav
        ref={sheet}
        id="site-menu"
        aria-label="Menu"
        className="v-sheet"
        popover="auto"
        onToggle={(event) => setOpenOn(event.newState === "open" ? pathname : null)}
        onBlur={leaveSheet}
      >
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
    </header>
  );
}
