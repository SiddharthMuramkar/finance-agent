// Shared look pieces of the design system (finance-agent-ui-spec.md, issue #43). Colours come only from
// the tokens in globals.css, so light and dark mode need no per-piece variants. Server-safe: no
// "use client" here; the only client piece rendered is ThemeToggle.

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ThemeToggle, type Theme } from "./theme-toggle";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]";

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

/** Small selectable button (spec §4 widget chip). active = its item is showing; takes every native button prop. */
export function Chip({ active, className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  const look = active
    ? "border-[var(--brand-line)] bg-[var(--brand-tint)] text-[var(--brand)]"
    : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--brand-line)] hover:bg-[var(--brand-tint)] hover:text-[var(--brand)]";
  return (
    <button
      type={type}
      aria-pressed={active ?? undefined}
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs leading-4 transition-colors duration-200 ${focusRing} ${look} ${className}`}
      {...props}
    />
  );
}

/** Classes of the navy primary button (spec §4), for a next/link Link that should look like one. */
export const primaryButtonClass = `inline-flex items-center justify-center rounded bg-[var(--brand)] px-4 py-2 text-sm font-medium leading-5 text-[var(--brand-ink)] transition-colors duration-200 hover:bg-[var(--brand-hover)] disabled:opacity-50 disabled:hover:bg-[var(--brand)] ${focusRing}`;

/** Classes of the outlined secondary button (spec §4), for a next/link Link that should look like one. */
export const secondaryButtonClass = `inline-flex items-center justify-center rounded border border-[var(--border)] px-4 py-2 text-sm leading-5 text-[var(--ink)] transition-colors duration-200 hover:bg-[var(--hairline)] disabled:opacity-50 disabled:hover:bg-transparent ${focusRing}`;

/** Navy primary button; every native button prop (type defaults to "button", disabled, onClick, className...). */
export function PrimaryButton({ className = "", type = "button", ...props }: React.ComponentProps<"button">) {
  return <button type={type} className={`${primaryButtonClass} ${className}`} {...props} />;
}

/** Outlined secondary button; every native button prop (type defaults to "button"). */
export function SecondaryButton({ className = "", type = "button", ...props }: React.ComponentProps<"button">) {
  return <button type={type} className={`${secondaryButtonClass} ${className}`} {...props} />;
}

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

const headerLink = `whitespace-nowrap text-sm leading-5 transition-colors duration-200 ${focusRing}`;
const mutedLink = `${headerLink} text-[var(--muted)] hover:text-[var(--ink)]`;

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

/**
 * App header (spec #77): h1 "Finance Agent" linking to Home, the page links (Settings last), Dark mode, Sign out. current = the
 * page showing (aria-current); theme from readTheme(). Gaps tighten to 8px below 1024px to keep one line from 768px.
 */
export function AppHeader({ current, theme, className = "" }: { current?: HeaderPage; theme: Theme; className?: string }) {
  // The two buttons share the links' look, with the padding that gives them the same height.
  const mutedButton = `py-2 ${mutedLink}`;
  return (
    <header className={`flex items-center justify-between gap-2 lg:gap-4 ${className}`}>
      <h1 className="whitespace-nowrap text-lg font-semibold leading-7">
        <Link href="/" className={`hover:text-[var(--brand)] ${focusRing}`}>Finance Agent</Link>
      </h1>
      <nav aria-label="Pages" className="flex items-center gap-2 lg:gap-4">
        {HEADER_LINKS.map(({ page, href, label }) =>
          page === current ? (
            <Link key={href} href={href} aria-current="page" className={`${headerLink} text-[var(--brand)] underline decoration-1 underline-offset-4`}>
              {label}
            </Link>
          ) : (
            <Link key={href} href={href} className={mutedLink}>
              {label}
            </Link>
          ),
        )}
        <ThemeToggle initial={theme} className={mutedButton} />
        <SignOutButton className={mutedButton} />
      </nav>
    </header>
  );
}

/**
 * Page shell for the reading pages (Course Map, Progress, Past Sessions, Notes, Settings, Passage): the header sits in the
 * same 6xl box as the workspace's, so the title and nav stay put between pages, and only the content
 * below it uses the narrower reading column.
 */
export function ReadingPage({ current, theme, children }: { current?: HeaderPage; theme: Theme; children: ReactNode }) {
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
