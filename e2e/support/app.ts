import { expect, type Page } from "@playwright/test";

/**
 * The browser test bed's app helpers (spec 2026-11-05, T-00). Every test starts signed in as the tools Learner
 * (global-setup.ts); `seed` then starts it over and builds a named state through POST /api/dev-e2e.
 */

export type State = "fresh" | "story" | "concept-widget" | "quiz-open" | "your-turn" | "review-due" | "topic-complete" | "many-topics" | "notebook-older" | "restart-topics";
export type Script = "story-reply" | "concept-reply-widget" | "plain-reply" | "quiz-open" | "stage-reply-2" | "stage-reply-3" | "stage-reply-4";

/** Signs the tools Learner in through the login form (the saved cookie usually makes this unneeded). */
export async function signIn(page: Page) {
  const response = await page.request.post("/api/login", { form: { passcode: "e2e-passcode" }, maxRedirects: 0 });
  expect(response.status(), "POST /api/login").toBe(303);
}

/**
 * Keeps the OpenUI kit from mounting its own "Inspect" button on the development server (it is not part of the app, and a
 * production build has none), so audits of the page see only the app. Applies to every page the browser opens from now on.
 */
export async function quietDevtools(page: Page) {
  await page.addInitScript(() => {
    (globalThis as Record<symbol, unknown>)[Symbol.for("openui.devtools.autoMount")] = true;
  });
}

/** Starts the tools Learner over and builds the named state on the fresh Learner; this browser is signed in as it. */
export async function seed(page: Page, state: State) {
  // An earlier test's seed started the tools Learner over, which signs the saved cookie out: sign in as the active one.
  await quietDevtools(page);
  await signIn(page);
  const response = await page.request.post("/api/dev-e2e", { data: { state } });
  expect(response.status(), `seed("${state}"): ${await response.text()}`).toBe(200);
  return (await response.json()) as { state: State; learnerId: number };
}

/** Picks the script the scripted Tutor plays next. */
export async function script(page: Page, name: Script) {
  const response = await page.request.post("/api/dev-e2e", { data: { script: name } });
  expect(response.status(), `script("${name}")`).toBe(200);
}

/** Sends `text` in the Study Workspace with the scripted Tutor set to `name`, and waits for the reply to finish. */
export async function say(page: Page, name: Script, text: string) {
  await script(page, name);
  // The Study Workspace may still be playing the Topic's opener: wait until no reply is being written.
  await settled(page);
  // An empty Session starts its opener once the page hydrates, which can come after the page looks quiet (a slow
  // CPU or a cold dev compile on CI). Wait for the opener's reply to land first, so it is not counted as ours.
  if ((await page.getByTestId("assistant-message").count()) === 0) {
    await expect(page.getByTestId("assistant-message")).not.toHaveCount(0, { timeout: 30_000 }).catch(() => {});
    await settled(page);
  }
  const before = await page.getByTestId("assistant-message").count();
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("assistant-message")).toHaveCount(before + 1, { timeout: 30_000 });
  await settled(page);
}

/** Waits until the page is quiet: no request in flight and no reply being written. */
export async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("stop-reply")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("writing-indicator")).toHaveCount(0, { timeout: 30_000 });
}

/**
 * Waits until the page has hydrated. The kit's accordion triggers are named for the audit in the browser (GenuiTheme), not
 * in the server's HTML, so a page that has one is ready once none is left bare.
 */
export async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => document.querySelector(".openui-accordion-trigger:not([data-affordance])") === null);
}

/** Picks a theme through the app's own theme menu, by the start of its name ("Light", "Dark", …). */
export async function theme(page: Page, name: string) {
  await page.getByTestId("theme-menu-button").first().click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${name}`, "i") }).click();
}
