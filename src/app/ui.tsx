// Shared look pieces of the design system (finance-agent-ui-spec.md, issue #43). Colours come only from
// the tokens in globals.css, so light and dark mode need no per-piece variants. Server-safe: no
// "use client" here; the only client piece rendered is ThemeMenu.

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { NavLink } from "./nav-link";
import type { ThemePref } from "./theme";
import { ThemeMenu } from "./theme-menu";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

/** Provenance tag (spec §5.2). kind "you" = the Learner's assumption (teal), "src" = a sourced fact (amber); children replace the default words. */
export function Tag({ kind, children }: { kind: "you" | "src"; children?: ReactNode }) {
  const look = kind === "you" ? "bg-[var(--you-tag)] text-[var(--you-tag-ink)]" : "bg-[var(--src-tag)] text-[var(--src-tag-ink)]";
  return (
    <span className={`mr-1 inline-block rounded px-1.5 text-[11px] font-medium uppercase leading-4 tracking-[0.025em] ${look}`}>
      {children ?? (kind === "you" ? "Your assumption" : "Sourced")}
    </span>
  );
}

/** Small uppercase label above a block (spec §2), e.g. "SPACED REVIEW". className adds spacing. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-[var(--muted)] ${className}`}>{children}</p>;
}

/** Rounded label (spec §5.6). brand = navy tint and line; otherwise neutral grey. */
export function Pill({ brand, children, className = "" }: { brand?: boolean; children: ReactNode; className?: string }) {
  const look = brand ? "border border-[var(--brand-line)] bg-[var(--brand-tint)] text-[var(--brand)]" : "bg-[var(--hairline)] text-[var(--ink)]";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium leading-4 ${look} ${className}`}>{children}</span>;
}

/** A small spinning ring for work in progress (hidden from screen readers: the control carries aria-busy). */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg data-testid="spinner" aria-hidden="true" viewBox="0 0 16 16" fill="none" className={`h-4 w-4 shrink-0 animate-spin ${className}`}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export type ChipState = "idle" | "showing" | "drawing";

/**
 * Small selectable button (spec §4 widget chip), at least 28px tall. state: idle, showing (its item is on screen) or
 * drawing (its item is being made: a spinner and aria-busy). active is the older spelling of state="showing".
 */
export function Chip({
  active,
  state,
  className = "",
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; state?: ChipState }) {
  const now: ChipState = state ?? (active ? "showing" : "idle");
  const look =
    now === "showing"
      ? "border-[var(--brand-line)] bg-[var(--brand-tint)] text-[var(--brand)]"
      : now === "drawing"
        ? "border-[var(--brand-line)] text-[var(--brand)]"
        : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--brand-line)] hover:bg-[var(--brand-tint)] hover:text-[var(--brand)]";
  return (
    <button
      type={type}
      aria-pressed={state === undefined ? (active ?? undefined) : now === "showing"}
      aria-busy={now === "drawing" ? true : undefined}
      data-state={now}
      className={`pressable inline-flex min-h-7 items-center gap-1.5 rounded border px-2 py-1 text-xs leading-4 ${focusRing} ${look} ${className}`}
      {...props}
    >
      {now === "drawing" && <Spinner className="h-3 w-3" />}
      {children}
    </button>
  );
}

/** Classes of the navy primary button (spec §4), for a next/link Link that should look like one. */
export const primaryButtonClass = `pressable inline-flex items-center justify-center rounded bg-[var(--brand)] px-4 py-2 text-sm font-medium leading-5 text-[var(--brand-ink)] [--pressed-bg:var(--brand-pressed)] hover:bg-[var(--brand-hover)] disabled:opacity-50 disabled:hover:bg-[var(--brand)] ${focusRing}`;

/** Classes of the outlined secondary button (spec §4), for a next/link Link that should look like one. */
export const secondaryButtonClass = `pressable inline-flex items-center justify-center rounded border border-[var(--border)] px-4 py-2 text-sm leading-5 text-[var(--ink)] hover:bg-[var(--hairline)] disabled:opacity-50 disabled:hover:bg-transparent ${focusRing}`;

/** Classes of the ghost button: no border, muted text, a hairline wash on hover. */
export const ghostButtonClass = `pressable inline-flex items-center justify-center rounded px-4 py-2 text-sm leading-5 text-[var(--muted)] hover:bg-[var(--hairline)] hover:text-[var(--ink)] disabled:opacity-50 disabled:hover:bg-transparent ${focusRing}`;

export type ButtonProps = React.ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  /** Work in progress: a spinner shows at once, the button is busy (aria-busy) and ignores presses. */
  loading?: boolean;
  /** A toggle that is on: sets aria-pressed. */
  pressed?: boolean;
};

const VARIANT_CLASS = { primary: primaryButtonClass, secondary: secondaryButtonClass, ghost: ghostButtonClass };

/** The one button: primary (navy), secondary (outlined) or ghost, small or medium, with a loading state. Every native button prop passes through; type defaults to "button". */
export function Button({ variant = "primary", size = "md", loading, pressed, className = "", type = "button", disabled, children, ...props }: ButtonProps) {
  const sizing = size === "sm" ? "min-h-8 px-3! py-1!" : "min-h-9";
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      aria-pressed={pressed}
      className={`${VARIANT_CLASS[variant]} ${sizing} gap-2 ${loading ? "disabled:opacity-100" : ""} ${className}`}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/** Navy primary button; every native button prop (type defaults to "button", disabled, onClick, className...). */
export function PrimaryButton({ className = "", type = "button", ...props }: React.ComponentProps<"button">) {
  return <button type={type} className={`${primaryButtonClass} ${className}`} {...props} />;
}

/** Outlined secondary button; every native button prop (type defaults to "button"). */
export function SecondaryButton({ className = "", type = "button", ...props }: React.ComponentProps<"button">) {
  return <button type={type} className={`${secondaryButtonClass} ${className}`} {...props} />;
}

/** A small chevron for a disclosure's summary: it turns a quarter turn when its <details> (class "group") is open. */
export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-open:rotate-90 ${className}`}>
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  );
}

