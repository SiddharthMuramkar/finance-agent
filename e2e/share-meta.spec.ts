import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { EXAMPLES, examplePath } from "../src/site/examples";
import { quietDevtools, signIn } from "./support/app";

/**
 * Titles, canonical links and share images (issue #71). Every public page, the joining pages and the 404 carry their own
 * document title (Signal spec 7.1: "Page · Value It", Home plain "Value It") and a canonical link on the public domain.
 * A shared link to Home or to an Example shows its own title and a share image drawn in today's look: the Example's
 * card shows its own question, so no two are the same, and none is the old Study Workspace screenshot. Read from the
 * meta tags a link preview reads, at one width.
 */

const ONE = "w1280";
const SITE = "https://www.value-it.xyz";
const OLD_SCREENSHOT = "/landing-assets/workspace-light.png";

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== ONE, "meta tags do not depend on the width");
  await quietDevtools(page);
});

const meta = (page: Page, property: string) => page.locator(`meta[property="${property}"], meta[name="${property}"]`).first().getAttribute("content");
const canonical = (page: Page) => page.locator('link[rel="canonical"]').getAttribute("href");

/** The image a shared link shows: fetched from this server, a PNG, with its width and height from the PNG header. */
async function shareImage(request: APIRequestContext, url: string) {
  const { pathname, search } = new URL(url);
  const response = await request.get(pathname + search);
  expect(response.status(), url).toBe(200);
  expect(response.headers()["content-type"], url).toContain("image/png");
  const bytes = await response.body();
  return { path: pathname, size: { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }, bytes };
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  // A dozen pages in one test, some not warmed (the joining pages), each drawn per request.
  test.describe.configure({ timeout: 180_000 });

  const PAGES: { path: string; title: string }[] = [
    { path: "/", title: "Value It" },
    { path: "/how-it-works", title: "How it works · Value It" },
    { path: "/examples", title: "Examples · Value It" },
    ...EXAMPLES.map((e) => ({ path: examplePath(e.slug), title: `${e.question} · Value It` })),
    { path: "/about", title: "About · Value It" },
    { path: "/join", title: "Join the waitlist · Value It" },
    { path: "/sign-in", title: "Sign in · Value It" },
    { path: "/sign-up", title: "Create your account · Value It" },
  ];

  test("[#71] every public page and joining page has its own title and a canonical link on the public domain", async ({ page }) => {
    for (const { path, title } of PAGES) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page, path).toHaveTitle(title);
      expect(await canonical(page), path).toBe(`${SITE}${path === "/" ? "" : path}`);
    }
    expect(new Set(PAGES.map((p) => p.title)).size).toBe(PAGES.length);
  });

  test("[#71] a shared link to Home shows Home's title and a share image in today's look", async ({ page, request }) => {
    await page.goto("/");
    expect(await meta(page, "og:title")).toBe("Value It: Learn what things are worth.");
    expect(await meta(page, "og:url")).toBe(SITE);
    const og = await meta(page, "og:image");
    expect(og).not.toContain(OLD_SCREENSHOT);
    const image = await shareImage(request, og!);
    expect(image.size).toEqual({ width: 1200, height: 630 });
    expect(await meta(page, "og:image:alt")).toBeTruthy();
    expect(await meta(page, "twitter:card")).toBe("summary_large_image");
    expect(await meta(page, "twitter:image")).toBe(og);
  });

  test("[#71] a shared link to each Example shows its own question and its own share image", async ({ page, request }) => {
    await page.goto("/");
    const home = await shareImage(request, (await meta(page, "og:image"))!);
    const seen = new Set<string>([home.bytes.toString("base64")]);
    for (const example of EXAMPLES) {
      const path = examplePath(example.slug);
      await page.goto(path);
      expect(await meta(page, "og:title"), path).toBe(`${example.question} · Value It`);
      expect(await meta(page, "og:url"), path).toBe(`${SITE}${path}`);
      const og = (await meta(page, "og:image"))!;
      expect(og, path).toBe(`${SITE}/share-image/${example.slug}.png`);
      expect(await meta(page, "og:image:alt"), path).toBe(example.question);
      expect(await meta(page, "twitter:image"), path).toBe(og);
      const image = await shareImage(request, og);
      expect(image.size, path).toEqual({ width: 1200, height: 630 });
      seen.add(image.bytes.toString("base64"));
    }
    expect(seen.size, "each Example's image differs from Home's and from the others").toBe(EXAMPLES.length + 1);
  });

  test("[#71] the old Study Workspace screenshot is no longer served", async ({ request }) => {
    const response = await request.get(OLD_SCREENSHOT, { maxRedirects: 0 });
    expect(response.headers()["content-type"] ?? "").not.toContain("image/");
  });
});

// Signed in: signed out, the proxy sends an unknown address to the sign-in. Signs in itself, so it never depends on
// another spec leaving the saved session alive.
test("[#71] the 404 has its own title", async ({ page }) => {
  await signIn(page);
  const response = await page.goto(`${examplePath("no-such-example")}`);
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle("Page not found · Value It");
});
