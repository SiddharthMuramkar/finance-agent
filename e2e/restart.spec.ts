import { expect, test, type Page } from "@playwright/test";
import { hydrated, say, seed, settled } from "./support/app";

/**
 * B3b (spec 2026-11-05): a Learner starts one Topic over from the Topic bar or from Settings, the old attempt stays in the
 * Notebook, and nothing else moves. "restart-topics": Percent (P) passed with a message, a saved reply, an Own rule and a
 * due Review card; the next Topic (Q) in progress.
 */

const P = "num-percent-bps";
/** What the Learner says in Q's first attempt, so the fresh attempt can be shown not to carry it. */
const FIRST_TRY = "This is my first try at this Topic.";

test.beforeEach(async ({ page }) => {
  await seed(page, "restart-topics");
});

async function confirmRestart(page: Page) {
  await expect(page.getByTestId("restart-confirm")).toContainText("This clears your Checks and progress for this Topic.");
  await page.getByTestId("restart-confirm").getByRole("button", { name: "Start over" }).click();
}

test("restart from the Topic bar and from Settings", async ({ page }) => {
  test.setTimeout(240_000); // the dev server compiles each page on first visit

  // From Q's Topic bar: ⋯ → Start this Topic over → confirm.
  await page.goto("/study");
  await hydrated(page);
  const bar = page.getByTestId("topic-bar");
  const title = ((await bar.locator("p").first().innerText()) ?? "").trim();
  // Q's first attempt has a conversation: the Tutor's opener, the Learner's message and the Tutor's reply.
  await say(page, "plain-reply", FIRST_TRY);
  await expect(page.getByText(FIRST_TRY, { exact: true })).toHaveCount(1);
  await expect(page.getByTestId("assistant-message")).toHaveCount(2);
  await bar.getByRole("button", { name: "Topic options" }).click();
  await page.getByRole("menuitem", { name: "Start this Topic over…" }).click();
  await confirmRestart(page);
  await expect(page).toHaveURL(/\/study$/, { timeout: 60_000 });
  await hydrated(page);
  await settled(page);
  await expect(page.getByTestId("topic-bar")).toContainText(title);
  await expect(page.getByTestId("topic-bar").locator('[aria-current="step"]')).toHaveText("Story");
  await expect(page.getByTestId("topic-bar").locator("button[data-step-number]")).toHaveCount(0);
  // An empty chat: none of the first attempt's messages; only the fresh attempt's own opener, which starts by itself.
  await expect(page.getByText(FIRST_TRY, { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("assistant-message")).toHaveCount(1, { timeout: 30_000 });
  await settled(page);
  await expect(page.getByTestId("assistant-message")).toHaveCount(1);
  await expect(page.getByText(FIRST_TRY, { exact: true })).toHaveCount(0);

  await page.goto("/notebook");
  const row = page.locator("[data-notebook-row]").filter({ hasText: title });
  await expect(row.locator("[data-earlier-attempt]")).toHaveCount(1);
  await expect(row.getByText(/^Earlier attempt · \d+ \w{3}/)).toBeVisible();

  // From Settings → Your Topics: Percent (passed).
  await page.goto("/settings");
  await hydrated(page);
  const mine = page.locator(`#your-topics [data-your-topic="${P}"]`);
  await mine.getByRole("button", { name: "Start over" }).click();
  await confirmRestart(page);
  await expect(page).toHaveURL(/\/study$/, { timeout: 60_000 });

  // P's progress is cleared. The restart route lands on /study with P current, and its opener may already have begun the
  // fresh attempt at the Story step, so P reads Not started or (just begun) In progress, never Passed, with no Check passed.
  await page.goto("/course");
  const p = page.locator(`li[data-topic="${P}"]`);
  await expect(p).toHaveAttribute("data-status", /^(not_started|in_progress)$/);
  await expect(p).toContainText(/0 of \d+$/);

  // Its earlier attempt opens read-only with the old messages and no composer.
  await page.goto("/notebook");
  const earlier = page.locator(`[data-notebook-row="${P}"] [data-earlier-attempt]`);
  await expect(earlier).toHaveCount(1);
  await expect(earlier.getByRole("link", { name: "Read" })).toBeVisible();
  await expect(earlier.getByRole("button", { name: "Resume" })).toHaveCount(0);
  await earlier.getByRole("link", { name: "Read" }).click();
  await expect(page).toHaveURL(/\/sessions\/\d+$/, { timeout: 60_000 });
  await expect(page.getByText("Earlier attempt ·")).toBeVisible();
  await expect(page.getByText("Tell me more.")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("nothing else moved", async ({ page }) => {
  test.setTimeout(240_000);
  // Both restarts: Q from its Topic bar, then P from Settings.
  await page.goto("/study");
  await hydrated(page);
  await page.getByTestId("topic-bar").getByRole("button", { name: "Topic options" }).click();
  await page.getByRole("menuitem", { name: "Start this Topic over…" }).click();
  await confirmRestart(page);
  await expect(page).toHaveURL(/\/study$/, { timeout: 60_000 });
  await hydrated(page);
  await settled(page);

  await page.goto("/settings");
  await hydrated(page);
  await page.locator(`#your-topics [data-your-topic="${P}"]`).getByRole("button", { name: "Start over" }).click();
  await confirmRestart(page);
  await expect(page).toHaveURL(/\/study$/, { timeout: 60_000 });

  // The saved reply and the Own rule are still on the Notebook row.
  await page.goto("/notebook");
  const row = page.locator(`[data-notebook-row="${P}"]`);
  await expect(row.locator("[data-saved-item]")).toHaveCount(1);
  await expect(row).toContainText("A point is not a percent.");

  // Spaced review goes on: the due card is still offered in the Study Workspace.
  await page.goto("/study");
  await hydrated(page);
  await expect(page.getByTestId("review")).toBeVisible();
});
