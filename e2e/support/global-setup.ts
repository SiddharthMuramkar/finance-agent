import { chromium, request, type FullConfig, type LaunchOptions } from "@playwright/test";

/**
 * Warms the test server, then signs the tools Learner in once through the real login route and saves the cookie every
 * test starts with.
 */
export default async function globalSetup(config: FullConfig) {
  const { baseURL, storageState, launchOptions } = config.projects[0].use;
  await warmUp(baseURL as string, launchOptions);
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
 * a shard runs used to pay for that inside its own 30 s: on one CI run the seed route took 3.9 s, `/study`
 * 15.2 s and the opener's `/api/turn` 6.1 s, so `e2e/message-row.spec.ts`, first in shard 2, timed out with no bug in
 * the app. Here, before any test, the routes nearly every test opens are visited once in a real browser: the story seed,
 * `/study` until its opener has finished, and `/course`; and `/notebook`, whose cold compile alone took 24.8 s inside
 * `e2e/header.spec.ts`'s 30 s on a slow CI runner. Then the tools Learner is started over to a fresh
 * one, so the first test finds the same state it would have found without the warm-up. Last, signed out, the public site's
 * pages and the sign-in page (PUBLIC_PAGES): `e2e/about.spec.ts`'s D1, first in shard 1, opened `/` cold (21.8 s) and
 * then `/about` cold inside its 30 s and timed out on one CI run.
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
      // The routes a tap posts to (LEARNER_POSTS), each sent an empty body: it answers 400 and writes nothing, but compiles.
      // A test's first tap otherwise pays the compile inside its 5 s expect: on a loaded box `e2e/spine-01.spec.ts`'s first
      // Quick try waited over 5 s on `/api/quick-try` and its quiz Check on `/api/quiz`, with no bug in the app.
      for (const path of LEARNER_POSTS) {
        const warmed = await page.request.post(path, { data: {}, timeout: WARM_MS });
        if (warmed.status() >= 500) throw new Error(`POST ${path} {} answered ${warmed.status()}`);
      }
      console.log(`Test server warmed (story seed, /study and its opener, /course, /notebook, ${LEARNER_POSTS.join(", ")}) in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
    } catch (error) {
      console.warn(`Test server warm-up did not finish, so the first test may compile cold: ${(error as Error).message}`);
    } finally {
      // Start the tools Learner over, so no test sees the warm-up's Session.
      await page.request.post("/api/dev-e2e", { data: { reset: true }, timeout: WARM_MS }).catch(() => {});
    }
    // Signed out (a context of its own, with no cookie), as a visitor first opens them: each page until it is quiet, so
    // its browser code is compiled too.
    const visitor = await browser.newPage({ baseURL });
    try {
      for (const path of PUBLIC_PAGES) {
        await visitor.goto(path, { timeout: WARM_MS });
        await visitor.waitForLoadState("networkidle", { timeout: WARM_MS });
      }
      console.log(`Public pages warmed (${PUBLIC_PAGES.join(", ")}); warm-up took ${((Date.now() - started) / 1000).toFixed(1)} s in all.`);
    } catch (error) {
      console.warn(`Public page warm-up did not finish, so a public page may compile cold: ${(error as Error).message}`);
    }
  } finally {
    await browser.close();
  }
}

/** The routes the page posts to when the Learner taps a Quick try, submits a quiz or moves a Widget. */
const LEARNER_POSTS = ["/api/quick-try", "/api/quiz", "/api/widget-state"];

/** The public site's pages (one case page compiles the route for all five) and the sign-in page. */
const PUBLIC_PAGES = ["/", "/about", "/how-it-works", "/examples", "/examples/amazon-2000", "/sign-in"];
