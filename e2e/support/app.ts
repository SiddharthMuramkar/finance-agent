import { expect, type Page } from "@playwright/test";

/**
 * The browser test bed's app helpers (spec 2026-11-05, T-00). Every test starts signed in as the tools Learner
 * (global-setup.ts); `seed` then starts it over and builds a named state through POST /api/dev-e2e.
 */

export type State = "fresh" | "story" | "concept-widget" | "quiz-open" | "topic-complete" | "many-topics";
export type Script = "story-reply" | "concept-reply-widget" | "plain-reply" | "quiz-open";

/** Signs the tools Learner in through the login form (the saved cookie usually makes this unneeded). */
export async function signIn(page: Page) {
  const response = await page.request.post("/api/login", { form: { passcode: "e2e-passcode" }, maxRedirects: 0 });
  expect(response.status(), "POST /api/login").toBe(303);
}

/** Starts the tools Learner over and builds the named state on the fresh Learner; this browser is signed in as it. */
export async function seed(page: Page, state: State) {
  // An earlier test's seed started the tools Learner over, which signs the saved cookie out: sign in as the active one.
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
  const before = await page.getByTestId("assistant-message").count();
  const box = page.getByRole("textbox", { name: "Message" });
  await box.fill(text);
  await box.press("Enter");
  await expect(page.getByTestId("assistant-message")).toHaveCount(before + 1, { timeout: 30_000 });
  await expect(page.getByTestId("writing-indicator")).toHaveCount(0, { timeout: 30_000 });
}

/** Picks a theme through the app's own theme menu, by the start of its name ("Light", "Dark", …). */
export async function theme(page: Page, name: string) {
  await page.getByTestId("theme-menu-button").first().click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${name}`, "i") }).click();
}
