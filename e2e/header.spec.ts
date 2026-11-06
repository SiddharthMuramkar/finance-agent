import { expect, test, type Page } from "@playwright/test";
import { hydrated, seed } from "./support/app";
import { measureLayout } from "./support/measure";

/**
 * A5: the slim header (spec 2026-11-05, ticket A5). Three page pills, then theme, Settings gear and account icons;
 * one line and at most 56px tall at 1512 and 1024; the gear opens Settings; the account menu signs out to Home.
 */

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "mbp14" && info.project.name !== "w1024", "the header is measured at 1512×982 and 1024×768");
});

async function course(page: Page) {
  await seed(page, "many-topics");
  await page.goto("/course");
  await hydrated(page);
  await expect(page.locator("header")).toBeVisible();
}

test("[A5] header fits: 56px or less, on one line", async ({ page }) => {
  await course(page);
  expect((await measureLayout(page)).headerHeight).toBeLessThanOrEqual(56);
  // One line: the brand, the last page pill and the account button share a vertical centre (within a pixel or two).
  const centres = await page.evaluate(() => {
    const centre = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return Math.round(r.top + r.height / 2);
    };
    return [
      centre(document.querySelector('header a[title="Home"]')),
      centre(document.querySelector('header nav a[href="/notebook"]')),
      centre(document.querySelector('[data-testid="account-menu-button"]')),
    ];
  });
  expect(centres.every((c) => c !== null)).toBe(true);
  expect(Math.max(...(centres as number[])) - Math.min(...(centres as number[]))).toBeLessThanOrEqual(2);
});

test("[A5] Tab order is brand, Study, Course Map, Notebook, theme, Settings, account", async ({ page }) => {
  await course(page);
  const names: string[] = [];
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press("Tab");
    names.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return (el?.getAttribute("aria-label") || el?.textContent || "").trim().replace(/\s+/g, " ");
      }),
    );
  }
  expect(names[0]).toBe("Finance Agent");
  expect(names.slice(1, 4)).toEqual(["Study", "Course Map", "Notebook"]);
  expect(names[4]).toMatch(/^Theme/);
  expect(names[5]).toBe("Settings");
  expect(names[6]).toBe("Account menu");
});

test("[A5] clicking the gear opens /settings with h1 Settings", async ({ page }) => {
  await course(page);
  await page.locator("header").getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
});

test("[A5] the account menu names the Learner and Sign out ends on Home, signed out", async ({ page }) => {
  await course(page);
  await page.getByTestId("account-menu-button").click();
  const menu = page.getByTestId("account-menu");
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("tools");
  await menu.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Sign in", exact: true }).first()).toBeVisible();
});
