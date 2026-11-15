import { expect, test, type Page } from "@playwright/test";
import { THEME_SWATCH, TOGGLE_LABEL, type ThemeId } from "../src/app/theme";
import { hydrated, seed } from "./support/app";

/**
 * Two modes, one toggle: everyone starts in Light, whatever the computer says; old cookies still open; the
 * header's sun/moon toggle switches at once and is remembered across a reload and across pages; Settings' two radios
 * share its choice. Every case sets its own cookie and colour scheme, so it runs on mbp14 only.
 */

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "mbp14", "every case sets its own cookie and colour scheme");
});

const html = (page: Page) => page.locator("html");
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const toggle = (page: Page) => page.getByTestId("theme-toggle").first();
const themeCookie = async (page: Page) => (await page.context().cookies()).find((c) => c.name === "theme")?.value;

/** The page is in `want`: the attribute and class on <html>, the body's paper, the toggle's name and its icon. */
async function expectTheme(page: Page, want: ThemeId) {
  await expect(html(page)).toHaveAttribute("data-theme", want);
  if (want === "dark") await expect(html(page)).toHaveClass(/\bdark\b/);
  else await expect(html(page)).not.toHaveClass(/\bdark\b/);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(rgb(THEME_SWATCH[want].paper));
  await expect(toggle(page)).toHaveAttribute("aria-label", TOGGLE_LABEL[want]);
  await expect(toggle(page)).toHaveAttribute("title", TOGGLE_LABEL[want]);
  await expect(toggle(page).getByTestId(want === "dark" ? "theme-icon-sun" : "theme-icon-moon")).toBeVisible();
  await expect(toggle(page).getByTestId(want === "dark" ? "theme-icon-moon" : "theme-icon-sun")).toBeHidden();
}

async function openWithCookie(page: Page, baseURL: string | undefined, value: string | null, path = "/study") {
  await seed(page, "story");
  await page.context().clearCookies({ name: "theme" });
  if (value !== null) await page.context().addCookies([{ name: "theme", value, url: baseURL! }]);
  await page.goto(path);
  if (path === "/study") await expect(page.getByTestId("workspace-frame")).toBeVisible();
  await hydrated(page);
}

test.describe("everyone starts in Light, whatever the computer says", () => {
  test.use({ colorScheme: "dark" });

  for (const value of [null, "system", "system:paper:forest"]) {
    test(`${value ?? "no cookie"} on a dark computer opens Light and stays Light when the computer flips`, async ({ page, baseURL }) => {
      await openWithCookie(page, baseURL, value);
      await expectTheme(page, "light");
      await page.emulateMedia({ colorScheme: "light" });
      await expectTheme(page, "light");
      await page.emulateMedia({ colorScheme: "dark" });
      await expectTheme(page, "light");
    });
  }
});

test.describe("old cookies still open", () => {
  test.use({ colorScheme: "light" });

  test("single:paper opens Light", async ({ page, baseURL }) => {
    await openWithCookie(page, baseURL, "single:paper");
    await expectTheme(page, "light");
  });

  for (const value of ["single:forest", "single:dark", "dark"]) {
    test(`${value} opens Dark, even on a light computer`, async ({ page, baseURL }) => {
      await openWithCookie(page, baseURL, value);
      await expectTheme(page, "dark");
    });
  }
});

test.describe("the toggle", () => {
  test.use({ colorScheme: "light" });

  test("a press gives Dark and saves it; it survives a reload and a visit to Course Map; a second press goes back", async ({ page, baseURL }) => {
    await openWithCookie(page, baseURL, null);
    await expectTheme(page, "light");
    await toggle(page).click();
    await expectTheme(page, "dark");
    expect(await themeCookie(page)).toBe("dark");
    await page.reload();
    await expect(page.getByTestId("workspace-frame")).toBeVisible();
    await expectTheme(page, "dark");
    await page.goto("/course");
    await hydrated(page);
    await expectTheme(page, "dark");
    await toggle(page).click();
    await expectTheme(page, "light");
    expect(await themeCookie(page)).toBe("light");
  });

  test("Enter and Space press it, and focus stays on it", async ({ page, baseURL }) => {
    await openWithCookie(page, baseURL, null, "/course");
    await toggle(page).focus();
    await page.keyboard.press("Enter");
    await expectTheme(page, "dark");
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press("Space");
    await expectTheme(page, "light");
    await expect(toggle(page)).toBeFocused();
  });

  test("on Settings, the two radios and the toggle share one choice, and Match my Mac is gone", async ({ page, baseURL }) => {
    await openWithCookie(page, baseURL, null, "/settings");
    const appearance = page.locator("#appearance");
    await expect(appearance.getByRole("radio")).toHaveCount(2);
    await expect(appearance.getByRole("radio", { name: "Light" })).toBeChecked();
    await expect(page.getByText("Match my Mac")).toHaveCount(0);
    await appearance.getByRole("radio", { name: "Dark" }).check();
    await expectTheme(page, "dark");
    expect(await themeCookie(page)).toBe("dark");
    await toggle(page).click();
    await expectTheme(page, "light");
    await expect(appearance.getByRole("radio", { name: "Light" })).toBeChecked();
  });
});
