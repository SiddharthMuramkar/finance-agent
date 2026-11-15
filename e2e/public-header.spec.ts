import { expect, test, type Page } from "@playwright/test";
import { hydrated, quietDevtools, seed } from "./support/app";

/**
 * Two headers (spec 2026-11-12 G1, E11): the public one (`HomeHeader`: Home, About and the sign-in page) and the app's
 * (`AppHeader`: Study, Course Map and Notebook, on every signed-in page). Each page shows exactly one of them, and the
 * public one reads the sign-in state: signed in, it offers the Study Workspace and Sign out, never Sign in or Join early
 * access (E11, Done when: "A signed-in Learner on About sees Study Workspace and Sign out in the header"; About itself is
 * covered in about.spec.ts). Measured once, at 1,280 wide.
 */

const ONE = "w1280";
const PUBLIC = "header.home-header";
const APP = 'header:has(nav[aria-label="Pages"])';

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

  test("[G1] Home, About and the sign-in page have the public header, once, and never the app's", async ({ page }) => {
    for (const path of ["/", "/about", "/sign-in"]) {
      expect(await headers(page, path)).toEqual({ path, public: 1, app: 0, all: 1 });
      const header = page.locator(PUBLIC);
      await expect(header.getByRole("link", { name: "Sign in", exact: true }), path).toBeVisible();
      await expect(header.getByRole("link", { name: "Study Workspace", exact: true }), path).toHaveCount(0);
      await expect(header.getByRole("button", { name: "Sign out", exact: true }), path).toHaveCount(0);
    }
  });
});

test.describe("signed in", () => {
  test("[G1] the Study Workspace, Course Map, Notebook and Settings have the app header, once, and never the public one", async ({ page }) => {
    await seed(page, "many-topics");
    for (const path of ["/study", "/course", "/notebook", "/settings"]) {
      expect(await headers(page, path)).toEqual({ path, public: 0, app: 1, all: 1 });
    }
  });

  test("[G1, E11] on Home the public header offers the Study Workspace and Sign out, not Sign in or Join early access", async ({ page }) => {
    await seed(page, "story");
    expect(await headers(page, "/")).toEqual({ path: "/", public: 1, app: 0, all: 1 });
    const header = page.locator(PUBLIC);
    await expect(header.getByRole("link", { name: "Study Workspace", exact: true })).toHaveAttribute("href", "/study");
    await expect(header.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    await expect(header.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
    await expect(header.getByText("Join early access")).toHaveCount(0);
    await expect(header.locator("a[data-join]")).toHaveCount(0);
  });

  test("[G1] Sign out in the public header lands on Home, signed out, where the header then offers Sign in", async ({ page }) => {
    await seed(page, "story");
    await page.goto("/");
    await hydrated(page);
    await page.locator(PUBLIC).getByRole("button", { name: "Sign out", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/");
    const header = page.locator(PUBLIC);
    await expect(header.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await expect(header.getByRole("link", { name: /Join early access/ })).toBeVisible();
    await expect(header.getByRole("link", { name: "Study Workspace", exact: true })).toHaveCount(0);
    await expect(header.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
    // Signed out for real, not only on this page: the Study Workspace now sends the visitor to sign in.
    await page.goto("/study");
    await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
  });
});
