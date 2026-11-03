import { PrimaryButton } from "../ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ wrong?: string; locked?: string }> }) {
  const { wrong, locked } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Finance Agent</h1>
      <form action="/api/login" method="post" className="flex flex-col gap-3">
        <label htmlFor="passcode" className="text-sm text-[var(--muted)]">
          Passcode
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          autoFocus
          required
          className="rounded border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-[var(--ink)]"
        />
        {wrong && !locked && <p className="text-sm text-[var(--danger)]">That passcode is not right.</p>}
        {locked && (
          <p className="text-sm text-[var(--danger)]">Too many wrong passcodes. Logins from here are paused for 15 minutes; try again later.</p>
        )}
        <PrimaryButton type="submit">Enter</PrimaryButton>
      </form>
    </main>
  );
}
