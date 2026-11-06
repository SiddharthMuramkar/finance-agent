import { expect, test } from "@playwright/test";
import { hydrated, seed } from "./support/app";
import { auditAffordances, measureLayout } from "./support/measure";

// Throwaway: A5 screenshots + metrics for the critics and the PR. Not committed.
const OUT = "/Users/siddharth/Downloads/finance-agent-story-run/critics/A5";

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "mbp14" && info.project.name !== "mbp14-dark", "1512 only");
});

test("A5 screens", async ({ page }, info) => {
  const mode = info.project.name === "mbp14-dark" ? "dark" : "light";
  const shot = (name: string) => page.screenshot({ path: `${OUT}/${name}-${mode}.jpg`, type: "jpeg", quality: 80 });

  await seed(page, "many-topics");
  await page.goto("/course");
  await hydrated(page);
  await expect(page.locator("header")).toBeVisible();
  console.log(`[A5 metrics ${mode}] course`, JSON.stringify(await measureLayout(page)));
  console.log(`[A5 audit ${mode}] course`, JSON.stringify(await auditAffordances(page)));
  await shot("header-closed-course");

  await page.getByTestId("theme-menu-button").click();
  await expect(page.getByTestId("theme-menu")).toBeVisible();
  console.log(`[A5 audit ${mode}] theme-open`, JSON.stringify(await auditAffordances(page)));
  await shot("header-theme-menu-open");
  await page.keyboard.press("Escape");

  await page.getByTestId("account-menu-button").click();
  await expect(page.getByTestId("account-menu")).toBeVisible();
  console.log(`[A5 audit ${mode}] account-open`, JSON.stringify(await auditAffordances(page)));
  await shot("header-account-menu-open");
  await page.keyboard.press("Escape");

  await page.goto("/settings");
  await hydrated(page);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  console.log(`[A5 metrics ${mode}] settings`, JSON.stringify(await measureLayout(page)));
  console.log(`[A5 audit ${mode}] settings`, JSON.stringify(await auditAffordances(page)));
  await shot("settings");
});
