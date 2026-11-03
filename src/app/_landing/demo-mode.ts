/**
 * Demo mode: lets the owner photograph the workspace for Home without showing the real
 * conversation. It needs BOTH a server flag (WORKSPACE_DEMO=1, set only on the owner's machine, never on
 * Vercel) and `?demo=1` in the URL, and the page only asks after the signed-in check.
 */
export function isDemoMode(searchParams: { demo?: string | string[] } | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return env.WORKSPACE_DEMO === "1" && searchParams?.demo === "1";
}

/** The status card's summary in demo mode: the present value Topic, mid-way through a Teaching Step. */
export const DEMO_SUMMARY = "Time value and present value (foundation Stage).\nTeaching Step: your turn for Check 1 of 2.";
