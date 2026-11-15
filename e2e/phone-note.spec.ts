import { expect, test, type Page } from "@playwright/test";
import { quietDevtools, seed } from "./support/app";

/** The Study Workspace's note below 768 px, as the spec quotes it (2026-11-12, Part E Evidence). */
const PHONE_NOTE = "The Study Workspace needs a bigger screen. Open it on a laptop or an iPad.";

/**
 * The phone and the tablet (spec 2026-11-12 G9): studying stays laptop and tablet only, so below 768 px the Study Workspace
 * shows only its phone note. Runs on the p390 (390 x 844) and t768 (768 x 1024) projects only; what each case expects
 * depends on which side of 768 px it is. (Home's own phone note and its "Send this to my laptop" button, E7, were parts of
 * the old landing; the Signal site, decision #7, has neither.)
 */

test.beforeEach(async ({ page }, info) => {
  test.skip(!["p390", "t768"].includes(info.project.name), "the phone and tablet projects (G9)");
  await quietDevtools(page);
});

const isPhone = (page: Page) => page.viewportSize()!.width < 768;

test("[G9] the Study Workspace shows its phone note below 768 px, and opens from 768 px", async ({ page }) => {
  await seed(page, "story");
  await page.goto("/study");
  if (isPhone(page)) {
    await expect(page.getByText(PHONE_NOTE)).toBeVisible();
    await expect(page.getByTestId("topic-bar")).toBeHidden();
  } else {
    await expect(page.getByTestId("topic-bar")).toBeVisible();
    await expect(page.getByText(PHONE_NOTE)).toBeHidden();
  }
});
