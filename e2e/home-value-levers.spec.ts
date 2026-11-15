import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { hydrated, quietDevtools, seed } from "./support/app";

/**
 * Home's section 2, "Now value a company" (spec 2026-11-12 E4, E8, E10, Part E "Done when": "Section 2 reaches $84 as in
 * Part B's test, signed out, with no request to the Tutor"). A stranger, signed out, moves Value levers on Amazon in
 * February 2000 to revenue $60bn and margin 12.5%, the story worth the $84 price (B3's table, Appendix B.2: $84.07).
 * A watcher sees every request: none goes to `/api/` (no `/api/turn`, no model call), and no script that carries the
 * general Widget renderer (OpenUI, LiveWidget, the Widget panel) arrives before the visitor's first move. The dev test bed
 * (Turbopack) defines each module in a chunk under its path, so a chunk's body says whether it carries the renderer's
 * code; the last step brings section 4 near and sees the renderer arrive, so the watcher is not blind. Signed in, "Open
 * this Topic →" opens Spine Topic 1 (E4), offered only while that Topic has a file.
 */
test.use({ storageState: { cookies: [], origins: [] } });

/** 1,280 wide and a phone (G9). */
const WIDTHS = ["w1280", "p390"];
/**
 * A module of the general Widget renderer defined in a dev chunk: `"[project]/<path> [app-client] (ecmascript)", ((...`.
 * Only a definition counts: Home's first chunks name LiveWidget too, in the small loader `next/dynamic` asks for later
 * (`(ecmascript, next/dynamic entry, async loader)`), which holds none of its code.
 */
