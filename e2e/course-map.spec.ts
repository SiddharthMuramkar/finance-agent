import { expect, test } from "@playwright/test";
import { hydrated, seed } from "./support/app";

/**
 * B1 (spec 2026-11-05): the Course Map shows progress, and the old Progress address redirects to it.
 * C6 (spec 2026-11-12): the Spine first, as fifteen numbered rows, then the Electives by Subject, then Follow, Judge and
 * Analyse; every written Topic can still be opened from it.
 */

test.beforeEach(async ({ page }) => {
  await seed(page, "many-topics");
});

test("old Progress link lands on the map", async ({ page }) => {
  const response = await page.request.get("/progress", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(new URL(response.headers()["location"] ?? "", "http://x").pathname).toBe("/course");
  await page.goto("/progress");
  await expect(page).toHaveURL(/\/course$/);
  await expect(page.getByRole("heading", { level: 1, name: "Course Map" })).toBeVisible();
});

test("map is wide", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
  await page.goto("/course");
  await hydrated(page);
  // C6: the Elective groups are closed by default (one opens only when it holds the Learner's place, and with the Spine
  // first it often holds none), so open the first one as a Learner would, then measure its cards.
  const group = page.locator("details[data-subject]").first();
  if ((await group.getAttribute("open")) === null) await group.locator("> summary").click();
  await expect(group).toHaveAttribute("open", "");
  await expect(group.locator("li[data-topic]").first()).toBeVisible();
  const cards = await group.locator("li[data-topic]").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  const firstRow = cards.filter((top) => top === cards[0]);
  expect(firstRow.length, "Topic cards in the first row").toBeGreaterThanOrEqual(3);
  const gutters = await page.evaluate(() => {
    const r = document.querySelector('[data-testid="reading-column"]')!.getBoundingClientRect();
    return { left: r.left, right: document.documentElement.clientWidth - r.right };
  });
  expect(gutters.left).toBeLessThanOrEqual(32);
  expect(gutters.right).toBeLessThanOrEqual(32);
});

test("rows still open Topics", async ({ page }) => {
  test.setTimeout(120_000); // the dev server compiles /study and the Session page on first visit
  await page.goto("/course");
  await expect(page.locator("[data-progress-summary]")).toContainText("passed");
  await hydrated(page);

  await page.locator("details:not([open]) > summary").evaluateAll((els) => els.forEach((el) => (el.parentElement as HTMLDetailsElement).setAttribute("open", "")));

  // A not-started Topic with nothing to do first: its card chooses it and opens the Study Workspace on it.
  const card = page.locator('li[data-topic][data-status="not_started"]:not(:has([data-jump]))').first();
  await card.scrollIntoViewIfNeeded();
  const title = (await card.locator("[data-row-link]").innerText()).trim();
  await card.locator("[data-row-link]").click();
  await expect(page).toHaveURL(/\/study$/, { timeout: 60_000 });
  await expect(page.getByTestId("topic-bar")).toContainText(title);

  // A passed Topic opens its Session read-only.
  await page.goto("/course");
  const passed = page.locator('li[data-topic][data-status="passed"] [data-row-link]').first();
  await passed.click();
  await expect(page).toHaveURL(/\/sessions\/\d+$/, { timeout: 60_000 });
});

test("Spine first, and every Topic still listed", async ({ page }) => {
  await page.goto("/course");
  const spine = page.locator('section[data-stage="spine"]');
  await expect(spine.getByRole("heading", { level: 2, name: "Spine" })).toBeVisible();
  // Fifteen rows, numbered 01 to 15 in Spine order; until a Spine Topic file is written its row is Coming.
  await expect(spine.locator("[data-spine-number]")).toHaveCount(15);
  expect(await spine.locator("[data-spine-number]").allInnerTexts()).toEqual(Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(2, "0")));
  await expect(spine.locator("[data-spine-progress]")).toContainText("of 15 passed");
  const stages = await page.locator("section[data-stage]").evaluateAll((els) => els.map((el) => el.getAttribute("data-stage")));
  expect(stages).toEqual(["spine", "foundation", "follow", "judge", "analyse"]);
  await expect(page.getByRole("heading", { level: 2, name: "Electives" })).toBeVisible();
  // The 95 Topics written before the Spine are all rows that open, folded groups included.
  expect(await page.locator("li[data-topic] [data-row-link]").count()).toBeGreaterThanOrEqual(95);
});

/** Text as React writes it into the server's HTML: the five characters it escapes, escaped the same way. */
const asReactWrites = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[c]!);

/**
 * Spec 2026-11-12 C6, Done when: "The Course Map lists fifteen Spine rows above the Electives, and every one of the 95
 * existing Topics can still be opened from it." Above means on screen, not only in the markup: the whole Spine section,
 * and each of its fifteen numbered rows, ends above the Electives heading, and Spine is the page's first h2. Then every
 * Topic row is opened the way its own press opens it (jump-button.tsx), as requests, so no opener turn runs for each
 * Topic: the current row first asks for what comes next, any other row not passed posts its Topic to /api/jump, and the
 * Study Workspace's server page then holds the Topic bar with that title. A passed row opens its Session, read-only (a
 * passed Topic cannot be chosen again: /api/jump answers 409). many-topics walks its passed Topics without a turn, so their
 * Sessions hold no messages, and a Session page with no lines answers 404 by design (sessions/[id]/page.tsx): such a link
 * is noted on the run, and a Learner whose passed Topic has a conversation (restart-topics) then opens it from the map.
 * Written Spine rows, once their files land, are rows like any other and join the loop.
 */
