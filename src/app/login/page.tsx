import { googleSignInOn } from "@/auth/better-auth";
import { googleCallbackURL, safeDestination } from "@/auth/destination";
import { PrimaryButton, TextLink } from "../ui";
import { GoogleButton } from "./google-button";
import { PasscodeField } from "./passcode-field";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ wrong?: string; locked?: string; error?: string; passcode?: string; next?: string | string[] }>;
}) {
  const { wrong, locked, error, passcode, next: requested } = await searchParams;
  // Only a safe destination is carried through, as its resolved path; anything else means the Study Workspace.
  const next = safeDestination(requested);
  // Google sign-in runs on production and localhost only: where it is off (a preview, or the secrets
  // unset) the page is the passcode form alone, exactly as before (C1b).
  const googleOn = googleSignInOn(process.env) && process.env.VERCEL_ENV !== "preview";
  const showPasscode = !googleOn || passcode === "1";
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      {error === "not_invited" && (
        <>
          <h1 className="text-xl font-semibold">You&apos;re not on the list yet</h1>
          <p className="text-sm text-[var(--muted)]">Ask the person who shared Value It with you to add your email.</p>
        </>
      )}
      {error && error !== "not_invited" && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          Sign-in didn&apos;t work. Try again.
        </p>
      )}
      {error === "not_invited" ? null : showPasscode ? (
        <>
          {!error && <h1 className="text-xl font-semibold">Enter your passcode</h1>}
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
            <PrimaryButton type="submit">Enter</PrimaryButton>
          </form>
        </>
      ) : (
        <>
          {!error && <h1 className="text-xl font-semibold">Sign in</h1>}
          <GoogleButton callbackURL={googleCallbackURL(requested)} />
          <TextLink href={next ? `/login?passcode=1&next=${encodeURIComponent(next)}` : "/login?passcode=1"} className="self-start text-sm">
            Use a passcode
          </TextLink>
        </>
      )}
      <TextLink href="/" className="self-start text-sm">
        ← Back to home
      </TextLink>
    </main>
  );
}
