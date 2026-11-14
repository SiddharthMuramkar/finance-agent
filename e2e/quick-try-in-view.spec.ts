import { expect, test } from "@playwright/test";
import { replyLanded, say, seed, type Script } from "./support/app";

/**
 * Spec 2026-11-12, Part A Done when ("After five own-question turns in a row, the open Quick try is on screen without
 * scrolling"), US11-12, A5 and G3. The Learner at Percent's Your turn asks five questions of their own; each reply
 * streams, and code shows the open Quick try again under it, so after the fifth the open try is in the viewport with no
 * scroll by the Learner. The replies never retell the try (A7).
 */

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "w1280" && info.project.name !== "mbp14", "one desktop viewport is enough");
});

const OWN_QUESTIONS = [
  "Why am I learning basis points?",
  "Is a basis point the same as a percent?",
  "Why do traders not just say percent?",
  "What happens to a loan when rates rise?",
  "Can you say that more simply?",
];

test("after five own questions in a row the open Quick try is on screen without scrolling (A5, G3)", async ({ page }) => {
  test.setTimeout(150_000);
  await seed(page, "your-turn");
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  await replyLanded(page).catch(() => {});
  await expect(page.getByTestId("quick-try").first()).toBeAttached();

  for (const ask of OWN_QUESTIONS) await say(page, "your-turn-reply" as Script, ask);

  // The newest copy is the open one; the Learner has not scrolled, and it is in view.
  await expect(page.getByTestId("quick-try").last()).toBeInViewport();
  // No reply retold the try: none says what "the Quick try … asks".
  for (const reply of await page.getByTestId("assistant-message").allInnerTexts()) expect(reply).not.toMatch(/quick try[^.?!]{0,60}\basks\b/i);
});
