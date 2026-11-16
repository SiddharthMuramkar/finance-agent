import Link from "next/link";
import { notFound } from "@/site/copy";
import { SiteShell } from "./(site)/site-chrome";
import { currentAccount } from "./account";
import { ReadingPage, primaryButtonClass, secondaryButtonClass } from "./ui";

// The branded not-found page (spec #119 "Pages › 404"). Next.js shows it for every unknown address and for every
// page that calls notFound(), such as another Learner's Session or an unknown case slug. Two versions (issue #70):
// - a Visitor (signed out) gets the public site's 'page not found': the site nav and footer, and a way back Home. The
//   proxy lets a signed-out GET of an unknown address through, so this is what a mistyped link or a crawler sees, with a
//   404, rather than the sign-in card;
// - a Member keeps the app's page, with the account menu and the ways back to their Topic and the Course Map.
// A 404 for an address the proxy's matcher skips (a missing /_next/static file) never went through clerkMiddleware, so
// Clerk's auth() throws there (issue #33): the page then draws the Visitor's version rather than fail.
export default async function NotFound() {
  const account = await currentAccount().catch(() => undefined);
  if (!account) return <VisitorNotFound />;
  return (
    <ReadingPage account={account}>
      <h2 className="type-h1">This page isn&apos;t here</h2>
      <p className="mt-2 text-sm leading-5 text-[var(--muted)]">
        The address may be mistyped, or what it pointed to no longer exists. Pick up where you were.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/study" className={primaryButtonClass}>
          Back to your Topic
        </Link>
        <Link href="/course" className={secondaryButtonClass}>
          Course Map
        </Link>
      </div>
    </ReadingPage>
  );
}

/** The Visitor's version, in the public site's chrome (src/app/(site)/site-chrome.tsx). */
function VisitorNotFound() {
  return (
    <SiteShell viewer={{ state: "visitor" }}>
      <div data-page="not-found" className="v-section">
        <div className="v-wrap v-stack">
          <h1 className="page-h1 v-page-title" tabIndex={-1}>
            {notFound.h1}
          </h1>
          <p className="v-lede">{notFound.lede}</p>
          <p>
            <Link href="/" className="v-btn v-btn-primary" data-affordance="button">
              {notFound.home}
            </Link>
          </p>
        </div>
      </div>
    </SiteShell>
  );
}
