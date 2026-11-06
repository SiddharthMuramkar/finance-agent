import { expect, test, type Request } from "@playwright/test";
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
  // The Notebook has no link to an unfinished Topic's Session, so read its id off our own turn request: the page sends
  // `shown: { sessionId }` with every turn (set from the opener's `done`), and the reply is saved to that Session.
  // (Probing /sessions/1…N for the one that answers 200 fired hundreds of page renders at the dev server as ids grew,
  // and it reset connections. Reading the streamed /api/turn body back through Playwright came back empty in 1 of 20
  // runs.) A request's body is read synchronously, as it is sent, so nothing can be missed.
  const sent: number[] = [];
  const onRequest = (r: Request) => {
    if (r.method() !== "POST" || new URL(r.url()).pathname !== "/api/turn") return;
    const body = r.postDataJSON() as { message?: string; shown?: { sessionId?: number } } | null;
    if (body?.message === "Tell me more." && body.shown?.sessionId) sent.push(body.shown.sessionId);
  };
  page.on("request", onRequest);
  await page.goto("/study");
  await say(page, "plain-reply", "Tell me more.");
  page.off("request", onRequest);
  expect(sent, "one message sent, from a shown Session").toHaveLength(1);
  const id = sent[0];
  await page.goto("/notebook");
  await expect(page.locator("[data-notebook-row]").getByRole("button", { name: "Resume" }).first()).toBeVisible();
  expect((await page.request.get(`/sessions/${id}`, { maxRedirects: 0 })).status(), "a Session page that answers 200").toBe(200);
  await page.goto(`/sessions/${id}`);
  await expect(page.getByTestId("old-session")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume this Topic" })).toBeVisible();
  await page.getByRole("link", { name: "← Notebook" }).click();
  await expect(page).toHaveURL(/\/notebook#note-/);
});

const firstLine = async (page: import("@playwright/test").Page) => {
  // The page streams in behind loading.tsx: until the swap, its rows sit in a hidden holder with every box at 0 (all
  // "in the first line"). Measure only once the last row has a box of its own.
  await expect(page.locator("[data-notebook-row]").last()).toBeVisible();
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

test("save, then find it", async ({ page }) => {
  test.setTimeout(180_000); // the dev server compiles each page on first visit
  // Seventeen Topic rows, the current Topic's near the bottom: its row starts well below the fold at 1512×982, so only
  // the deep link's scroll can bring it into view.
  await seed(page, "notebook-long");
  await page.goto("/study");
  await say(page, "plain-reply", "What is a basis point?");
  const savedText = "A basis point is one hundredth of a percentage point.";
  await expect(page.getByTestId("assistant-message").last()).toContainText(savedText);

  // Wait for the save itself, not a fixed 5 s: this is the suite's only save, so the dev server compiles
  // /api/notes/saved on this first POST, and under CI load that took over 5 s while the control sat on "Saving…"
  // (CI runs 42208947817 and 42209284994, w1024). The link appears once the save answers.
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/notes/saved", { timeout: 90_000 });
  await page.getByRole("button", { name: "Save this reply to Notebook" }).last().click();
  expect((await saved).ok(), "the save answered").toBe(true);
  const open = page.getByRole("link", { name: "Open Notebook" }).last();
  await expect(open).toBeVisible();
  const href = await open.getAttribute("href");
  expect(href, "the saved line links to its Notebook row").toMatch(/^\/notebook#note-[a-z0-9-]+$/);
  const topicId = href!.replace("/notebook#note-", "");

  await open.click();
  await expect(page).toHaveURL(new RegExp(`/notebook#note-${topicId}$`));
  const row = page.locator(`[data-notebook-row="${topicId}"]`);
  await expect(row).toContainText(savedText);
  // The page streams in behind loading.tsx; the scroll may land a moment after the rows do, so poll for it.
  const where = () =>
    row.evaluate((el) => {
      const top = el.getBoundingClientRect().top;
      return { top, scrollY: window.scrollY, pageTop: top + window.scrollY, height: window.innerHeight };
    });
  await expect.poll(async () => (await where()).scrollY, { message: "the page scrolled to the row", timeout: 10_000 }).toBeGreaterThan(0);
  const at = await where();
  expect(at.pageTop, "the row starts below the fold, so the check means something").toBeGreaterThan(at.height);
  expect(at.top, "the row's top is in the viewport").toBeGreaterThanOrEqual(0);
  expect(at.top, "the row's top is in the viewport").toBeLessThan(at.height);
});

test("older sessions are listed below the rows", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
  await seed(page, "notebook-older");
  await page.goto("/notebook");
  await expect(page.getByRole("heading", { level: 2, name: "Older sessions" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Older session ·/ }).first()).toBeVisible();
});
