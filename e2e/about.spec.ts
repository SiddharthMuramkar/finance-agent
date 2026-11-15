import { expect, test } from "@playwright/test";
import { quietDevtools, seed, siteReady } from "./support/app";

/**
 * The About page (Signal spec 7.6, decision #7): a public page in the site chrome (4.1 to 4.3), linked from the nav and the
 * footer. Signed out (no saved tools cookie), a visitor presses About on Home and reads the About page, which never
 * scrolls sideways. At 860 px and below the nav's page links give way to its Menu button (4.2), so the footer carries
 * About there.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const NAV = "header.v-nav";
const narrowAt = (width: number) => width <= 860;

test.beforeEach(async ({ page }) => {
  await quietDevtools(page);
});

test("[D1] signed out, Home's About link opens the About page", async ({ page }) => {
  await page.goto("/");
  // React must own the page before the press, so the press is the router's navigation and focus moves to the new h1
  // (7.1, 9.4). Pressed earlier, it would be a plain browser load of /about: a different path, and one whose timing
  // depends on the server.
  await siteReady(page);
  const narrow = narrowAt(page.viewportSize()!.width);
  const from = narrow ? page.locator("footer.v-footer") : page.locator(NAV).getByRole("navigation", { name: "Main" });
  await from.getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  const h1 = page.getByRole("heading", { level: 1, name: "About Value It" });
  await expect(h1).toBeVisible();
  await expect(h1).toBeFocused();
  if (!narrow) await expect(page.locator(NAV).getByRole("navigation", { name: "Main" }).getByRole("link", { name: "About", exact: true })).toHaveAttribute("aria-current", "page");

  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways, "the About page scrolls sideways").toBeLessThanOrEqual(0);
});

test("[7.6] the About page makes no request of its own", async ({ page }, info) => {
  test.skip(!["mbp14", "p390"].includes(info.project.name), "1512 and a phone");
  const calls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) calls.push(`${request.method()} ${request.url()}`);
  });
  await page.goto("/about");
  await siteReady(page);
  // Its FAQ opens in place.
  const faq = page.locator("#faq");
  await faq.locator("summary").first().click();
  await expect(faq.locator("details").first()).toHaveAttribute("open", "");
  await page.waitForLoadState("networkidle");
  expect(calls, "the About page called the server").toEqual([]);
});

/**
 * Spec 4.2 and 7.1: About shares the site nav, which reads the sign-in state on every page, so the page is never cached
 * (one address serves both kinds of visitor). A member gets Continue and the account menu, never Sign in or Join, and the
 * closing block offers Continue too.
 */
test("[4.2, 7.1] signed in, About's nav offers Continue and the account menu, and the page is never cached", async ({ page }) => {
  await seed(page, "story");
  const response = await page.goto("/about");
  expect(response?.headers()["cache-control"]).toMatch(/no-store/);
  const nav = page.locator(NAV);
  await expect(nav.getByRole("button", { name: /^Continue/ })).toBeVisible();
  await expect(nav.locator("summary")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Join early access" })).toHaveCount(0);
  await expect(page.locator('[data-site-section="closing"]').getByRole("button", { name: /^Continue/ })).toBeVisible();
});

// Signal spec 7.6 and Appendix B: About names Damodaran as the author of the valuations used as cases, not affiliated.
test("[7.6] About says the valuations are Damodaran's published work and that Value It is not affiliated", async ({ page }, info) => {
  test.skip(!["mbp14", "p390"].includes(info.project.name), "1512 and a phone");
  await page.goto("/about");
  await expect(page.getByText("The valuations used as cases are published work by Aswath Damodaran and others, named and linked where they appear. Value It is not affiliated with them.")).toBeVisible();
});

test("[4.2] signed out, About offers Sign in and Join early access, which opens /join, and no Sign out", async ({ page }) => {
  await page.goto("/about");
  const nav = page.locator(NAV);
  const narrow = narrowAt(page.viewportSize()!.width);
  // Sign in sits in the nav, or in the footer once the nav folds into Menu.
  await expect((narrow ? page.locator("footer.v-footer") : nav).getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  const join = nav.getByRole("link", { name: "Join early access", exact: true });
  await expect(join).toBeVisible();
  await expect(join).toHaveAttribute("href", "/join");
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});
