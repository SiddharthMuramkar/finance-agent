import "./site.css";
import type { ReactNode } from "react";
import Link from "next/link";
import { BRAND, chrome, NAV } from "@/site/copy";
import { SiteJoinEvents } from "@/site/join-events";
import type { Viewer } from "@/site/viewer";
import { Glyph } from "./parts";
import { RouteFocus } from "./route-focus";
import { SiteNav } from "./site-nav";

// The public chrome (spec 4.1 to 4.3): skip link, sticky nav, main and footer, shared by the (site) layout and the
// sign-in page. Each caller reads the viewer and passes it in, so the nav always knows who is there. Each control says
// what kind it is (`data-affordance`, as the app's primitives do), so the browser audits can judge it (ADR 0018).

/** The footer (4.3): brand, links (Sign in for visitors) and the line. */
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
            <Link href="/login" data-affordance="nav">
              {chrome.signIn}
            </Link>
          )}
        </nav>
        <p className="v-fine">{chrome.footer}</p>
      </div>
    </footer>
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
