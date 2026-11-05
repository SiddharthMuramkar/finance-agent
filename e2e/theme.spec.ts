import { expect, test, type Page } from "@playwright/test";
import { seed, theme } from "./support/app";

/** Two themes (spec 2026-11-05, ticket A4): old cookies still open, the page colours are the new tokens, a pick survives a reload. */

const LIGHT_BG = "rgb(246, 248, 255)";
const DARK_BG = "rgb(20, 26, 51)";

const html = (page: Page) => page.locator("html");
const bodyBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

async function openWithCookie(page: Page, baseURL: string | undefined, value: string | null) {
  await seed(page, "story");
  await page.context().clearCookies({ name: "theme" });
  if (value !== null) await page.context().addCookies([{ name: "theme", value, url: baseURL! }]);
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
}

test.describe("old cookies still open", () => {
  test.use({ colorScheme: "light" });

  test("single:paper opens Light", async ({ page, baseURL }) => {
    await openWithCookie(page, baseURL, "single:paper");
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await expect(html(page)).not.toHaveClass(/\bdark\b/);
    expect(await bodyBackground(page)).toBe(LIGHT_BG);
  });

  test("single:forest opens Dark, even on a Mac in light mode", async ({ page, baseURL }) => {
    await openWithCookie(page, baseURL, "single:forest");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await expect(html(page)).toHaveClass(/\bdark\b/);
    expect(await bodyBackground(page)).toBe(DARK_BG);
  });
});

test.describe("match my mac", () => {
  test.use({ colorScheme: "dark" });

  test("system with the Mac in dark mode opens Dark", async ({ page, baseURL }) => {
    await openWithCookie(page, baseURL, "system");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await expect(html(page)).toHaveClass(/\bdark\b/);
    expect(await bodyBackground(page)).toBe(DARK_BG);
  });

  test("a four-theme pair opens by the Mac's mode", async ({ page, baseURL }) => {
    await openWithCookie(page, baseURL, "system:paper:forest");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html(page)).toHaveAttribute("data-theme", "light");
  });
});

test.describe("the menu", () => {
  test.use({ colorScheme: "light" });

  test("picking Dark in the menu survives a reload", async ({ page, baseURL }) => {
    await openWithCookie(page, baseURL, null);
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    expect(await bodyBackground(page)).toBe(LIGHT_BG);
    await theme(page, "Dark");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    expect(await bodyBackground(page)).toBe(DARK_BG);
    await page.reload();
    await expect(page.getByTestId("workspace-frame")).toBeVisible();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    expect(await bodyBackground(page)).toBe(DARK_BG);
    await expect(page.getByTestId("theme-menu-button").first()).toHaveAttribute("aria-label", "Theme: Dark");
  });
});
