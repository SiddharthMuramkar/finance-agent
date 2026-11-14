import type { ReactNode } from "react";
import Link from "next/link";
import { BarsReplay } from "../bars-replay";
import { RisingBars } from "../rising-bars";
import { Button, ButtonLink, SignOutButton } from "../ui";
import { copy } from "./copy";
import { ShareToLaptop } from "./share-to-laptop";

// The public chrome, shared by every public page (Home at "/", the About page at "/about" and the sign-in page at
// "/login"): the header, the footer, the lockup and the main button. A server component that reads nothing itself: each
// page reads the sign-in state and passes it in (spec 2026-11-12 G1, E11), so the header always knows who is there.

/**
 * The signed-in Learner's main button: what it says and, for Resume, Start and What comes next, which Topic it
 * opens (through /api/open, the Learner's current Topic); every one lands on /study.
 */
export type HomeButton = { kind: "resume" | "start"; topic: string } | { kind: "next"; label: string } | { kind: "open" };

/** The public page showing, marked current in the header. Home itself marks none. */
export type HomePage = "about" | "login";

/**
 * Who the public header is drawn for (G1): a signed-in Learner, someone signed in with an account that waits for the
 * owner or was denied (ADR 0014: their status screen on /login carries its own Sign out), or nobody (undefined).
 */
export type PublicSignIn = "learner" | "waiting";

/** The signed-in button's words: "Resume" or "Start" over the Topic's whole title (E7), What comes next, or Open. */
function ButtonWords({ button }: { button: HomeButton }) {
  if (button.kind === "resume" || button.kind === "start") {
    return (
      <span data-main-button-label className="flex min-w-0 flex-col items-start text-left leading-tight">
        <span>{button.kind === "resume" ? copy.resume : copy.start}</span>
        <span data-main-button-topic className="font-normal [overflow-wrap:anywhere]">
          {button.topic}
        </span>
      </span>
    );
  }
  return <span className="min-w-0 text-left [overflow-wrap:anywhere]">{button.kind === "next" ? button.label : copy.openStudyWorkspace}</span>;
}

/** The mark and the name. Plain text, not a link: we are already on Home, and a link with no signifier fails the affordance audit. */
export function Lockup({ size }: { size: number }) {
  return (
    <span className="home-lockup" style={{ fontSize: size }}>
      <RisingBars size={size} />
      {copy.brand}
    </span>
  );
}

/**
 * The public header (G1: one of the two headers; the app's is AppHeader in ui.tsx): the lockup, then ghost links. Always
 * How it works, Examples and About; then by `signIn`:
 * - a Learner: the Study Workspace and Sign out, never Sign in or Join early access;
 * - waiting or denied: nothing more (their status screen has Check again and Sign out, and they cannot study yet);
 * - nobody: Sign in and Join early access, except on the sign-in page itself, where Sign in is the page showing and the
 *   page's own Google button is its one primary.
 * `current` marks that public page's link as the page showing (aria-current, ink at 600, and a 2px accent bar on the
 * header's hairline, as the app header does).
 */
