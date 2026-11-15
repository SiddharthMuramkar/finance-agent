import type { ReactNode } from "react";
import { HomeFooter, HomeHeader, type HomePage } from "../_landing/chrome";
import { TextLink } from "../ui";

/** The plain line under a sign-in page's heading. */
export const authNote = "text-sm leading-5 text-[var(--muted)]";

/**
 * The frame of the sign-in pages (/sign-in, /sign-up and /join; issue #33): the public header (G1) drawn signed out,
 * because the proxy sends a signed-in visit to /sign-in on before this page draws, with `current` marking which page
 * shows; a Band across the top holding the page's one heading (F1); the narrow single-task column; the way back Home;
 * and the public footer (G1, G9: on a phone the header hides its page links, and About is reached from there).
 */
export function AuthPage({ title, current, children }: { title: string; current: HomePage; children: ReactNode }) {
  return (
    <div className="home">
      <HomeHeader current={current} />
      <main>
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
      </main>
      <HomeFooter />
    </div>
  );
}
