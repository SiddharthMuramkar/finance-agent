import type { ReactNode } from "react";
import { SiteShell } from "../(site)/site-chrome";
import { TextLink } from "../ui";

/** The plain line under a sign-in page's heading. */
export const authNote = "text-sm leading-5 text-[var(--muted)]";

/**
 * The frame of the sign-in pages (/sign-in, /sign-up and /join; issue #33): the site chrome (Signal spec 4.1 to 4.3: its
 * nav and footer, as on every public page) drawn for a visitor, because the proxy sends a signed-in visit to /sign-in on
 * before this page draws; the nav reads the address, so it marks Sign in on /sign-in and drops Join the waitlist on all
 * three. Then a Band across the top holding the page's one heading (F1), the narrow single-task column and the way back
 * Home.
 */
export function AuthPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SiteShell viewer={{ state: "visitor" }}>
      <div data-band="sign-in-strip" className="band">
        <div className="mx-auto max-w-sm px-6 py-8">
          <h1 className="type-h1">{title}</h1>
        </div>
      </div>
      <div className="mx-auto flex max-w-sm flex-col gap-5 px-6 pb-16 pt-8">
        {children}
        <TextLink href="/" className="self-start text-sm">
          ← Back to home
        </TextLink>
      </div>
    </SiteShell>
  );
}
