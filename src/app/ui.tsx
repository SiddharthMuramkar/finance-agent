// Shared look pieces of the design system (ADR 0013, issue #43). Colours come only from the tokens in
// globals.css, so Light and Dark need no per-piece variants. Server-safe: no "use client" here; the only
// client pieces rendered are ThemeToggle, AccountMenu and NavLink.

import Link from "next/link";
import type { ReactNode } from "react";
import { AccountMenu } from "./account-menu";
import { NavLink } from "./nav-link";
import { Button, Tag } from "./primitives";
import { RisingBars } from "./rising-bars";
import type { ThemePref } from "./theme";
import { ThemeToggle } from "./theme-toggle";


/**
 * Small uppercase label above a block (spec §2), e.g. "SPACED REVIEW", in the key-number blue: the eyebrow is one of the
 * blue marks in a reading area (spec 2026-11-12 F2, ADR 0022). It is never pressable. className adds spacing.
 */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`type-eyebrow text-key-number ${className}`}>{children}</p>;
}

/** A small chevron for a disclosure's summary: it turns a quarter turn when its <details> (class "group") is open. */
export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 shrink-0 transition-transform duration-[var(--dur-ui)] group-open:rotate-90 ${className}`}>
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  );
}

// The look pieces live in src/app/primitives (ticket A3a); the old names keep working from here.
export {
  Button,
  ButtonLink,
  Chip,
  IconButton,
  LinkButton,
  Pill,
  PrimaryButton,
  SecondaryButton,
  Spinner,
  Tag,
  TextLink,
  primaryButtonClass,
  secondaryButtonClass,
} from "./primitives";
export type { ButtonProps, ChipState } from "./primitives";

export { NavLink };

/**
 * A section of a reading page (ADR 0013: hairlines, not boxes). "box" is a page's one framed panel: a hairline edge, 12px
 * corners, the raised surface and 20px padding. "rule" is a 1px --line hairline above, no box (it was an ink rule). className adds layout.
 */
export function Card({ variant = "box", children, className = "", ...props }: { variant?: "box" | "rule"; children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  const look = variant === "rule" ? "border-t border-[var(--line)] pt-5" : "rounded-xl border border-[var(--rule)] bg-[var(--raised)] p-5";
  return (
    <section className={`${look} ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}

/** One label/value row (spec §5.6): label muted left, value right; tag adds a provenance tag before the label. Stack rows in a list. */
export function KeyValueRow({ label, value, tag }: { label: ReactNode; value: ReactNode; tag?: "you" | "src" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--hairline)] py-2 text-sm leading-5 last:border-b-0">
      <span className="text-[var(--muted)]">
        {tag && <Tag kind={tag} />}
        {label}
      </span>
      <span className="font-medium text-[var(--ink)]">{value}</span>
    </div>
  );
}

export type HeaderPage = "workspace" | "course" | "notebook" | "settings";

/**
 * Who the header's account menu names: the signed-in Learner, with the email of their Google or email-link account when
 * linked, and, for the owner only, `admin`: how many people wait on /admin (see accountFor).
 */
export type HeaderAccount = { name: string; email?: string; admin?: { waiting: number } };

const HEADER_LINKS: { page: HeaderPage; href: string; label: string }[] = [
  { page: "workspace", href: "/study", label: "Study" },
  { page: "course", href: "/course", label: "Course Map" },
  { page: "notebook", href: "/notebook", label: "Notebook" },
];

// A header slot that can be the page showing (a page link's <li>, the gear's wrapper): it runs the header's full height,
// and when data-current="true" its ::after is a 2px accent bar laid over the header's bottom hairline (Highlight in
// forced colours). The bar sits on the slot, not on the 32px control, so it can reach the hairline.
const TAB =
  "relative flex items-center after:pointer-events-none after:absolute after:-bottom-px after:h-0.5 data-[current=true]:after:bg-[var(--accent)] forced-colors:after:forced-color-adjust-none forced-colors:data-[current=true]:after:bg-[Highlight]";

// The wordmark: the still bars and "Value It" in Inter Tight, a ghost 32px link (a wash on hover), no pill. -ml-2 lines the
// bars up with the page's left edge, the padding being only the hover face.
const BRAND_LINK =
  "-ml-2 inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-lg px-2 font-[family-name:var(--font-display)] text-base font-semibold leading-6 tracking-[-0.02em] text-[var(--ink)] transition-colors duration-[var(--dur-ui)] ease-[var(--ease-out)] hover:bg-[var(--wash)]";

