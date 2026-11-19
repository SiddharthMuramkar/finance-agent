import { expect, test, type Page } from "@playwright/test";
import { SIGN_IN_PATH } from "../src/auth/destination";
import { SITE_PAGES_ONE_CASE } from "../src/site/routes";
import { hydrated, quietDevtools, seed } from "./support/app";

/**
 * Two headers (spec 2026-11-12 G1, kept by the Signal site): the site nav (Signal spec 4.2: Home, How it works, Examples,
 * the case pages, About and the sign-in page) and the app's (`AppHeader`: Study, Course Map and Notebook, on every
 * signed-in page). Each page shows exactly one of them, and the site nav reads the viewer state: a visitor gets Sign in and
 * Join the waitlist; a member gets Continue and the account menu, never Sign in or Join. Measured once, at 1,280 wide.
 */

const ONE = "w1280";
const PUBLIC = "header.v-nav";
const APP = 'header:has(nav[aria-label="Pages"])';
/** The site pages (one case page for the five) and the sign-in page, from the one public-route list (issue #69). */
const SITE_PAGES = [...SITE_PAGES_ONE_CASE, SIGN_IN_PATH];

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== ONE, "one width is enough: which header a page has does not depend on it");
  await quietDevtools(page);
});

/** How many of each header the page has, after it hydrated. */
async function headers(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(200);
  await hydrated(page);
  return { path, public: await page.locator(PUBLIC).count(), app: await page.locator(APP).count(), all: await page.locator("header").count() };
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // On the sign-in page itself Sign in is the page showing and the page's own button its one primary (Signal spec 5), so
  // the nav has no Join the waitlist there (G1).
  test("[G1, 4.2] every site page and the sign-in page have the site nav, once, and never the app's", async ({ page }) => {
    for (const path of SITE_PAGES) {
      const found = await headers(page, path);
      expect({ public: found.public, app: found.app }, path).toEqual({ public: 1, app: 0 });
      const header = page.locator(PUBLIC);
      const signIn = header.getByRole("link", { name: "Sign in", exact: true });
      await expect(signIn, path).toBeVisible();
      if (path === "/sign-in") {
        await expect(signIn, path).toHaveAttribute("aria-current", "page");
        await expect(header.getByText("Join the waitlist"), path).toHaveCount(0);
      } else {
        await expect(signIn, path).not.toHaveAttribute("aria-current", /.*/);
        await expect(header.getByRole("link", { name: "Join the waitlist", exact: true }), path).toBeVisible();
      }
      await expect(header.getByRole("button", { name: "Continue" }), path).toHaveCount(0);
    }
  });

  test("[4.2] the page showing is marked in the nav, and a case page counts as Examples", async ({ page }) => {
    for (const [path, current] of [
      ["/how-it-works", "How it works"],
      ["/examples", "Examples"],
      ["/examples/wework-2019", "Examples"],
      ["/about", "About"],
    ] as const) {
      await page.goto(path);
      const nav = page.locator(PUBLIC).getByRole("navigation", { name: "Main" });
      await expect(nav.getByRole("link", { name: current, exact: true }), path).toHaveAttribute("aria-current", "page");
      await expect(nav.locator('[aria-current="page"]'), path).toHaveCount(1);
    }
  });
});

test.describe("signed in", () => {
  test("[G1] the Study Workspace, Course Map, Notebook and Settings have the app header, once, and never the site nav", async ({ page }) => {
    await seed(page, "many-topics");
    for (const path of ["/study", "/course", "/notebook", "/settings"]) {
      expect(await headers(page, path)).toEqual({ path, public: 0, app: 1, all: 1 });
    }
  });

  test("[4.2] on Home a member's nav offers Continue and the account menu, not Sign in or Join the waitlist", async ({ page }) => {
    await seed(page, "story");
    expect(await headers(page, "/")).toMatchObject({ public: 1, app: 0 });
    const header = page.locator(PUBLIC);
    await expect(header.getByRole("button", { name: /^Continue/ })).toBeVisible();
    await header.getByRole("button", { name: "Account menu", exact: true }).click();
    for (const name of ["Course map", "Notebook", "Account settings"]) await expect(header.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(header.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    await expect(header.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
    await expect(header.getByText("Join the waitlist")).toHaveCount(0);
    await expect(header.locator("a[data-join]")).toHaveCount(0);
  });

  // Audit batch 2: the account menu is a native popover (popover="auto"), so the browser closes it on Esc, handing focus
  // back to the avatar, and on a press outside; its links stay in Tab order after the avatar.
  test("[4.2] the account menu hangs under the avatar and closes on Esc and on a press outside", async ({ page }) => {
    await seed(page, "story");
    await page.goto("/");
    await hydrated(page);
    const header = page.locator(PUBLIC);
    const avatar = header.getByRole("button", { name: "Account menu", exact: true });
    const menu = header.locator(".v-account-menu");
    await expect(avatar).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeHidden();
    await avatar.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await expect(avatar).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    await expect(menu.getByRole("link", { name: "Course map", exact: true })).toBeFocused();
    // Under the avatar: with anchor positioning 8 px below it, right edges flush; without, 8 px below the nav.
    const anchored = await page.evaluate(() => CSS.supports("position-area", "block-end"));
    const [a, m, nav] = [(await avatar.boundingBox())!, (await menu.boundingBox())!, (await header.boundingBox())!];
    if (anchored) {
      expect(Math.round(m.y - (a.y + a.height))).toBe(8);
      expect(Math.abs(m.x + m.width - (a.x + a.width))).toBeLessThanOrEqual(1);
    } else expect(Math.round(m.y - (nav.y + nav.height))).toBe(8);

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(avatar).toBeFocused();
    await expect(avatar).toHaveAttribute("aria-expanded", "false");

    await avatar.click();
    await expect(menu).toBeVisible();
    await page.locator("main h1").click();
    await expect(menu).toBeHidden();
    await expect(avatar).toHaveAttribute("aria-expanded", "false");
  });

  test("[G1] Sign out in the account menu lands on Home, signed out, where the nav then offers Sign in", async ({ page }) => {
    await seed(page, "story");
    await page.goto("/");
    await hydrated(page);
    await page.locator(PUBLIC).getByRole("button", { name: "Account menu", exact: true }).click();
    await page.locator(PUBLIC).getByRole("button", { name: "Sign out", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/");
    const header = page.locator(PUBLIC);
    await expect(header.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await expect(header.getByRole("link", { name: "Join the waitlist", exact: true })).toBeVisible();
    await expect(header.getByRole("button", { name: /^Continue/ })).toHaveCount(0);
    // Signed out for real, not only on this page: the Study Workspace now sends the visitor to sign in.
    await page.goto("/study");
    await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
  });
});
