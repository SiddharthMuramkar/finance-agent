import { expect, test } from "@playwright/test";
import { PUBLIC_PAGES } from "../src/site/routes";
import { hydrated, quietDevtools, signIn } from "./support/app";

/**
 * Issue #70: a Visitor who mistypes an address gets the public 'page not found' (status 404, the site's own look, a way
 * back Home), not the sign-in card; a Member keeps the app's not-found page. robots.txt, sitemap.xml and the icons are
 * real files a signed-out crawler can read, the signed-in pages still ask for a sign-in, and the API still answers 401.
 * Measured once, at 1,280 wide.
 */

const ONE = "w1280";
const SITE = "https://www.value-it.xyz";
const SITE_NAV = "header.v-nav";
const APP_HEADER = 'header:has(nav[aria-label="Pages"])';

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== ONE, "one width is enough: a page's status and chrome do not depend on it");
  await quietDevtools(page);
});

test.describe("signed out (a Visitor)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("an unknown address is the public 'page not found', with status 404 and a way back Home", async ({ page }) => {
    for (const path of ["/nope", "/examples/nope", "/aboutx"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      expect(new URL(page.url()).pathname, path).toBe(path);
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" }), path).toBeVisible();
      await expect(page.locator(SITE_NAV), path).toHaveCount(1);
      await expect(page.locator(APP_HEADER), path).toHaveCount(0);
      await expect(page.locator(SITE_NAV).getByRole("link", { name: "Sign in", exact: true }), path).toBeVisible();
    }
    await hydrated(page);
    await page.getByRole("link", { name: "Back to Home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "What is it really worth?" })).toBeVisible();
  });

  test("the signed-in pages still send a Visitor to the sign-in, and every API route answers 401", async ({ page }) => {
    for (const path of ["/study", "/course", "/sessions/1"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/sign-in\?next=/);
    }
    for (const path of ["/api/turn", "/api/profile", "/api/nope"]) {
      expect((await page.request.get(path, { maxRedirects: 0 })).status(), path).toBe(401);
    }
  });

  // The recorded check for "Lighthouse no longer reports 'robots.txt is not valid'": Lighthouse fails robots.txt when it is
  // not a 2xx text file or a line is not a known directive (it was the sign-in page's HTML, after a redirect).
  test("robots.txt answers 200 as plain text, every line a valid directive, naming the sitemap", async ({ page }) => {
    const response = await page.request.get("/robots.txt", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/^text\/plain/);
    const lines = (await response.text()).split("\n").map((line) => line.trim()).filter(Boolean);
    expect(lines).toContain("User-Agent: *");
    expect(lines).toContain("Allow: /");
    expect(lines).toContain("Disallow: /study");
    expect(lines).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    for (const line of lines) expect(line).toMatch(/^(User-Agent|Allow|Disallow|Sitemap|Host|Crawl-delay): \S+/i);
  });

  test("sitemap.xml answers 200 and lists the public pages from the public-route list", async ({ page }) => {
    const response = await page.request.get("/sitemap.xml", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/xml/);
    const locs = [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const expected = PUBLIC_PAGES.filter((p) => p.sitemap).map((p) => `${SITE}${p.path === "/" ? "" : p.path}`);
    expect(locs).toEqual(expected);
    expect(locs).toEqual(expect.arrayContaining([SITE, `${SITE}/how-it-works`, `${SITE}/examples`, `${SITE}/about`, `${SITE}/join`]));
  });

  test("the favicon, the icon and the Apple touch icon answer 200 with real images, and Home links them", async ({ page }) => {
    for (const [path, type] of [
      ["/favicon.ico", /^image\/(x-icon|vnd\.microsoft\.icon)/],
      ["/icon.svg", /^image\/svg\+xml/],
      ["/apple-icon.png", /^image\/png/],
    ] as const) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
      expect(response.headers()["content-type"], path).toMatch(type);
      expect((await response.body()).length, path).toBeGreaterThan(100);
    }
    await page.goto("/");
    await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveAttribute("href", /^\/apple-icon\.png/);
    await expect(page.locator('head link[rel="icon"][href^="/favicon.ico"]')).toHaveCount(1);
  });
});

test.describe("signed in (a Member)", () => {
  test("an unknown address is the Member's not-found page, with status 404 and the app's header", async ({ page }) => {
    await signIn(page);
    const response = await page.goto("/nope");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "This page isn't here" })).toBeVisible();
    await expect(page.locator(APP_HEADER)).toHaveCount(1);
    await expect(page.locator(SITE_NAV)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Back to your Topic" })).toHaveAttribute("href", "/study");
  });
});
