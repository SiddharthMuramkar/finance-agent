import { safeDestination } from "@/auth/destination";
import { PrimaryButton, TextLink } from "../ui";
import { PasscodeField } from "./passcode-field";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ wrong?: string; locked?: string; next?: string | string[] }>;
}) {
  const { wrong, locked, next: requested } = await searchParams;
  // Only a safe destination is carried through, as its resolved path; anything else means the Study Workspace.
  const next = safeDestination(requested);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Enter your passcode</h1>
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
      <TextLink href="/" className="self-start text-sm">
        ← Back to home
      </TextLink>
    </main>
  );
}
