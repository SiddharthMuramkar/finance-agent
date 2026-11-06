import { expect, test } from "@playwright/test";
import { say, seed } from "./support/app";

/** B2a (spec 2026-11-05): one Notebook for notes and past Sessions; the old addresses redirect to it. */

test.beforeEach(async ({ page }) => {
  await seed(page, "many-topics");
});

test("old addresses still work", async ({ page }) => {
  test.setTimeout(120_000); // the dev server compiles each page on first visit
  for (const from of ["/sessions", "/notes"]) {
    const hop = await page.request.get(from, { maxRedirects: 0 });
    expect(hop.status(), `${from} first hop`).toBe(308);
    expect(new URL(hop.headers()["location"] ?? "", "http://x").pathname).toBe("/notebook");
  }
  await page.goto("/sessions");
  await expect(page).toHaveURL(/\/notebook$/);
  await expect(page.getByRole("heading", { level: 1, name: "Notebook" })).toBeVisible();

  const row = page.locator("[data-notebook-row]").first();
  const topicId = await row.getAttribute("data-notebook-row");
  await page.goto(`/notes#note-${topicId}`);
  await expect(page).toHaveURL(new RegExp(`/notebook#note-${topicId}$`));
});

test("a Session still opens read-only, with Resume and a way back", async ({ page }) => {
  test.setTimeout(180_000);
  // Seeded Sessions hold no messages (their page is a 404 by design), so talk once to give one a message.
  await seed(page, "story");
  await page.goto("/study");
  await say(page, "plain-reply", "Tell me more.");
  await page.goto("/notebook");
  await expect(page.locator("[data-notebook-row]").getByRole("button", { name: "Resume" }).first()).toBeVisible();
  // Find the Session's page: the Notebook has no link to an unfinished Topic's Session, so probe the ids this run made.
  // Session ids keep growing across the whole run, so probe in batches until one answers 200.
  let id = 0;
  for (let from = 1; from <= 1000 && !id; from += 50) {
    const batch = Array.from({ length: 50 }, (_, i) => from + i);
    const codes = await Promise.all(batch.map(async (n) => (await page.request.get(`/sessions/${n}`, { maxRedirects: 0 })).status()));
    id = batch[codes.findIndex((c) => c === 200)] ?? 0;
  }
  expect(id, "a Session page that answers 200").toBeGreaterThan(0);
  await page.goto(`/sessions/${id}`);
  await expect(page.getByTestId("old-session")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume this Topic" })).toBeVisible();
  await page.getByRole("link", { name: "← Notebook" }).click();
  await expect(page).toHaveURL(/\/notebook#note-/);
});

const firstLine = async (page: import("@playwright/test").Page) => {
  const tops = await page.locator("[data-notebook-row]").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  return tops.filter((t) => t === tops[0]).length;
};

test("notebook is wide", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
  // Default view (the seeded Topics only): card-grid minmax(420px, 1fr) is three across at 1512, four at 1920, with no stranded area.
  await page.goto("/notebook");
  expect(await firstLine(page), "rows in the first line at 1512").toBe(3);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(300);
  expect(await firstLine(page), "rows in the first line at 1920").toBe(4);
  await page.goto("/notebook?all=1");
  expect(await firstLine(page), "rows in the first line, all Topics at 1920").toBe(4);
  const gutters = await page.evaluate(() => {
    const r = document.querySelector('[data-testid="reading-column"]')!.getBoundingClientRect();
    return { left: r.left, right: document.documentElement.clientWidth - r.right };
  });
  expect(gutters.left).toBeLessThanOrEqual(32);
  expect(gutters.right).toBeLessThanOrEqual(32);
});

test("older sessions are listed below the rows", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
  await seed(page, "notebook-older");
  await page.goto("/notebook");
  await expect(page.getByRole("heading", { level: 2, name: "Older sessions" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Older session ·/ }).first()).toBeVisible();
});
