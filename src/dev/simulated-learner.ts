// The test tools' own Learner, for scripts/simulated-learner.mjs and scripts/browser-check.mjs, kept here so it is
// tested. Its only import has no imports of its own, so Node can load this file straight from a script.
import { ACCESS_COOKIE, passcodeList, TOOLS_NAME } from "../auth/passcode.ts";

/** A raw SQL query that returns rows (the Neon driver's `sql.query`, or PGlite's in tests). */
export type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/** How a script reaches the app: the global `fetch`, or the real routes in tests. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** What Settings' confirmed Start over form sends (START_OVER_CONFIRM in src/auth/learners.ts). */
const START_OVER_CONFIRM = "start-over";

/**
 * The tools Learner's passcode, from PASSCODES. There is no fallback: the owner's passcode or the test passcode
 * would let a run touch the owner's progress or the owner's test Learner, so without a tools pair nothing runs.
 */
export function toolsPasscode(env: Record<string, string | undefined> = process.env): string {
  const passcode = passcodeList(env).get(TOOLS_NAME);
  if (!passcode) {
    throw new Error(`PASSCODES must list a ${TOOLS_NAME}:<passcode> pair. The test tools sign in only as the tools Learner, never as the owner or the test Learner.`);
  }
  return passcode;
}

/** The access cookie a response set, as "fa_access=<id>.<signature>", or null. */
function accessCookie(response: Response): string | null {
  const set = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") ?? ""];
  for (const line of set) {
    const match = new RegExp(`(?:^|,\\s*)${ACCESS_COOKIE}=([^;,]+)`).exec(line);
    if (match) return `${ACCESS_COOKIE}=${decodeURIComponent(match[1])}`;
  }
  return null;
}

/**
 * Signs in as the tools Learner and starts it over, as every run of the test tools begins: the login route with
 * the tools passcode, then Start over, which archives that Learner (deleting nothing) and opens a fresh, empty one
 * under the same name. Returns the fresh Learner's cookie ("fa_access=…", ready for a Cookie header) and its id.
 */
export async function signInAsToolsLearner(
  base: string,
  env: Record<string, string | undefined> = process.env,
  fetchFn: Fetch = fetch,
): Promise<{ cookie: string; learnerId: number }> {
  const root = base.replace(/\/$/, "");
  const form = { "Content-Type": "application/x-www-form-urlencoded" };
  const login = await fetchFn(`${root}/api/login`, { method: "POST", headers: form, body: new URLSearchParams({ passcode: toolsPasscode(env) }), redirect: "manual" });
  const signedIn = accessCookie(login);
  if (!signedIn) throw new Error(`The tools Learner's sign-in failed (HTTP ${login.status}): check that the app's PASSCODES lists the same ${TOOLS_NAME} pair.`);
  // Start over must come from the site itself; a script says so with the Origin header a browser would send.
  const started = await fetchFn(`${root}/api/start-over`, {
    method: "POST",
    headers: { ...form, Cookie: signedIn, Origin: new URL(root).origin },
    body: new URLSearchParams({ confirm: START_OVER_CONFIRM }),
    redirect: "manual",
  });
  const cookie = accessCookie(started);
  if (!cookie) throw new Error(`Start over of the tools Learner failed (HTTP ${started.status}).`);
  return { cookie, learnerId: Number(/=(\d+)\./.exec(cookie)![1]) };
}

/** Where the tools Learner stands in a Topic, read from its own rows only. */
export async function toolsState(query: Query, learnerId: number, topicId: string) {
  const [progress] = await query("select step, status, reveal_shown from topic_progress where learner_id = $1 and topic_id = $2", [learnerId, topicId]);
  const passes = await query("select check_id from check_results where learner_id = $1 and topic_id = $2 and passed", [learnerId, topicId]);
  const [{ n }] = await query("select count(*)::int as n from sessions where learner_id = $1", [learnerId]);
  return {
    step: (progress?.step as string | undefined) ?? "story",
    status: (progress?.status as string | undefined) ?? "not_started",
    revealShown: (progress?.reveal_shown as boolean | undefined) ?? false,
    passedChecks: passes.map((p) => p.check_id as string),
    sessions: n as number,
  };
}
