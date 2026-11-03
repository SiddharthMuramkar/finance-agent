import type { Progress } from "@/course/navigator";

/**
 * Demo mode: lets the owner photograph the workspace for Home without showing the real
 * conversation. It needs BOTH a server flag (WORKSPACE_DEMO=1, set only on the owner's machine, never on
 * Vercel) and `?demo=1` in the URL, and the page only asks after the signed-in check.
 */
export function isDemoMode(searchParams: { demo?: string | string[] } | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return env.WORKSPACE_DEMO === "1" && searchParams?.demo === "1";
}

/** The Learner's place in demo mode, for the Topic bar's strip: the present value Topic, at Your turn for Check 1. */
export const DEMO_PROGRESS: Progress = {
  currentTopicId: "present-value",
  topics: { "present-value": { step: "your_turn", passedChecks: [], revealShown: false, status: "in_progress" } },
};
