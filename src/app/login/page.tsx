export default async function LoginPage({ searchParams }: { searchParams: Promise<{ wrong?: string; locked?: string }> }) {
  const { wrong, locked } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Finance Agent</h1>
      <form action="/api/login" method="post" className="flex flex-col gap-3">
        <label htmlFor="passcode" className="text-sm text-stone-600 dark:text-stone-400">
          Passcode
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          autoFocus
          required
          className="rounded border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
        />
        {wrong && !locked && <p className="text-sm text-red-700 dark:text-red-400">That passcode is not right.</p>}
        {locked && (
          <p className="text-sm text-red-700 dark:text-red-400">Too many wrong passcodes. Logins from here are paused for 15 minutes; try again later.</p>
        )}
        <button className="rounded bg-stone-900 px-3 py-2 text-white dark:bg-stone-100 dark:text-stone-900">Enter</button>
      </form>
    </main>
  );
}
