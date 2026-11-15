import { writeFile } from "node:fs/promises";
import { chromium, request, type FullConfig, type LaunchOptions } from "@playwright/test";

/**
 * Warms the test server, then signs the tools Learner in once through the real login route and saves the cookie every
 * test starts with. The dark projects' copy (`tools-dark.json`, beside it) adds the cookie `theme=dark`: the site opens in
 * Light for everyone and never reads the computer's setting, so a dark project is a Learner who chose Dark.
 */
export default async function globalSetup(config: FullConfig) {
  const { baseURL, storageState, launchOptions } = config.projects[0].use;
  await warmUp(baseURL as string, launchOptions);
  const context = await request.newContext({ baseURL });
  const response = await context.post("/api/login", { form: { passcode: "e2e-passcode" }, maxRedirects: 0 });
  if (response.status() !== 303 || !response.headers()["set-cookie"]?.includes("fa_access=")) {
    throw new Error(`The tools Learner could not sign in: POST /api/login answered ${response.status()}.`);
  }
  const state = await context.storageState({ path: storageState as string });
  await context.dispose();
  const dark = { name: "theme", value: "dark", domain: new URL(baseURL as string).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const };
  await writeFile((storageState as string).replace(/\.json$/, "-dark.json"), JSON.stringify({ ...state, cookies: [...state.cookies, dark] }, null, 2));
}

/** Room for one cold compile on a slow runner; a warm server answers each step in a second or two. */
const WARM_MS = 120_000;

/**
 * `next dev` compiles each route the first time it is asked for, and the test server always starts cold. The first test
 * a shard runs used to pay for that inside its own 30 s: on one CI run the seed route took 3.9 s, `/study`
 * 15.2 s and the opener's `/api/turn` 6.1 s, so `e2e/message-row.spec.ts`, first in shard 2, timed out with no bug in
 * the app. Here, before any test, the routes nearly every test opens are visited once in a real browser: the story seed,
 * `/study` until its opener has finished, and `/course`; and `/notebook`, whose cold compile alone took 24.8 s inside
 * `e2e/header.spec.ts`'s 30 s on a slow CI runner. Then the tools Learner is started over to a fresh
 * one, so the first test finds the same state it would have found without the warm-up.
 *
 * Best effort: a step that fails only logs a warning. The tests themselves then fail on whatever is broken, each with
 * its own message, instead of the whole run stopping here.
 *
 * It launches the browser the tests use (`launchOptions` from the config, spec 2026-11-11 T-00) and names it once.
 */
async function warmUp(baseURL: string, launchOptions: LaunchOptions | undefined) {
  const started = Date.now();
  const browser = await chromium.launch(launchOptions);
  console.log(`Browser: ${launchOptions?.executablePath ?? "Playwright's Chromium"} ${browser.version()}`);
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
      // `/notebook` compiles in about 17 s on a 4-core box and took 24.8 s on a slow runner, inside the first test that opens it.
      await page.goto("/notebook", { timeout: WARM_MS });
      await page.waitForLoadState("networkidle", { timeout: WARM_MS });
      console.log(`Test server warmed (story seed, /study and its opener, /course, /notebook) in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
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
