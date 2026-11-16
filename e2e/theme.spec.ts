import { expect, type Page } from "@playwright/test";
import { darkTokens, lightTokens } from "../src/app/theme-tokens";
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
const PUBLIC_PAGES = ["/", "/how-it-works", "/examples", "/examples/amazon-2000", "/about", "/privacy", "/terms", "/sign-in", "/sign-up", "/join", "/no-such-page"];

/** "#rrggbb" as getComputedStyle writes it, "rgb(r, g, b)". */
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
/**
 * The Light colours Dark never uses (paper's white, the Light wash, ink-2, muted, the Light blue...), read from the token
 * blocks of globals.css: a page in Dark that paints one has a fixed Light colour somewhere.
 */
const DARK = new Set(Object.values(darkTokens()));
const LIGHT_ONLY = [...new Set(Object.values(lightTokens()))].filter((v) => /^#[0-9a-f]{6}$/i.test(v) && !DARK.has(v)).map(rgb);
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
      // Every Dark colour is a token, so no element paints a colour only the Light block holds (pure white among them).
      const fixed = await page.evaluate((lightOnly) =>
        [...document.querySelectorAll("body *")]
          // The dev server's own overlay (nextjs-portal) is not the site.
          .filter((el) => el.tagName !== "NEXTJS-PORTAL" && ((el as HTMLElement).offsetParent !== null || el.tagName === "svg"))
          .flatMap((el) => {
            const s = getComputedStyle(el);
            return (["backgroundColor", "color", "borderTopColor"] as const)
              .filter((p) => lightOnly.includes(s[p]) && !(p === "borderTopColor" && s.borderTopWidth === "0px"))
              .map((p) => `${el.tagName.toLowerCase()}.${(el as HTMLElement).className} ${p} ${s[p]}`);
          }),
      LIGHT_ONLY);
      expect(fixed, path).toEqual([]);
    }
  });
});

// Paper is white whatever the theme: a page printed in Dark (the head script sets Dark on every route, the Notebook too)
// prints in the Light palette with the print block's ink, never Dark's near-white ink on white paper.
test.describe("printing in Dark", () => {
  test.use({ colorScheme: "dark" });

  test("prints with dark ink on white paper", async ({ page }) => {
    await page.goto("/about");
    await expectTheme(page, "dark");
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const printed = await page.evaluate(() => ({ paper: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.querySelector("h1")!).color }));
    expect(printed).toEqual({ paper: "rgb(255, 255, 255)", ink: "rgb(0, 0, 0)" });
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