export { IconButton } from "./icon-button";

export { NavLink };

/** Bordered section (spec §5.1): 1px border, radius 8, padding 16. className adds layout. */
export function Card({ children, className = "", ...props }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`rounded-lg border border-[var(--border)] p-4 ${className}`} {...props}>
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

export type HeaderPage = "workspace" | "course" | "progress" | "sessions" | "notes" | "settings";

const HEADER_LINKS: { page: HeaderPage; href: string; label: string }[] = [
  { page: "workspace", href: "/study", label: "Study Workspace" },
  { page: "course", href: "/course", label: "Course Map" },
  { page: "progress", href: "/progress", label: "Progress" },
  { page: "sessions", href: "/sessions", label: "Past Sessions" },
  { page: "notes", href: "/notes", label: "Notes" },
  { page: "settings", href: "/settings", label: "Settings" },
];

const headerLink = `pressable inline-flex min-h-8 items-center whitespace-nowrap rounded-full px-1 text-[13px] leading-5 lg:px-3 lg:text-sm ${focusRing}`;
const idleLink = `${headerLink} text-[var(--muted)] hover:bg-[var(--hairline)] hover:text-[var(--ink)]`;
const currentLink = `${headerLink} bg-[var(--brand-tint)] font-medium text-[var(--brand)]`;

/**
 * Sign out: a plain form posting to /api/logout (its 303 reloads the page), never a link (a GET could be
 * prefetched) or next/form (it turns the action into a GET). className styles the button; children replace "Sign out".
 */
export function SignOutButton({ className = "", children = "Sign out" }: { className?: string; children?: ReactNode }) {
  return (
    <form action="/api/logout" method="post" className="contents">
      <button type="submit" className={className}>
        {children}
      </button>
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

/**
 * App header (spec #77): h1 "Finance Agent" (a mark and the words) linking to Home, the page links as pills (the current one
 * filled and aria-current; each shows a dot while its page loads), a divider, the Theme menu, and Sign out as a small
 * outlined button. current = the page showing; theme from readTheme(). Sizes tighten below 1024px to keep one line from 768px.
 */
export function AppHeader({ current, theme, className = "" }: { current?: HeaderPage; theme: ThemePref; className?: string }) {
  return (
    <header className={`flex items-center justify-between gap-2 lg:gap-4 ${className}`}>
      <h1 className="whitespace-nowrap text-lg font-semibold leading-7">
        <Link href="/" title="Home" className={`-ml-2 inline-flex items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-[var(--hairline)] hover:text-[var(--brand)] ${focusRing}`}>
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
        <span aria-hidden="true" className="mx-2 hidden h-5 w-px bg-[var(--border)] lg:block" />
        <ThemeMenu initial={theme} />
        <SignOutButton className={`${secondaryButtonClass} min-h-8 lg:ml-1 px-2! py-1! text-[13px] lg:px-3! lg:text-sm`} />
      </nav>
    </header>
  );
}

/**
 * Page shell for the reading pages (Course Map, Progress, Past Sessions, Notes, Settings, Passage): the header sits in the
 * same 6xl box as the workspace's, so the title and nav stay put between pages, and only the content
 * below it uses the narrower reading column.
 */
export function ReadingPage({ current, theme, children }: { current?: HeaderPage; theme: ThemePref; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-12 pt-4 lg:px-6 lg:pt-6">
      <AppHeader current={current} theme={theme} className="mb-6" />
      <div data-testid="reading-column" className="mx-auto max-w-2xl">
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
