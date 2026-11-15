import { e2eEnabled } from "@/dev/e2e-mode";

// The two switches behind sign-in (issue #33). Clerk signs real people in; the passcode door stays only for the test
// bed and the test tools, on a developer's machine. Pure functions of an env object, as e2e-mode.ts's are.

type Env = Record<string, string | undefined>;

/**
 * True when the passcode door may open: outside production and off Vercel. `/api/login`, the proxy's gate, the session
 * and `learnerFromCookie` all ask here, so a deploy refuses every passcode and every `fa_access` cookie, whatever
 * PASSCODES holds (src/auth/passcode-door.test.ts pins each of them).
 */
export function passcodeDoorOpen(env: Env): boolean {
  return env.NODE_ENV !== "production" && !env.VERCEL;
}

/**
 * True when Clerk runs: both of its keys are set and the browser test bed is off. While it is off, nothing calls Clerk
 * (no middleware, no `auth()`, no ClerkProvider), so CI and the test bed need no keys and no network.
 */
export function clerkOn(env: Env): boolean {
  return Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() && env.CLERK_SECRET_KEY?.trim()) && !e2eEnabled(env);
}
