// Shared look pieces of the design system (finance-agent-ui-spec.md, issue #43). Colours come only from
// the tokens in globals.css, so light and dark mode need no per-piece variants. Server-safe: no
// "use client" here; the only client pieces rendered are ThemeMenu, AccountMenu and NavLink.

import Link from "next/link";
import type { ReactNode } from "react";
import { AccountMenu } from "./account-menu";
import { NavLink } from "./nav-link";
import { Button, Tag } from "./primitives";
import type { ThemePref } from "./theme";
import { ThemeMenu } from "./theme-menu";


/** Small uppercase label above a block (spec §2), e.g. "SPACED REVIEW". className adds spacing. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-[var(--muted)] ${className}`}>{children}</p>;
}

/** A small chevron for a disclosure's summary: it turns a quarter turn when its <details> (class "group") is open. */
export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-open:rotate-90 ${className}`}>
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

/** Bordered section (spec §5.1): 1px border, radius 8, padding 12. className adds layout. */
export function Card({ children, className = "", ...props }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`rounded-lg border border-[var(--border)] p-3 ${className}`} {...props}>
      {children}
    </section>
  );
}

/** Provenance callout (spec §5.2): tag, label, bold value, optional ISO date and, for sourced ones, a source link. */
export function Callout({
  kind,
  label,
  value,
  date,
  source,
}: {
  kind: "you" | "src";
  label: ReactNode;
  value: ReactNode;
  date?: string;
  source?: { href: string; text: string };
}) {
  const look = kind === "you" ? "border-[var(--you-line)] bg-[var(--you-tint)]" : "border-[var(--src-line)] bg-[var(--src-tint)]";
  return (
    <div className={`mb-2 rounded-md border-l-4 p-2 text-sm leading-5 ${look}`}>
      <Tag kind={kind} /> {label} <span className="font-bold">{value}</span>
      {date && <span className="text-xs text-[var(--muted)]"> ({date})</span>}
      {source && (
        <p className="text-xs leading-4 text-[var(--muted)]">
          Source:{" "}
          <a href={source.href} className="underline hover:text-[var(--brand)]">
            {source.text}
          </a>
        </p>
      )}
    </div>
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

/** Who the header's account menu names: the signed-in Learner, with their email once Google sign-in supplies one. */
export type HeaderAccount = { name: string; email?: string };

const HEADER_LINKS: { page: HeaderPage; href: string; label: string }[] = [
  { page: "workspace", href: "/study", label: "Study" },
  { page: "course", href: "/course", label: "Course Map" },
  { page: "notebook", href: "/notebook", label: "Notebook" },
];

// The page links are chips (NavLink adds the raised look); here only their size changes with the window.
const headerLink = "whitespace-nowrap px-2 text-[13px] leading-5 lg:px-3 lg:text-sm";
const idleLink = headerLink;
const currentLink = headerLink;

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

/** The brand mark: a small rising line in a rounded square, decorative (the words beside it name the link). */
function BrandMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5 shrink-0 text-[var(--brand)]">
      <rect x="1" y="1" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 13.5 8.5 10l2.5 2.5L15 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A gear, for the Settings icon link: decorative (the link's name is Settings). */
function GearMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * App header (spec #77, A5): h1 "Finance Agent" (a mark and the words) linking to Home, three page pills (Study, Course Map,
 * Notebook; the current one filled and aria-current, each with a dot while its page loads), then pushed right three round
 * icons: the Theme menu, a gear to Settings and the account menu. current = the page showing; theme from readTheme();
 * account names the signed-in Learner (left out only by the loading skeleton and the signed-out 404). One line from 1024px.
 */
export function AppHeader({ current, theme, account, className = "" }: { current?: HeaderPage; theme: ThemePref; account?: HeaderAccount; className?: string }) {
  return (
    <header className={`flex h-[var(--header-h)] shrink-0 items-center gap-2 border-b border-[var(--hairline)] lg:gap-4 ${className}`}>
      <h1 className="whitespace-nowrap text-lg font-semibold leading-7">
        <Link href="/" title="Home" data-affordance="nav" className="chip gap-1.5 px-3 text-base font-semibold">
          <BrandMark />
          Finance Agent
        </Link>
      </h1>
      <nav aria-label="Pages" className="flex items-center gap-0.5 lg:gap-1">
        {HEADER_LINKS.map(({ page, href, label }) => (
          // The two pages a Learner returns to most are fetched ahead, so they open at once.
          <NavLink key={href} href={href} current={page === current} prefetch={page === "workspace" || page === "course" ? true : undefined} className={page === current ? currentLink : idleLink}>
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1 lg:gap-2">
        <ThemeMenu initial={theme} />
        <Link href="/settings" aria-label="Settings" title="Settings" aria-current={current === "settings" ? "page" : undefined} data-affordance="icon" className="btn btn-icon">
          <GearMark />
        </Link>
        {account && <AccountMenu name={account.name} email={account.email} />}
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
    <main className="mx-auto w-full max-w-[var(--page-max)] px-[var(--gutter)] pb-12 pt-3">
      <AppHeader current={current} theme={theme} account={account} />
      <div data-testid="reading-column" className="w-full pt-3">
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
