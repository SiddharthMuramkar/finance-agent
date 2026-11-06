import { expect, test, type Page } from "@playwright/test";
import { say, script, seed, settled } from "./support/app";

/**
 * D3a: every Tutor reply ends with two or three tap-to-answer Choices (ADR 0010). At the Concept step one of them is
 * "What does that word mean?"; tapping it posts the Choice by its index and the Learner's bubble reads its words.
 * The message box still sends typed text.
 */

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "mbp14" && info.project.name !== "mbp14-dark", "one viewport per theme is enough here");
});

/** The Choices under the latest reply: two or three raised buttons, each with a decorative emoji. */
async function expectChoices(page: Page) {
  const choices = page.getByTestId("choices").last().getByTestId("choice");
  // The Choices come back once the page has re-read the Learner's place after the turn.
  await expect(choices.first()).toBeVisible({ timeout: 30_000 });
  const count = await choices.count();
  expect(count, "Choices under the latest reply").toBeGreaterThanOrEqual(2);
  expect(count).toBeLessThanOrEqual(3);
  for (let i = 0; i < count; i++) await expect(choices.nth(i).locator('img[alt=""]')).toHaveCount(1);
  return choices;
}

test("after each of 5 scripted replies 2–3 Choices show, and a tapped Choice posts its words", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, "concept-widget");
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  await settled(page);
  await expectChoices(page);

  // Replies 1–3: typed messages at Concept.
  await say(page, "plain-reply", "What is a basis point?");
  await expectChoices(page);
  await say(page, "concept-reply-widget", "Show the move again, please.");
  await expectChoices(page);
  await say(page, "plain-reply", "Why do traders use them?");
  const choices = await expectChoices(page);
  const word = choices.filter({ hasText: "What does that word mean?" });
  await expect(word).toHaveCount(1);

  // Reply 4: tap "What does that word mean?". The turn posts the Choice's index; the server posts its stored words.
  await script(page, "plain-reply");
  const before = await page.getByTestId("assistant-message").count();
  const labels = await choices.allInnerTexts();
  const index = labels.findIndex((l) => l.includes("What does that word mean?"));
  const posted = page.waitForRequest((r) => r.url().endsWith("/api/turn") && r.method() === "POST");
  await word.click();
  const body = (await posted).postDataJSON();
  expect(body).toMatchObject({ choice: index });
  expect(body).not.toHaveProperty("message");
  await expect(page.getByTestId("assistant-message")).toHaveCount(before + 1, { timeout: 30_000 });
  await settled(page);
  await expect(page.getByText("What does that word mean?", { exact: true }).first()).toBeVisible();
  const after = await expectChoices(page);
  // The Choice pressed last turn is skipped.
  await expect(after.filter({ hasText: "What does that word mean?" })).toHaveCount(0);

  // Reply 5: the message box still sends typed text.
  await say(page, "plain-reply", "I typed this myself.");
  await expect(page.getByText("I typed this myself.", { exact: true })).toBeVisible();
  await expectChoices(page);
  await expect(page.getByTestId("help-chip")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Show me in a widget/ })).toHaveCount(0);
});
