import Link from "next/link";
import { currentLearner } from "@/auth/session";
import { getDb } from "@/db/client";
import { accountFor } from "./account";
import { readTheme } from "./theme-cookie";
import { ReadingPage, primaryButtonClass, secondaryButtonClass } from "./ui";

// The branded not-found page (spec #119 "Pages › 404"). Next.js shows it for every unknown address and for every
// page that calls notFound(), such as another Learner's Session. A signed-out visitor never sees it: the proxy sends
// them to the login first, so the account menu always fits; it is still read here, so a signed-out 404 shows none.
export default async function NotFound() {
  const learner = await currentLearner().catch(() => null);
  return (
    <ReadingPage theme={await readTheme()} account={learner ? await accountFor(getDb(), learner) : undefined}>
      <h2 className="text-xl font-semibold leading-7">This page isn&apos;t here</h2>
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