export function HomeHeader({ signIn, current }: { signIn?: PublicSignIn; current?: HomePage }) {
  return (
    <header className="home-header" data-home-section="header">
      <div className="home-wrap">
        <div className="home-header-row">
          <Lockup size={22} />
          <div className="flex items-center gap-2">
            {/* Ghost header links, as the app header's (ADR 0013): no underline and no surface at rest, a wash on hover. */}
            <Link href="/#how-it-works" data-affordance="nav" className="home-nav home-nav-page">
              {copy.nav.howItWorks}
            </Link>
            <Link href="/#examples" data-affordance="nav" className="home-nav home-nav-page">
              {copy.nav.examples}
            </Link>
            <a href="/about" data-affordance="nav" className="home-nav home-nav-page" aria-current={current === "about" ? "page" : undefined}>
              {copy.nav.about}
            </a>
            {signIn === "learner" ? (
              <>
                <a href="/study" data-affordance="nav" className="home-nav">
                  {copy.studyWorkspace}
                </a>
                <SignOutButton>{copy.signOut}</SignOutButton>
              </>
            ) : signIn === "waiting" ? null : (
              <>
                <a href="/login" data-affordance="nav" className="home-nav" aria-current={current === "login" ? "page" : undefined}>
                  {copy.signIn}
                </a>
                {current !== "login" && <HomeMainButton className="" />}
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

/** Home's footer: a hairline, the lockup, the footer line and the Footer nav of the public pages. */
export function HomeFooter() {
  return (
    <footer className="home-wrap pb-12 pt-8">
      <hr className="home-rule" />
      <div className="flex flex-col gap-4 pt-8 md:flex-row md:items-center md:justify-between">
        <Lockup size={18} />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
          <p className="home-body">{copy.footer}</p>
          <nav aria-label="Footer" className="flex gap-4">
            <Link href="/#how-it-works" data-affordance="link" className="link text-[15px]">
              {copy.nav.howItWorks}
            </Link>
            <Link href="/#examples" data-affordance="link" className="link text-[15px]">
              {copy.nav.examples}
            </Link>
            <a href="/about" data-affordance="link" className="link text-[15px]">
              {copy.nav.about}
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}

/**
 * Home's main button. Signed out, it opens the sign-in page (`signedOutLabel`, Join early access by default) and is marked
 * `data-join`, so Home can count Join pressed by section (E10). Signed in, it is the Learner's own button, and it reads in
 * full (E7): "Resume" or "Start" with the Topic's title on a second line that wraps, never cut off. On a screen narrower
 * than 768 px a signed-in Learner cannot study, so there it is "Send this to my laptop" instead, which opens the phone's
 * share sheet with the site's address. `icon` goes before the label.
 */
export function HomeMainButton({ button, signedOutLabel = copy.cta, icon, className = "btn-lg max-w-full" }: { button?: HomeButton; signedOutLabel?: string; icon?: ReactNode; className?: string }) {
  if (!button) {
    return (
      <ButtonLink href="/login" className={className} data-join="">
        {icon}
        <span className="min-w-0 truncate">{signedOutLabel}</span>
      </ButtonLink>
    );
  }
  const wide = `${className} h-auto py-2.5 max-md:hidden`;
  // Resume, Start and What comes next open the Learner's current Topic, so its Session shows at once (a passed Topic left on
  // screen gives way): a form posting to /api/open, which goes on to /study.
  const open =
    button.kind !== "open" ? (
      <form action="/api/open" method="post" className="contents">
        <Button type="submit" className={wide}>
          {icon}
          <ButtonWords button={button} />
        </Button>
      </form>
    ) : (
      <ButtonLink href="/study" className={wide}>
        {icon}
        <ButtonWords button={button} />
      </ButtonLink>
    );
  return (
    <>
      {open}
      <ShareToLaptop className={`${className} md:hidden`} icon={icon} />
    </>
  );
}

/**
 * The royal-blue closing band (a Band, F1), with the offer. Home passes the Learner's button and, signed out, the offer as
 * the note under the button (E1: the old "Free during early access" section); About passes Open Study Workspace signed in.
 * Signed out, the note adds on a phone that studying needs a laptop or tablet today (E7).
 */
export function JoinBand({ button, note = copy.ctaNote }: { button?: HomeButton; note?: string }) {
  return (
    <section data-home-section="closing" className="home-band home-section mt-[var(--home-section)] pb-[var(--home-section)]">
      <div className="home-wrap home-cols items-end gap-y-12">
        <div className="col-span-12 lg:col-span-8">
          <h2 className="home-statement">
            <span>{copy.closing[0]}</span>
            <span className="home-faint">{copy.closing[1]}</span>
          </h2>
          <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
            <BarsReplay>
              <HomeMainButton button={button} icon={<RisingBars size={18} onBrand />} />
            </BarsReplay>
          </div>
          {!button && <JoinNote note={note} className="mt-4 text-[14px] text-on-band-2" />}
        </div>
        <div className="col-span-12 flex justify-start lg:col-span-4 lg:justify-end">
          <span className="hidden lg:block">
            <RisingBars size={220} onBrand />
          </span>
          <span className="lg:hidden">
            <RisingBars size={140} onBrand />
          </span>
        </div>
      </div>
    </section>
  );
}

/** The note under a signed-out main button; below 768 px it adds that studying needs a laptop or tablet today (E7). */
export function JoinNote({ note, className }: { note: string; className: string }) {
  return (
    <p data-join-note className={className}>
      {note}
      <span data-phone-note className="md:hidden">
        {" "}
        {copy.phoneNote}
      </span>
    </p>
  );
}
