import { expect, type Page } from "@playwright/test";
import type { E2eScriptName } from "../../src/dev/e2e-tutor";

/**
 * The browser test bed's app helpers (spec 2026-11-05, T-00). Every test starts signed in as the tools Learner
 * (global-setup.ts); `seed` then starts it over and builds a named state through POST /api/dev-e2e.
 */

export type State = "fresh" | "story" | "story-scene" | "lingo" | "concept-widget" | "reading" | "quiz-open" | "your-turn" | "mix-up" | "off-topic" | "review-due" | "topic-complete" | "many-topics" | "notebook-older" | "notebook-long" | "restart-topics";
export type Script = E2eScriptName;

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

/**
 * Sends `text` in the Study Workspace with the scripted Tutor set to `name`, and waits for the reply to finish
 * (`timeout` ms for each wait: a spec whose first turn may reach a cold dev server gives it longer).
 */
export async function say(page: Page, name: Script, text: string, timeout = 30_000) {
  await script(page, name);
  // The Study Workspace may still be playing the Topic's opener, or not have started it yet: let it land first, so it
  // is not counted as ours. A page with no reply and no opener goes on after the wait, as it always did.
  await replyLanded(page).catch(() => {});
  await settled(page, timeout);
  const before = await page.getByTestId("assistant-message").count();
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("assistant-message")).toHaveCount(before + 1, { timeout });
  await settled(page, timeout);
}

/**
 * Waits until a Tutor reply has landed: one is on the page and no turn is running, both read in one look at the page.
 * An empty Session starts its opener once the page hydrates, which can come after the page looks quiet (a slow CPU or
 * a cold dev compile on CI), and the opener draws its reply line, still empty, the moment it starts. So "no Stop" read
 * at one moment and "a reply is there" read at the next can be an opener that started in between and is still running,
 * its Widget not in yet (main CI run 42251293052). Then waits for the page's own re-read after the turn.
 */
export async function replyLanded(page: Page) {
  await page.waitForFunction(
    () => {
      const on = (testId: string) => document.querySelector(`[data-testid="${testId}"]`) !== null;
      return on("assistant-message") && !on("stop-reply") && !on("writing-indicator");
    },
    null,
    { timeout: 30_000, polling: 50 },
  );
  await settled(page);
}

/** Waits until the page is quiet: no request in flight and no reply being written (each for up to `timeout` ms). */
export async function settled(page: Page, timeout = 30_000) {
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("stop-reply")).toHaveCount(0, { timeout });
  await expect(page.getByTestId("writing-indicator")).toHaveCount(0, { timeout });
}

/**
 * Waits until the page has hydrated. The kit's accordion triggers are named for the audit in the browser (GenuiTheme), not
 * in the server's HTML, so a page that has one is ready once none is left bare.
 */
export async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => document.querySelector(".openui-accordion-trigger:not([data-affordance])") === null);
}


/**
 * Waits until a public site page (src/app/(site), or the sign-in page in the site chrome) has hydrated: React has taken
 * over the site nav, so a click on a link is a client-side navigation and a click on a button runs its handler. A click
 * before that is a plain browser load of the next page, or nothing at all, depending on how fast the page loaded: the
 * flake D1 hit on a cold server (PR #20). React marks each DOM node it owns with a `__reactFiber` key.
 */
export async function siteReady(page: Page) {
  await page.waitForFunction(() => {
    const nav = document.querySelector("header.v-nav");
    return nav !== null && Object.keys(nav).some((key) => key.startsWith("__reactFiber"));
  });
}
