import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { matrixThresholds } from "../src/dev/preview-matrix";
import { hydrated, quietDevtools, seed } from "./support/app";
import { frameLook, measureLayout } from "./support/measure";

/**
 * The About page (spec 2026-11-11, D1): a public, static page linked from Home's header and footer. Signed out (no
 * saved tools cookie), a visitor presses About on Home and reads the About page, which never scrolls sideways.
 * With SHOTS=D1, the 1512 x 982 projects save the About page and Home's header in Light and Dark; with SHOTS=D4, the
 * whole About page.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const SHOTS = join("docs", "specs", "img", "2026-11-11");

// A dark project is a visitor who chose Dark: the theme cookie works signed out, and on a static page too.
test.beforeEach(async ({ page, baseURL }, info) => {
  await quietDevtools(page);
  if (info.project.name.endsWith("-dark")) await page.context().addCookies([{ name: "theme", value: "dark", url: baseURL! }]);
});

test("[D1] signed out, Home's About link opens the About page", async ({ page }, info) => {
  await page.goto("/");
  const header = page.locator("header.home-header");
  const shots = process.env.SHOTS === "D1" && (info.project.name === "mbp14" || info.project.name === "mbp14-dark");
  const theme = info.project.name.endsWith("-dark") ? "dark" : "light";
  if (shots) {
    mkdirSync(SHOTS, { recursive: true });
    await header.screenshot({ path: join(SHOTS, `D1-home-header-${theme}.png`) });
  }

  // Below 760 px the header's page links hide (G9's phone): the footer carries About there.
  const narrow = page.viewportSize()!.width < 760;
  await (narrow ? page.locator("footer") : header).getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { level: 1, name: "About Value It" })).toBeVisible();
  if (!narrow) await expect(page.locator("header.home-header").getByRole("link", { name: "About", exact: true })).toHaveAttribute("aria-current", "page");

  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways, "the About page scrolls sideways").toBeLessThanOrEqual(0);

  if (shots) await page.screenshot({ path: join(SHOTS, `D1-about-${theme}.png`) });
});

test("[D4] the About page reads at the right measure, and its Widgets play with no request", async ({ page }, info) => {
  test.skip(!["mbp14", "mbp14-dark", "w1024"].includes(info.project.name), "1512 in Light and Dark, and 1024");
  const calls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) calls.push(`${request.method()} ${request.url()}`);
  });
  await page.goto("/about");
  await hydrated(page);

  if (info.project.name === "w1024") {
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways, "the About page scrolls sideways at 1024").toBeLessThanOrEqual(0);
    return;
  }

  const dark = info.project.name.endsWith("-dark");
  if (process.env.SHOTS === "D4") {
    mkdirSync(SHOTS, { recursive: true });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.screenshot({ path: join(SHOTS, `D4-about-${dark ? "dark" : "light"}.png`), fullPage: true });
  }

  // The running prose keeps its measure: 60 to 75 characters a line at 1512.
  const { lineMin, lineMax } = matrixThresholds(info.project.name);
  const layout = await measureLayout(page, { prose: "[data-about-prose] p" });
  expect(layout.proseMeasured, "prose paragraphs measured").toBeGreaterThan(5);
  expect(layout.charsPerLine, JSON.stringify(layout)).toBeGreaterThanOrEqual(lineMin);
  expect(layout.charsPerLine, JSON.stringify(layout)).toBeLessThanOrEqual(lineMax);

  // Each Widget sits in B1's plain white frame.
  const widgets = page.getByTestId("about-widget");
  await expect(widgets).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const frame = await frameLook(page, `[data-testid="about-widget"] >> nth=${i}`);
    expect(frame.backgroundColor).toBe(dark ? "rgb(15, 15, 15)" : "rgb(255, 255, 255)");
    expect(frame.borderTopWidth).toBe("1px");
    expect(frame.borderTopColor).toBe(dark ? "rgb(31, 31, 31)" : "rgb(226, 229, 234)");
    expect(frame.boxShadow).toBe("none");
    expect(frame.radius).toBeLessThanOrEqual(12);
    expect(frame.innerBorder).toBe("0px");
  }

  // The first Widget plays in the browser: one key press on its slider grows the picture of growth (spec 2026-11-12 E6:
  // the everyday Showcase's Widget is grow_money's money pile, ₹1,000 put in and ₹331 earned at 3 years).
  await expect(widgets.first()).toContainText("Growth ₹331");
  await widgets.first().locator('input[type="range"]').first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(widgets.first()).not.toContainText("Growth ₹331");

  expect(calls, "the About page called the server").toEqual([]);
});

/**
 * Spec 2026-11-12 G1 and E11 (Done when: "A signed-in Learner on About sees Study Workspace and Sign out in the header"):
 * About shares Home's header, which reads the sign-in state on every page, and opens on a Band. The page is never cached,
 * since one address serves both kinds of visitor.
 */
test("[G1, E11] signed in, About's header offers the Study Workspace and Sign out, and the page opens on a Band", async ({ page }) => {
  await seed(page, "story");
  const response = await page.goto("/about");
  expect(response?.headers()["cache-control"]).toMatch(/no-store/);
  const header = page.locator("header.home-header");
  await expect(header.getByRole("link", { name: "Study Workspace", exact: true })).toBeVisible();
  await expect(header.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
  await expect(header.getByText("Join early access")).toHaveCount(0);
  // The opening Band: royal in both Themes, the h1 in white on it.
  const opening = page.locator('[data-band="about-opening"]');
  const look = await opening.evaluate((band) => ({ face: getComputedStyle(band).backgroundColor, ink: getComputedStyle(band.querySelector("h1")!).color, width: band.getBoundingClientRect().width, page: document.documentElement.clientWidth }));
  expect(look).toEqual({ face: "rgb(31, 63, 174)", ink: "rgb(255, 255, 255)", width: look.page, page: look.page });
  // The closing band opens the Study Workspace instead of the sign-in page; on a phone, where studying needs a laptop or
  // tablet, it sends the site there instead (E7).
  if (page.viewportSize()!.width < 768) await expect(page.locator(".home-band").getByRole("button", { name: "Send this to my laptop" })).toBeVisible();
  else await expect(page.locator(".home-band").getByRole("link", { name: "Open Study Workspace" })).toHaveAttribute("href", "/study");
});

// Spec 2026-11-12 E2 and Appendix F: About names Damodaran as the author of the valuations used as Cases, not affiliated.
test("[E2] About says the valuations are Damodaran's published work and that Value It is not affiliated", async ({ page }, info) => {
  test.skip(!["mbp14", "p390"].includes(info.project.name), "1512 and a phone");
  await page.goto("/about");
  await expect(page.getByText("The valuations used as Cases are published work by Aswath Damodaran and others, named and linked where they appear. Value It is not affiliated with them.")).toBeVisible();
});

test("[G1] signed out, About's header offers Sign in and Join early access, and no Sign out", async ({ page }) => {
  await page.goto("/about");
  const header = page.locator("header.home-header");
  await expect(header.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: /Join early access/ })).toBeVisible();
  await expect(header.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});
