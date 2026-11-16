import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { hydrated, quietDevtools, seed, type State } from "./support/app";

/**
 * Dark in the Study Workspace and every Widget (ADR 0019, #80). The same sun/moon switch as the site nav sits in the app
 * bar: a press flips the theme, the `theme` cookie remembers it, and every signed-in page opens in it from then on. On a
 * device set to dark (the mbp14-dark project, no cookie) the Study Workspace, its Widgets, the Band step bar, the charts
 * and the Notebook draw in Dark with no fixed light colour. The flat-look and affordance audits themselves run in Dark
 * through DARK_SPECS (playwright.config.ts).
 */

const PAPER = { light: "rgb(255, 255, 255)", dark: "rgb(14, 17, 23)" } as const; // --paper in each block of globals.css
const isDark = (project: string) => project.endsWith("-dark");

const themeCookie = async (page: Page) => (await page.context().cookies()).find((c) => c.name === "theme")?.value;
async function expectTheme(page: Page, want: "light" | "dark") {
  await expect(page.locator("html")).toHaveAttribute("data-theme", want);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(PAPER[want]);
}
const appBarSwitch = (page: Page) => page.locator("header").getByTestId("theme-switch");

/** Elements on screen painted pure white (background or text): in Dark every colour is a token, so none should be. */
const pureWhite = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      // The dev server's own overlay (nextjs-portal) is not the app.
      .filter((el) => el.tagName !== "NEXTJS-PORTAL" && !el.closest("nextjs-portal") && ((el as HTMLElement).offsetParent !== null || el.tagName === "svg"))
      .flatMap((el) => {
        const s = getComputedStyle(el);
        return ["backgroundColor", "color"].filter((p) => s[p as "color"] === "rgb(255, 255, 255)").map((p) => `${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? (el as HTMLElement).className}] ${p}`);
      }),
  );

test.beforeEach(async ({ page }) => {
  await quietDevtools(page);
});

test("[#80] a Learner flips the theme from the app bar, and it stays flipped across pages", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "flipped from Light on a light device, at 1512");
  await seed(page, "story");
  await page.goto("/study");
  await hydrated(page);
  await expectTheme(page, "light");
  await expect(appBarSwitch(page)).toHaveAccessibleName("Switch to dark theme");

  await appBarSwitch(page).click();
  await expectTheme(page, "dark");
  expect(await themeCookie(page)).toBe("dark");
  await expect(appBarSwitch(page)).toHaveAccessibleName("Switch to light theme");
  await expect(appBarSwitch(page)).toBeFocused();

  // Through the app bar's own links, then a fresh load of the Study Workspace: Dark every time, the sun showing.
  for (const name of ["Course Map", "Notebook"]) {
    await page.locator("header nav").getByRole("link", { name, exact: true }).click();
    await expect(page.locator("header nav [aria-current=page]")).toHaveText(name);
    await expectTheme(page, "dark");
  }
  await page.locator("header").getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expectTheme(page, "dark");
  await page.goto("/study");
  await hydrated(page);
  await expectTheme(page, "dark");
  await expect(appBarSwitch(page).getByTestId("theme-icon-sun")).toBeVisible();
  await expect(appBarSwitch(page).getByTestId("theme-icon-moon")).toBeHidden();

  // And back: Light, remembered the same way.
  await appBarSwitch(page).click();
  await expectTheme(page, "light");
  expect(await themeCookie(page)).toBe("light");
  await page.goto("/course");
  await expectTheme(page, "light");
});

// The Study Workspace in the states that show a Widget with a chart, the Band step bar and a Story scene, and the Notebook.
const DARK_PAGES: { state: State; path: string; ready: string }[] = [
  { state: "concept-widget", path: "/study", ready: "widget-card" },
  { state: "story-scene", path: "/study", ready: "widget-card" },
  { state: "quiz-open", path: "/study", ready: "workspace-frame" },
  { state: "story", path: "/notebook", ready: "reading-column" },
];

test("[#80] on a dark device the Study Workspace, its Widgets, the Band and the Notebook draw in Dark, with no fixed light colour", async ({ page }, info) => {
  test.skip(!isDark(info.project.name), "a device set to dark (mbp14-dark)");
  for (const { state, path, ready } of DARK_PAGES) {
    await seed(page, state);
    await page.goto(path);
    await expect(page.getByTestId(ready)).toBeVisible();
    await hydrated(page);
    await expectTheme(page, "dark");
    expect(await themeCookie(page), "the device chose; nothing was saved").toBeUndefined();
    if (path === "/study") await expect(page.getByTestId("topic-bar")).toBeVisible();
    expect(await pureWhite(page), `${state} ${path}`).toEqual([]);
  }
});

// Every Widget fixture the dev harness draws (the same files widget-look.spec.ts audits), in Dark.
const FIXTURES = readdirSync("src/widgets/fixtures/parts").map((file) => file.replace(/\.openui$/, ""));

test("[#80] every Widget draws in Dark with no fixed light colour", async ({ page }, info) => {
  test.skip(!isDark(info.project.name), "a device set to dark (mbp14-dark)");
  for (const fixture of FIXTURES) {
    await page.goto(`/dev/widgets?fixture=${fixture}&width=860`);
    await expect(page.getByTestId("widget-card").locator("[data-testid]").first()).toBeVisible({ timeout: 15_000 });
    await expectTheme(page, "dark");
    expect(await pureWhite(page), fixture).toEqual([]);
  }
});

/**
 * With DARK_SHOTS=<dir>: the Study Workspace and three Widgets in Dark at 1280 × 800, for the critics (#80). Never
 * otherwise.
 */
test("[#80] Dark shots at 1280 for the critics", async ({ page }, info) => {
  const dir = process.env.DARK_SHOTS;
  test.skip(!dir || !isDark(info.project.name), "only with DARK_SHOTS=<dir>, on mbp14-dark");
  mkdirSync(dir!, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  const hideOverlay = () => page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  for (const state of ["concept-widget", "quiz-open"] as const) {
    await seed(page, state);
    await page.goto("/study");
    await expect(page.getByTestId("workspace-frame")).toBeVisible();
    await hydrated(page);
    await page.waitForTimeout(800);
    await hideOverlay();
    await page.screenshot({ path: join(dir!, `study-${state}-1280-dark.png`) });
  }
  for (const fixture of ["value-levers", "waterfall", "story-scene"]) {
    await page.goto(`/dev/widgets?fixture=${fixture}&width=860`);
    await page.waitForTimeout(800);
    await hideOverlay();
    await page.screenshot({ path: join(dir!, `widget-${fixture}-1280-dark.png`), fullPage: true });
  }
});
