import "./site.css";
import type { ReactNode } from "react";
import Link from "next/link";
import { SIGN_IN_PATH } from "@/auth/destination";
import { BRAND, chrome, legal, NAV } from "@/site/copy";
import { SiteJoinEvents } from "@/site/join-events";
import type { Viewer } from "@/site/viewer";
import { ContactAddress } from "./legal-page";
import { Glyph } from "./parts";
import { RouteFocus } from "./route-focus";
import { SiteNav } from "./site-nav";

// The public chrome (spec 4.1 to 4.3): skip link, sticky nav, main and footer, shared by the (site) layout and the
// sign-in pages (/sign-in, /sign-up and /join). Each caller reads the viewer and passes it in, so the nav always knows
// who is there. Each control says what kind it is (`data-affordance`, as the app's primitives do), so the browser audits
// can judge it (ADR 0018).

/** The footer (4.3): brand, links (Sign in for visitors), the line, then Privacy, Terms and the contact address (#77). */
export function SiteFooter({ viewer }: { viewer: Viewer }) {
  return (
    <footer className="v-footer">
      <div className="v-wrap v-footer-row">
        <Link href="/" className="v-brand" data-affordance="nav">
          <Glyph size={20} />
          {BRAND}
        </Link>
        <nav aria-label="Footer">
          {NAV.map((link) => (
            <Link key={link.href} href={link.href} data-affordance="nav">
              {link.label}
            </Link>
          ))}
          {viewer.state === "visitor" && (
            <Link href={SIGN_IN_PATH} data-affordance="nav">
              {chrome.signIn}
            </Link>
          )}
        </nav>
        <p className="v-fine">{chrome.footer}</p>
      </div>
      <div className="v-wrap v-footer-row v-fine">
        <LegalLinks />
      </div>
    </footer>
  );
}

/** Privacy and Terms, and the contact address as text (issue #77): the footer's last row and /join's line. */
export function LegalLinks() {
  return (
    <p className="v-legal-links">
      {legal.links.map((link) => (
        <Link key={link.href} href={link.href} className="link" data-affordance="link">
          {link.label}
        </Link>
      ))}
      <span>
        {legal.contact}: <ContactAddress />
      </span>
    </p>
  );
}

/** The whole page around `children`: the skip link first (9.3), then the nav, `<main id="main">` and the footer. */
export function SiteShell({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  return (
    <div className="site">
      <a href="#main" className="v-skip" data-affordance="button">
        {chrome.skip}
      </a>
      <SiteNav viewer={viewer} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter viewer={viewer} />
      <RouteFocus />
      <SiteJoinEvents />
    </div>
  );
}
