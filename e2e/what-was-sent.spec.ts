import { expect, test } from "@playwright/test";
import { replyLanded, say, seed, type Script } from "./support/app";

/**
 * What was sent stays sent (spec 2026-11-12, A1 and A2; ADR 0007), in the browser test bed, whose scripted Tutor plays
 * OpenAI's replay check: a Choice press at Concept gets a first draft the 80-word cap rejects and a retry that passes;
 * the three turns after it each get a normal reply, and no failure words ever show.
 */

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "w1280" && info.project.name !== "mbp14", "one desktop viewport is enough");
});

const FAILURE = /Something went wrong|The turn failed|invalid_request_error|request_id|\b400\b|could not answer that properly/;

test("a rejected draft and an accepted retry, then three turns that each get a normal reply (A1)", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, "concept-widget");
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  await replyLanded(page);

  await say(page, "rejected-draft" as Script, "Show me.");
  const retry = page.getByTestId("assistant-message").last();
  await expect(retry).toContainText("It is one move with two names.");
  await expect(retry).not.toContainText("Money today is worth more than money later");

  for (const ask of ["Why do traders use them?", "And for a loan?", "One more example?"]) {
    const before = await page.getByTestId("assistant-message").count();
    await say(page, "plain-reply" as Script, ask);
    await expect(page.getByTestId("assistant-message")).toHaveCount(before + 1);
    await expect(page.getByTestId("assistant-message").last()).toContainText("basis point");
  }
  await expect(page.locator("body")).not.toContainText(FAILURE);
});
