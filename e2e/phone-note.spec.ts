import { expect, test, type Page } from "@playwright/test";
import { quietDevtools, seed } from "./support/app";
import { screenAt } from "../src/app/screen";

/**
 * The phone and the tablet (spec #68, #82; was 2026-11-12 G9's phone note): the Study Workspace opens at every width. Below
 * 768 px the conversation fills the screen and the Widget panel waits below it (e2e/phone-workspace.spec.ts opens it);
 * from 768 px the two columns are as they were. Runs on the p360, p390 and t768 projects only.
 */

test.beforeEach(async ({ page }, info) => {
  test.skip(!["p360", "p390", "t768"].includes(info.project.name), "the phone and tablet projects");
  await quietDevtools(page);
});

const isPhone = (page: Page) => screenAt(page.viewportSize()!.width) === "phone";

test("[#82] the Study Workspace opens on a phone and a tablet, with no 'bigger screen' note", async ({ page }) => {
  await seed(page, "story");
  await page.goto("/study");
  await expect(page.getByTestId("topic-bar")).toBeVisible();
  await expect(page.getByTestId("chat-column")).toBeVisible();
  await expect(page.getByText("needs a bigger screen")).toHaveCount(0);
  if (isPhone(page)) await expect(page.getByTestId("panel-column")).toBeHidden();
  else await expect(page.getByTestId("panel-column")).toBeVisible();
});
