import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { seed } from "./support/app";

// A1a (spec 2026-11-11): /dev/icons shows every Icon of the named set as a Lucide line drawing, on Light and on Dark.

const PROJECTS = ["mbp14", "mbp14-dark"];
const SHOTS = join("docs", "specs", "img", "2026-11-11");

test("the contact sheet shows all 167 Icons as line drawings", async ({ page }, info) => {
  test.skip(!PROJECTS.includes(info.project.name), "drawn at 1512×982, Light and Dark");
  const dark = info.project.name.endsWith("-dark");
  await page.goto(dark ? "/dev/icons?theme=dark" : "/dev/icons");
  const sheet = page.getByTestId("icon-sheet");
  await expect(sheet).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", dark ? "dark" : "light");

  const items = sheet.locator("li[data-icon-name]");
  await expect(items).toHaveCount(167);
  const wrong = await items.evaluateAll((lis) =>
    lis
      .map((li) => ({
        name: li.getAttribute("data-icon-name"),
        svgs: li.querySelectorAll("svg[data-icon]").length,
        drawn: li.querySelector("svg[data-icon]")?.getAttribute("data-icon") ?? null,
        imgs: li.querySelectorAll("img").length,
      }))
      .filter((r) => r.svgs !== 1 || r.drawn !== r.name || r.imgs !== 0),
  );
  expect(wrong).toEqual([]);
  await expect(sheet.locator("img")).toHaveCount(0);

  if (process.env.SHOTS === "A1a") {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, `A1a-icon-sheet-${dark ? "dark" : "light"}.png`) });
  }
});

// A1c (spec 2026-11-11, R6): Settings credits Lucide at its foot, under Start over; Fluent Emoji is gone.
test("Settings credits Lucide at the foot, under Start over", async ({ page }, info) => {
  test.skip(!PROJECTS.includes(info.project.name), "drawn at 1512×982, Light and Dark");
  const dark = info.project.name.endsWith("-dark");
  await seed(page, "fresh"); // an earlier test's seed may have signed the saved cookie out
  await page.goto("/settings");
  const credit = page.getByTestId("icon-credit");
  await credit.scrollIntoViewIfNeeded();
  await expect(credit).toContainText("Icons: Lucide, ISC License,");
  await expect(credit.locator('a[href="https://lucide.dev"]')).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/Fluent|Emoji/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", dark ? "dark" : "light");

  if (process.env.SHOTS === "A1c") {
    mkdirSync(SHOTS, { recursive: true });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // the dev badge sits on the credit
    await page.screenshot({ path: join(SHOTS, `A1c-settings-credit-${dark ? "dark" : "light"}.png`) });
  }
});