test("[C6] the Spine rows sit above the Electives on screen, and every Topic row opens", async ({ page }, info) => {
  test.skip(info.project.name !== "w1280", "one width is enough: it opens every Topic");
  test.setTimeout(600_000); // about a hundred Topics, each a jump and a server render of /study on the dev server
  await page.goto("/course");
  await hydrated(page);

  const order = await page.evaluate(() => {
    const spine = document.querySelector('section[data-stage="spine"]')!;
    const electives = [...document.querySelectorAll("h2")].find((h) => h.textContent?.trim() === "Electives")!;
    const top = electives.getBoundingClientRect().top;
    return {
      firstH2: document.querySelector("main h2, h2")?.textContent?.trim(),
      spineBottom: spine.getBoundingClientRect().bottom,
      electivesTop: top,
      rowsAbove: [...spine.querySelectorAll("[data-spine-number]")].filter((n) => n.closest("li")!.getBoundingClientRect().bottom <= top).length,
      visible: getComputedStyle(spine).display !== "none" && spine.getBoundingClientRect().height > 0,
    };
  });
  expect(order.firstH2, JSON.stringify(order)).toBe("Spine");
  expect(order.visible).toBe(true);
  expect(order.spineBottom, JSON.stringify(order)).toBeLessThanOrEqual(order.electivesTop);
  expect(order.rowsAbove, "Spine rows above the Electives heading").toBe(15);

  const rows = await page.locator("li[data-topic] [data-row-link]").evaluateAll((links) =>
    links.map((a) => ({
      id: a.getAttribute("data-row-link")!,
      title: a.textContent!.trim(),
      href: a.getAttribute("href")!,
      status: a.closest("li")!.getAttribute("data-status"),
      current: a.getAttribute("aria-current") === "location",
    })),
  );
  expect(rows.length, "the 95 Topics written before the Spine, at least").toBeGreaterThanOrEqual(95);
  expect(new Set(rows.map((r) => r.id)).size, "each Topic is one row").toBe(rows.length);

  const failed: string[] = [];
  const emptySessions: string[] = [];
  /** Chooses the Topic as its row does, then reads the Study Workspace's server page for the Topic bar with its title. */
  const opensInWorkspace = async (row: (typeof rows)[number], choice: { topicId: string } | { next: true }) => {
    const jump = await page.request.post("/api/jump", { data: choice });
    if (jump.status() !== 200) return failed.push(`${row.id}: /api/jump answered ${jump.status()} ${await jump.text()}`);
    const study = await page.request.get("/study");
    const bar = (await study.text()).match(/<nav[^>]*data-testid="topic-bar"[\s\S]*?<\/nav>/)?.[0] ?? "";
    if (study.status() !== 200 || !bar.includes(asReactWrites(row.title))) failed.push(`${row.id}: /study answered ${study.status()}, Topic bar ${bar ? "without its title" : "missing"}`);
  };
  // The current row asks for what comes next, which is its Topic only until another row is chosen: it goes first.
  for (const row of [...rows.filter((r) => r.current), ...rows.filter((r) => !r.current)]) {
    if (row.status !== "passed") {
      await opensInWorkspace(row, row.current ? { next: true } : { topicId: row.id });
      continue;
    }
    if (!/^\/sessions\/\d+$|^\/notebook$/.test(row.href)) failed.push(`${row.id}: a passed row links to ${row.href}, not its Session or the Notebook`);
    const response = await page.request.get(row.href);
    if (response.status() === 404 && row.href.startsWith("/sessions/")) emptySessions.push(`${row.id} (${row.href})`);
    else if (response.status() !== 200 || !(await response.text()).includes(asReactWrites(row.title))) failed.push(`${row.id}: ${row.href} answered ${response.status()}${response.status() === 200 ? " without its title" : ""}`);
  }
  if (emptySessions.length) test.info().annotations.push({ type: "passed Topics whose test-bed Session has no messages (404 by design)", description: emptySessions.join(", ") });
  expect(failed, `${failed.length} of ${rows.length} Topic rows did not open`).toEqual([]);

  // A passed Topic with a conversation: its row opens its Session, read-only, with the Topic's title.
  await seed(page, "restart-topics");
  await page.goto("/course");
  const passed = await page.locator('li[data-topic][data-status="passed"] [data-row-link]').evaluateAll((links) => links.map((a) => ({ title: a.textContent!.trim(), href: a.getAttribute("href")! })));
  expect(passed.length, "restart-topics passes Percent").toBeGreaterThan(0);
  for (const row of passed) {
    expect(row.href).toMatch(/^\/sessions\/\d+$/);
    const response = await page.request.get(row.href);
    expect(response.status(), row.href).toBe(200);
    expect(await response.text(), row.href).toContain(asReactWrites(row.title));
  }
});
