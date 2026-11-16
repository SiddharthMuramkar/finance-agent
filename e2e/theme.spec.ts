import { expect, type Page } from "@playwright/test";
import { quietDevtools } from "./support/app";
import { test } from "./support/people";

/**
 * Light and Dark on the public site (ADR 0019, #79). A first visit follows the device's setting; the sun/moon switch in
 * the nav (desktop) or the Menu sheet (phone) flips the theme and a `theme` cookie remembers it; a head script sets the
 * theme before the first paint, so a reload never flashes the wrong theme. Every public page and the join pages draw
 * in Dark with no fixed light colour. Every test starts signed out.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const PAPER = { light: "rgb(255, 255, 255)", dark: "rgb(14, 17, 23)" } as const; // --paper in each block of globals.css
const PUBLIC_PAGES = ["/", "/how-it-works", "/examples", "/examples/amazon-2000", "/about", "/sign-in", "/join"];
const onPhone = (name: string) => name.startsWith("p390") || name.startsWith("t768");

/**
 * Records the theme on <html> the moment <body> is parsed, before any bundle runs: an init script runs before the page's
 * own scripts, and the observer fires as the parser adds <body>. What it records is what the first paint shows.
 */
async function watchFirstPaint(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __themeAtBody?: string | null };
    new MutationObserver((_, observer) => {
      if (!document.body) return;
      w.__themeAtBody = document.documentElement.dataset.theme ?? null;
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
}
const themeAtBody = (page: Page) => page.evaluate(() => (window as unknown as { __themeAtBody?: string | null }).__themeAtBody);
const paper = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const themeCookie = async (page: Page) => (await page.context().cookies()).find((c) => c.name === "theme")?.value;

async function expectTheme(page: Page, want: "light" | "dark") {
  await expect(page.locator("html")).toHaveAttribute("data-theme", want);
  expect(await paper(page)).toBe(PAPER[want]);
}

test.beforeEach(async ({ page }) => {
  await quietDevtools(page);
});

test.describe("a device in dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("opens the site in Dark on a first visit, set before the first paint", async ({ page }) => {
    await watchFirstPaint(page);
    await page.goto("/");
    expect(await themeAtBody(page)).toBe("dark");
    await expectTheme(page, "dark");
    expect(await themeCookie(page)).toBeUndefined();
  });

  test("draws every public page and the join pages in Dark, with no fixed light colour", async ({ page }) => {
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      await expectTheme(page, "dark");
      // Every Dark colour is a token; the only pure white the site ever drew was a fixed Light value.
      const white = await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          // The dev server's own overlay (nextjs-portal) is not the site.
          .filter((el) => el.tagName !== "NEXTJS-PORTAL" && ((el as HTMLElement).offsetParent !== null || el.tagName === "svg"))
          .flatMap((el) => {
            const s = getComputedStyle(el);
            return ["backgroundColor", "color"].filter((p) => s[p as "color"] === "rgb(255, 255, 255)").map((p) => `${el.tagName.toLowerCase()}.${(el as HTMLElement).className} ${p}`);
          }),
      );
      expect(white, path).toEqual([]);
    }
  });
});

test.describe("the switch", () => {
  test.use({ colorScheme: "light" });

  test("flips the theme, saves it in the cookie, and the choice survives a reload with no flash", async ({ page }, info) => {
    await watchFirstPaint(page);
    await page.goto("/about");
    await expectTheme(page, "light");

    if (onPhone(info.project.name)) {
      await page.getByRole("button", { name: "Menu" }).click();
      const row = page.locator("#site-menu").getByTestId("theme-switch");
      await expect(row.getByText("Dark theme")).toBeVisible();
      await expect(row.getByText("Light theme")).toBeHidden();
      await row.click();
    } else {
      const button = page.locator(".v-nav-right").getByTestId("theme-switch");
      await expect(button).toHaveAttribute("aria-label", "Switch to dark theme");
      await expect(button.getByTestId("theme-icon-moon")).toBeVisible();
      await button.click();
      await expect(button).toHaveAttribute("aria-label", "Switch to light theme");
      await expect(button.getByTestId("theme-icon-sun")).toBeVisible();
      await expect(button.getByTestId("theme-icon-moon")).toBeHidden();
    }
    await expectTheme(page, "dark");
    expect(await themeCookie(page)).toBe("dark");

    await page.reload();
    expect(await themeAtBody(page)).toBe("dark");
    await expectTheme(page, "dark");

    // A saved choice beats the device: Light chosen on a dark device stays Light.
    await page.context().addCookies([{ name: "theme", value: "light", url: page.url() }]);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    expect(await themeAtBody(page)).toBe("light");
    await expectTheme(page, "light");
  });

  test("the head script alone sets the saved theme: with every bundle blocked the page still opens in Dark", async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: "theme", value: "dark", url: baseURL! }]);
    await page.route(/\/_next\/static\/.*\.js(\?.*)?$/, (route) => route.abort());
    await page.goto("/how-it-works", { waitUntil: "domcontentloaded" });
    await expectTheme(page, "dark");
  });
});
