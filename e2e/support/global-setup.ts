import { chromium, request, type FullConfig } from "@playwright/test";

/**
 * Warms the test server, then signs the tools Learner in once through the real login route and saves the cookie every
 * test starts with.
 */
export default async function globalSetup(config: FullConfig) {
  const { baseURL, storageState } = config.projects[0].use;
  await warmUp(baseURL as string);
  const context = await request.newContext({ baseURL });
  const response = await context.post("/api/login", { form: { passcode: "e2e-passcode" }, maxRedirects: 0 });
  if (response.status() !== 303 || !response.headers()["set-cookie"]?.includes("fa_access=")) {
    throw new Error(`The tools Learner could not sign in: POST /api/login answered ${response.status()}.`);
  }
  await context.storageState({ path: storageState as string });
  await context.dispose();
}

/** Room for one cold compile on a slow runner; a warm server answers each step in a second or two. */
const WARM_MS = 120_000;

/**
 * `next dev` compiles each route the first time it is asked for, and the test server always starts cold. The first test
 * a shard runs used to pay for that inside its own 30 s: on main 742881b (#317) the seed route took 3.9 s, `/study`
 * 15.2 s and the opener's `/api/turn` 6.1 s, so `e2e/message-row.spec.ts`, first in shard 2, timed out with no bug in
 * the app. Here, before any test, the routes nearly every test opens are visited once in a real browser: the story seed,
 * `/study` until its opener has finished, and `/course`. Then the tools Learner is started over to a fresh one, so the
 * first test finds the same state it would have found without the warm-up.
 *
 * Best effort: a step that fails only logs a warning. The tests themselves then fail on whatever is broken, each with
 * its own message, instead of the whole run stopping here.
 */
async function warmUp(baseURL: string) {
  const started = Date.now();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    try {
      const login = await page.request.post("/api/login", { form: { passcode: "e2e-passcode" }, maxRedirects: 0, timeout: WARM_MS });
      if (login.status() !== 303) throw new Error(`POST /api/login answered ${login.status()}`);
      const seeded = await page.request.post("/api/dev-e2e", { data: { state: "story" }, timeout: WARM_MS });
      if (seeded.status() !== 200) throw new Error(`POST /api/dev-e2e {state: "story"} answered ${seeded.status()}`);
      await page.goto("/study", { timeout: WARM_MS });
      // The story Session is empty, so the page starts the Topic's opener once it hydrates: wait for it to finish.
      await page.getByTestId("assistant-message").first().waitFor({ state: "visible", timeout: WARM_MS });
      await page.getByTestId("stop-reply").first().waitFor({ state: "detached", timeout: WARM_MS });
      await page.getByTestId("writing-indicator").first().waitFor({ state: "detached", timeout: WARM_MS });
      await page.waitForLoadState("networkidle", { timeout: WARM_MS });
      await page.goto("/course", { timeout: WARM_MS });
      await page.waitForLoadState("networkidle", { timeout: WARM_MS });
      console.log(`Test server warmed (story seed, /study and its opener, /course) in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
    } catch (error) {
      console.warn(`Test server warm-up did not finish, so the first test may compile cold: ${(error as Error).message}`);
    } finally {
      // Start the tools Learner over, so no test sees the warm-up's Session.
      await page.request.post("/api/dev-e2e", { data: { reset: true }, timeout: WARM_MS }).catch(() => {});
    }
  } finally {
    await browser.close();
  }
}