/**
 * Sign out: a plain form posting to /api/logout (its 303 reloads the page), never a link (a GET could be
 * prefetched) or next/form (it turns the action into a GET). className styles the button; children replace "Sign out".
 */
export function SignOutButton({ className = "", children = "Sign out", unstyled }: { className?: string; children?: ReactNode; unstyled?: boolean }) {
  return (
    <form action="/api/logout" method="post" className="contents">
      <Button type="submit" variant="secondary" size="sm" unstyled={unstyled} className={className}>
        {children}
      </Button>
    </form>
  );
}

/** A gear (Lucide's settings, stroke 1.75), for the Settings icon link: decorative (the link's name is Settings). */
function GearMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * App header (ADR 0013, ticket A5): 56px, on the paper, over a 1px --rule hairline. At the left the h1 wordmark (the still
 * bars and "Value It", no pill) linking to Home, then three ghost page links (Study, Course Map, Notebook; each with a dot
 * while its page loads). Pushed right, three 32px ghost icons with tooltips: the theme toggle, a gear to Settings and the
 * account menu. The page showing (a page link, or the gear on Settings) is marked three ways: aria-current, ink, and a 2px
 * accent bar on the hairline under it. current = the page showing; theme from readTheme(); account names the signed-in
 * Learner (left out only by the loading skeleton and the signed-out 404). One line from 768px.
 */
export function AppHeader({ current, theme, account, className = "" }: { current?: HeaderPage; theme: ThemePref; account?: HeaderAccount; className?: string }) {
  return (
    // Above what follows it (relative z-30): the account menu drops over the Study Workspace's Topic bar, a positioned Band.
    <header className={`relative z-30 flex h-[var(--header-h)] shrink-0 items-center gap-3 border-b border-[var(--rule)] bg-[var(--paper)] lg:gap-6 ${className}`}>
      <h1 className="flex shrink-0 items-center">
        <Link href="/" title="Home" data-affordance="nav" className={BRAND_LINK}>
          <RisingBars size={16} className="bars-still" />
          Value It
        </Link>
      </h1>
      <nav aria-label="Pages" className="flex self-stretch">
        <ul className="flex items-stretch gap-1">
          {HEADER_LINKS.map(({ page, href, label }) => (
            <li key={href} data-current={page === current ? "true" : undefined} className={`${TAB} after:inset-x-3`}>
              {/* The two pages a Learner returns to most are fetched ahead, so they open at once. */}
              <NavLink href={href} current={page === current} prefetch={page === "workspace" || page === "course" ? true : undefined}>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="ml-auto flex items-center gap-1 self-stretch">
        <ThemeToggle initial={theme} />
        <span data-current={current === "settings" ? "true" : undefined} className={`${TAB} self-stretch after:inset-x-1.5`}>
          {/* On Settings the gear is ink with the bar, like a current page link, not the tinted face of a pressed icon. */}
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            aria-current={current === "settings" ? "page" : undefined}
            data-affordance="icon"
            className="btn btn-icon aria-[current=page]:[--face:transparent] aria-[current=page]:[--label:var(--ink)]"
          >
            <GearMark />
          </Link>
        </span>
        {account && <AccountMenu name={account.name} email={account.email} admin={account.admin} />}
      </div>
    </header>
  );
}

/**
 * Page shell for the reading pages (Course Map, Notebook, Settings, Passage): the header and the
 * content share the workspace's one box (the page's gutters, up to --page-max), so the title and nav stay put between
 * pages and the content uses the whole window. Running paragraphs inside cards cap themselves with `measure`.
 */
export function ReadingPage({ current, theme, account, children }: { current?: HeaderPage; theme: ThemePref; account?: HeaderAccount; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[var(--page-max)] px-[var(--gutter)] pb-16">
      <AppHeader current={current} theme={theme} account={account} />
      {/* ADR 0013: the header sits flush at the top; the content starts 32px under its hairline, the page ends on 64px of air. */}
      <div data-testid="reading-column" className="w-full pt-8">
        {children}
      </div>
    </main>
  );
}

export const PHONE_NOTE = "The Study Workspace needs a bigger screen. Open it on a laptop or an iPad.";

/**
 * Wraps a signed-in page: below 768px only the phone note shows; from 768px the children render as if
 * the wrapper were not there (display: contents), so full-height and window-scrolling pages both work.
 */
export function SignedInFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <p className="p-6 text-sm leading-5 text-[var(--muted)] md:hidden">{PHONE_NOTE}</p>
      <div className="hidden md:contents">{children}</div>
    </>
  );
}