const RENDERER =
  /"\[project\]\/(?:node_modules\/@openuidev\/[^"\s]+|src\/app\/_landing\/live-widget\.tsx|src\/app\/widget-panel\.tsx) \[app-client\] \(ecmascript\)(?: <[^>"]+>)?", \(\(__turbopack_context__\)/;

/** Every `/api/` request, and every script that arrives with whether its body carries the renderer. */
function watch(page: Page) {
  const api: string[] = [];
  const scripts: Promise<{ url: string; renderer: boolean }>[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) api.push(`${request.method()} ${url.pathname}`);
  });
  page.on("response", (response) => {
    if (response.request().resourceType() !== "script") return;
    const url = response.url();
    scripts.push(
      response
        .text()
        .then((body) => ({ url, renderer: RENDERER.test(body) }))
        .catch(() => ({ url, renderer: false })),
    );
  });
  return {
    api,
    /** The scripts seen so far that carry the renderer. */
    renderer: async () => (await Promise.all(scripts)).filter((s) => s.renderer).map((s) => new URL(s.url).pathname),
  };
}

/** Section 4's distance below the screen, in screens; the renderer is asked for once it is within one (NEAR_MARGIN). */
const examplesFar = (page: Page) => page.evaluate(() => (document.getElementById("examples")!.getBoundingClientRect().top - window.innerHeight) / window.innerHeight);

/**
 * Home's own custom events (E10), as Vercel Web Analytics queues them on `window.vaq` while its script is kept from loading.
 * A Showcase that starts drawing once section 4 nears sends the Widget timing events too; those are not Home's.
 */
const events = (page: Page) =>
  page.evaluate(() =>
    ((window as unknown as { vaq?: unknown[][] }).vaq ?? [])
      .filter((e) => e[0] === "event")
      .map((e) => (e[1] as { name: string }).name)
      .filter((name) => name.startsWith("home_")),
  );

test.beforeEach(async ({ page }) => {
  await quietDevtools(page);
  await page.route(/va\.vercel-scripts\.com|\/_vercel\/insights\//, (route) => route.abort());
});

test("[E4, E8, E10] signed out, section 2 reaches the $84 price with no request to the Tutor and no renderer before the first move", async ({ page }, info) => {
  test.skip(!WIDTHS.includes(info.project.name), "1280 and a phone");
  const watcher = watch(page);
  await page.goto("/");
  await hydrated(page);
  // Signed out: the header offers Sign in.
  await expect(page.locator("header.home-header").getByRole("link", { name: "Sign in", exact: true })).toBeVisible();

  const section = page.locator("#value-a-company");
  await expect(section.getByRole("heading", { level: 2 })).toHaveText("Now value a company.");
  await expect(section).toContainText("February 2000. Amazon sells books online, loses money, and its shares cost $84. Set four levers and see what your story is worth.");
  const widget = section.getByTestId("home-value-levers");
  const headline = widget.getByTestId("value-levers-headline");
  const stories = widget.getByRole("group", { name: "Stories" }).getByRole("button");
  const tasks = widget.locator('[data-testid="guided-tasks"] li');
  await expect(headline).toHaveText("Your story is worth $35 a share");
  await expect(stories).toHaveText(["Damodaran's story", "A grocer's margins"]);
  await expect(section.getByRole("link", { name: "Sign in to see what happened next →" })).toHaveAttribute("href", "/sign-in");

  // The visitor scrolls until the first lever shows at the foot of the screen. Section 4 is still more than a screen below,
  // so nothing of the renderer is due (E8's NEAR_MARGIN), and none has arrived.
  const revenue = widget.getByRole("slider", { name: "Revenue in year 10" });
  const margin = widget.getByRole("slider", { name: "Operating margin once mature" });
  await revenue.evaluate((el) => el.closest('[data-testid="slider"]')!.scrollIntoView({ block: "end" }));
  expect(await examplesFar(page), "section 4 is more than a screen below the first lever").toBeGreaterThan(1);
  await page.waitForTimeout(1000);
  expect(await watcher.renderer(), "a script carrying the Widget renderer arrived before the first move").toEqual([]);

  // Revenue $60bn alone: $58.64 (B.2), worked out with no renderer and no request.
  await revenue.fill("60");
  await expect(headline).toHaveText("Your story is worth $59 a share");
  expect(await examplesFar(page)).toBeGreaterThan(1);
  expect(await watcher.renderer(), "the first move needed the Widget renderer").toEqual([]);
  // With margin 12.5%: $84.07, the price (B3); both Things to try tick.
  await margin.fill("12.5");
  await expect(headline).toHaveText("Your story is worth $84 a share");
  await expect(tasks).toHaveCount(2);
  await expect(tasks.nth(0)).toHaveAttribute("data-state", "done");
  await expect(tasks.nth(1)).toHaveAttribute("data-state", "done");
  await expect(tasks.nth(1)).toContainText("Find a story worth the $84 price");
  // Home settles no Topic Insight (B3: the third chip waits for it; C5: it needs the Learner to tell the Tutor what they
  // changed), so "A story worth $84" never joins the chips here. A chip still moves every lever at once.
  await expect(stories).toHaveText(["Damodaran's story", "A grocer's margins"]);
  await margin.fill("10");
  await margin.fill("12.5");
  await stories.filter({ hasText: "Damodaran's story" }).click();
  await expect(headline).toHaveText("Your story is worth $35 a share");
  await expect(revenue).toHaveAttribute("aria-valuetext", "39 billion dollars");
  await expect(margin).toHaveAttribute("aria-valuetext", "10 percent");

  // E10: the first move and the price found, once each.
  await expect.poll(() => events(page)).toEqual(["home_lever_first_move", "home_price_found"]);
  // No request to the Tutor, nor any other route: the value is worked out in the browser.
  expect(watcher.api, "section 2 made a request").toEqual([]);

  // The watcher is not blind: bringing section 4 near asks for the renderer, and a Showcase's Widget draws.
  await page.locator("#examples").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("showcase-widget")).toHaveCount(1);
  await expect.poll(async () => (await watcher.renderer()).length, { message: "the renderer's chunks are seen once section 4 nears" }).toBeGreaterThan(0);
});

/** Spine Topic 1's file: written on the Spine branches; until it is merged the outline lists the Topic as coming. */
const SPINE_1 = join("course", "topics", "spine-01-worth.yaml");
/** Its title in course/outline.yaml, which the Topic bar shows. */
const SPINE_1_TITLE = "What is a business worth? Price against value, and the four levers";

/**
 * Spec 2026-11-12 E4: signed in, "Open this Topic →" under the Widget. The press posts spine-01-worth to /api/open, which
 * makes it the current Topic and opens the Study Workspace on it. Marked fixme while the Topic has no file here, so the
 * merge with the Spine content switches it on; the next test covers the meantime.
 */
test("[E4] signed in, Open this Topic opens Spine Topic 1 in the Study Workspace", async ({ page }, info) => {
  test.skip(info.project.name !== "w1280", "1280: the Study Workspace needs a laptop-wide screen");
  test.fixme(!existsSync(SPINE_1), "spine-01-worth has no Topic file on this branch yet (it is written on the Spine branches)");
  await seed(page, "story");
  await page.goto("/");
  await hydrated(page);
  const section = page.locator("#value-a-company");
  await expect(section.getByRole("link", { name: "Sign in to see what happened next →" })).toHaveCount(0);
  await section.getByRole("button", { name: "Open this Topic →" }).click();
  await page.waitForURL((url) => url.pathname === "/study");
  await expect(page.getByTestId("topic-bar")).toContainText(SPINE_1_TITLE);
});

test("[E4] signed in, while Spine Topic 1 has no Topic file, section 2 offers no Open this Topic that would land elsewhere", async ({ page }, info) => {
  test.skip(info.project.name !== "w1280", "1280: signed in, as the test above");
  test.skip(existsSync(SPINE_1), "Spine Topic 1 is written: the test above opens it");
  await seed(page, "story");
  await page.goto("/");
  await hydrated(page);
  const section = page.locator("#value-a-company");
  await expect(section.getByTestId("value-levers-headline")).toHaveText("Your story is worth $35 a share");
  await expect(section.getByRole("button", { name: "Open this Topic →" })).toHaveCount(0);
  await expect(section.getByRole("link", { name: "Sign in to see what happened next →" })).toHaveCount(0);
});
