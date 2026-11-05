import { expect, test } from "@playwright/test";
import { say, seed } from "./support/app";

test.describe("the test bed", () => {
  test("the fixture Learner signs in, studies and gets a scripted reply", async ({ page }) => {
    const db = await page.request.get("/api/dev-e2e");
    expect(await db.json()).toEqual({ db: "pglite" });

    await seed(page, "story");
    await page.goto("/study");
    await expect(page.locator('[data-testid="topic-bar"]')).toBeVisible();

    await say(page, "story-reply", "Tell me a story about rates.");
    await expect(page.getByTestId("assistant-message").last()).toContainText("In February 1994 the Federal Reserve lifted its key rate from 3 to 3.25 percent.");
  });
});
