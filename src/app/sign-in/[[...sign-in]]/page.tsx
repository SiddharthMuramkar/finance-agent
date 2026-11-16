import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";
import { SIGN_IN_PATH, destinationOrDefault, safeDestination } from "@/auth/destination";
import { clerkOn, passcodeDoorOpen } from "@/auth/gates";
import { PrimaryButton, TextLink } from "../../ui";
import { AuthPage, authNote } from "../auth-page";
import { PasscodeField } from "../passcode-field";

type Params = { wrong?: string; locked?: string; passcode?: string; next?: string | string[] };

/**
 * The sign-in page (issue #33), a catch-all so Clerk's own steps (/sign-in/factor-one, the email link's /sign-in/verify)
 * draw here too:
 * - Clerk on (clerkOn): Clerk's <SignIn/>, which offers whatever the Clerk instance has turned on (an email link today,
 *   Google later), so this page names no way to sign in itself. Afterwards it always lands on the safe `next` or /study
 *   (`forceRedirectUrl`, so a `redirect_url` in the address is never followed). On a developer's machine, where the
 *   passcode door is open too, the passcode is behind a link (`?passcode=1`).
 * - Clerk off, the door open (the test bed, CI, a developer's machine without Clerk keys): the passcode form, which
 *   posts to /api/login; a wrong passcode or a pause comes back here with `?wrong=1` or `?locked=1`.
 * - Neither (a deploy without Clerk keys, such as a preview): it says sign-in is off, with no form.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { wrong, locked, passcode, next: requested } = await searchParams;
  // Only a safe destination is carried through, as its resolved path; anything else means the Study Workspace.
  const next = safeDestination(requested);
  const door = passcodeDoorOpen(process.env);

  if (clerkOn(process.env) && !(door && passcode === "1")) {
    return (
      <AuthPage title="Sign in">
        {/* Clerk's catch-all components read the address, which Next.js knows only at request time. */}
        <Suspense>
          <SignIn forceRedirectUrl={destinationOrDefault(requested)} />
        </Suspense>
        {door && (
          <TextLink href={`${SIGN_IN_PATH}?passcode=1${next ? `&next=${encodeURIComponent(next)}` : ""}`} className="self-start text-sm">
            Use a passcode
          </TextLink>
        )}
      </AuthPage>
    );
  }

  if (!door) {
    return (
      <AuthPage title="Sign-in is off here">
        <p className={authNote}>This copy of Value It has no way to sign in.</p>
      </AuthPage>
    );
  }

  return (
    <AuthPage title="Enter your passcode">
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
    </AuthPage>
  );
}
