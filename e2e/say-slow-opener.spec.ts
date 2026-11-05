import { expect, test } from "@playwright/test";
import { say, seed } from "./support/app";

/**
 * say() on an empty Session whose opener starts late (a slow CPU, a cold dev compile on CI): the opener's reply must
 * not be counted as the scripted one (main CI run 42057093512, "toHaveCount 1, received 2").
 */
test("say() counts its own reply when the opener starts late", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "one viewport is enough");
  await seed(page, "story");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });
  await page.goto("/study");
  await say(page, "story-reply", "Tell me a story about rates.");
  await expect(page.getByTestId("assistant-message").last()).toContainText("In February 1994 the Federal Reserve lifted its key rate");
});
