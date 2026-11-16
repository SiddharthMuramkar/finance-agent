import type { Metadata } from "next";
import Link from "next/link";
import { currentAccount } from "./account";
import { ReadingPage, primaryButtonClass, secondaryButtonClass } from "./ui";

// The branded not-found page (spec #119 "Pages › 404"). Next.js shows it for every unknown address and for every
// page that calls notFound(), such as another Learner's Session. A signed-out visitor rarely sees it: the proxy sends
// them to the sign-in first, so the account menu fits; it is still read here, so a signed-out 404 shows none. A 404 for
// an address the proxy's matcher skips (a missing /_next/static file) never went through clerkMiddleware, so Clerk's
// auth() throws there (issue #33): the page then draws with no account menu rather than fail.
/** Its own title (issue #71), and no canonical link: a missing page has no address to stand for. */
export const metadata: Metadata = { title: "Page not found" };

export default async function NotFound() {
  const account = await currentAccount().catch(() => undefined);
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
