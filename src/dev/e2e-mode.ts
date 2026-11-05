/**
 * The browser test bed's one mode switch (spec 2026-11-05, ticket T-00). `E2E=1` is the master flag; `E2E_DB=pglite`
 * puts the app on an in-memory PGlite and `E2E_TUTOR=scripted` swaps the Anthropic client for named scripts.
 * Pure functions of an env object, so they can be tested without touching `process.env`.
 */
type Env = Record<string, string | undefined>;

/** True only when the test bed is asked for, outside production and off Vercel. */
export function e2eEnabled(env: Env): boolean {
  return env.E2E === "1" && env.NODE_ENV !== "production" && !env.VERCEL;
}

/**
 * Throws when a test-bed flag reaches a place it must never run: production, Vercel, or a scripted Tutor beside a
 * real API key. The message names the flag that broke the rule. With `E2E` unset it never throws.
 */
export function assertE2eSafe(env: Env): void {
  if (!env.E2E) return;
  if (env.NODE_ENV === "production") throw new Error("E2E is set with NODE_ENV=production: the test bed never runs in production.");
  if (env.VERCEL) throw new Error("E2E is set with VERCEL: the test bed never runs on Vercel.");
  if (env.E2E_TUTOR === "scripted" && env.ANTHROPIC_API_KEY) {
    throw new Error("E2E_TUTOR=scripted is set with ANTHROPIC_API_KEY: the test bed never holds a real key.");
  }
}

/** True when the test bed asks for the scripted Tutor (`E2E_TUTOR=scripted`) and the test bed is allowed at all. */
export function scriptedTutor(env: Env): boolean {
  return e2eEnabled(env) && env.E2E_TUTOR === "scripted";
}
