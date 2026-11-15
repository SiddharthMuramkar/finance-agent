import type { ReactNode } from "react";
import { betterAuthOn, googleSignInOn } from "@/auth/better-auth";
import { destinationOrDefault, googleCallbackURL, safeDestination } from "@/auth/destination";
import { emailLinkOn } from "@/auth/email-link";
import { currentSignIn } from "@/auth/session";
import type { Viewer } from "@/site/viewer";
import { SiteShell } from "../(site)/site-chrome";
import { Button, PrimaryButton, TextLink, secondaryButtonClass } from "../ui";
import { EmailLinkForm } from "./email-link-form";
import { GoogleButton } from "./google-button";
import { PasscodeField } from "./passcode-field";

type Params = { wrong?: string; locked?: string; error?: string; passcode?: string; next?: string | string[]; link?: string | string[] };

/** What a sign-in token looks like (Better Auth makes 32 letters); anything else is a broken link, never put in the form. */
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;

/** The error Better Auth sends back to /login for a sign-in link that was used, expired or never existed. */
const EXPIRED = "INVALID_TOKEN";

const muted = "text-sm leading-5 text-[var(--muted)]";

/** "or", between Google and the email link: a hairline either side. */
function Or() {
  return (
    <p className="flex items-center gap-3 text-xs leading-4 text-[var(--muted)] before:h-px before:flex-1 before:bg-[var(--rule)] after:h-px after:flex-1 after:bg-[var(--rule)]">
      or
    </p>
  );
}

/**
 * The status screen for someone signed in with an account that may not enter (ADR 0014), under its title in the Band: who they are signed in as,
 * "Check again" (a fresh /login, which the proxy forwards once they are approved) and Sign out (the same form post as
 * everywhere else). No sign-in form: they are signed in already.
 */
function AccountStatus({ email, next, children }: { email: string; next: string | null; children: ReactNode }) {
  return (
    <>
      <p className={muted}>
        You&apos;re signed in as <span className="break-all font-medium text-[var(--ink)]">{email}</span>. {children}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {/* A plain link, so the whole page loads again and the proxy decides afresh (it forwards an approved person). */}
        <a href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} data-affordance="button" className={secondaryButtonClass}>
          Check again
        </a>
        <form action="/api/logout" method="post">
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
    </>
  );
}

/**
 * The sign-in page. With accounts on (Google, email links or both; never on a preview), in this order (ADR 0014):
 * 1. `?link=<token>`, where an emailed sign-in link lands: "Finish signing in", one button that sends the token to
 *    Better Auth's verify. Never automatic, so a mail scanner opening the link uses nothing up.
 * 2. Someone signed in who waits for the owner, or was denied: their status, Check again and Sign out.
 * 3. `?error=INVALID_TOKEN`: "That sign-in link has expired", with the sign-in below it.
 * 4. Sign in: Google (the page's one primary), "or", then the email link (secondary beside Google, the primary
 *    without it), and the passcode behind a link.
 * With accounts off the page is the passcode form alone, exactly as before (C1b); `?passcode=1` shows it too.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { wrong, locked, error, passcode, next: requested, link } = await searchParams;
  // Only a safe destination is carried through, as its resolved path; anything else means the Study Workspace.
  const next = safeDestination(requested);
  // Google sign-in and email links run on production and localhost only: where both are off (a preview, or the
  // secrets unset) the page is the passcode form alone, exactly as before (C1b).
  const googleOn = googleSignInOn(process.env) && process.env.VERCEL_ENV !== "preview";
  const emailOn = emailLinkOn(process.env);
  const accountsOn = googleOn || emailOn;
  const token = emailOn && typeof link === "string" ? link : null;

  if (token !== null && TOKEN.test(token)) {
    return (
      <Shell title="Finish signing in">
        <p className={muted}>Press Sign in to finish. The link works once.</p>
        <form action="/api/auth/magic-link/verify" method="get" className="flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="callbackURL" value={destinationOrDefault(requested)} />
          <input type="hidden" name="errorCallbackURL" value="/login" />
          <PrimaryButton type="submit" size="lg" className="w-full">
            Sign in
          </PrimaryButton>
        </form>
      </Shell>
    );
  }

  // Only a Better Auth session can wait or be denied, so the passcode page never reads one.
  const signIn = betterAuthOn(process.env) ? await currentSignIn() : null;
  if (signIn?.kind === "waiting") {
    return (
      <Shell title="Waiting for approval" viewer={{ state: "applicant" }}>
        <AccountStatus email={signIn.user.email} next={next}>
          The owner of Value It lets each new person in. Nothing is emailed when they do, so press Check again later.
        </AccountStatus>
      </Shell>
    );
  }
  if (signIn?.kind === "denied") {
    return (
      <Shell title="Access not approved">
        <AccountStatus email={signIn.user.email} next={next}>
          The owner of Value It hasn&apos;t let this account in. If that&apos;s a mistake, ask the person who shared Value It with you.
        </AccountStatus>
      </Shell>
    );
  }

  const expired = error === EXPIRED || (token !== null && !TOKEN.test(token));
  const showPasscode = !accountsOn || passcode === "1";
  // The page's one heading, in the Band: what went wrong with a link, else the task (a failed sign-in keeps the task's
  // heading, with its plain message under it).
  const title = expired ? "That sign-in link has expired" : showPasscode ? "Enter your passcode" : "Sign in";
  return (
    <Shell title={title}>
      {expired ? (
        <p className={muted}>Each link works once, for 15 minutes. Ask for a new one below.</p>
      ) : (
        error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            Sign-in didn&apos;t work. Try again.
          </p>
        )
      )}
      {showPasscode ? (
        <form action="/api/login" method="post" className="flex flex-col gap-3">
          {next && <input type="hidden" name="next" value={next} />}
          <label htmlFor="passcode" className="text-sm text-[var(--muted)]">
            Passcode
          </label>
          <PasscodeField />
          {wrong && !locked && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              That passcode didn&apos;t work. Check it and try again.
            </p>
          )}
          {locked && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              Too many wrong passcodes. Logins from here are paused for 15 minutes; try again later.
            </p>
          )}
          <PrimaryButton type="submit" size="lg" className="w-full">
            Enter
          </PrimaryButton>
        </form>
      ) : (
        <>
          {googleOn && <GoogleButton callbackURL={googleCallbackURL(requested)} />}
          {googleOn && emailOn && <Or />}
          {emailOn && <EmailLinkForm callbackURL={googleCallbackURL(requested)} primary={!googleOn} google={googleOn} />}
          <TextLink href={next ? `/login?passcode=1&next=${encodeURIComponent(next)}` : "/login?passcode=1"} className="self-start text-sm">
            Use a passcode
          </TextLink>
        </>
      )}
    </Shell>
  );
}

/**
 * The page: the site chrome (Signal spec 4.2, 4.3: the nav shows "Request in review" to someone waiting for the owner;
 * everyone else here is signed out, because the proxy sends a signed-in Learner on before this page draws), a Band across
 * the top holding the page's one heading (F1: the sign-in page's and the Waiting screen's top strip), then the narrow
 * single-task column, ending on the way back Home.
 */
function Shell({ title, viewer = { state: "visitor" }, children }: { title: string; viewer?: Viewer; children: ReactNode }) {
  return (
    <SiteShell viewer={viewer}>
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
