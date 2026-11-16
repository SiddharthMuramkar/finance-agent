import { expect, test, type Page, type Request } from "@playwright/test";
import { hydrated, say, seed, type State } from "./support/app";
import { measureLayout } from "./support/measure";
import { becomePerson, fixture } from "./support/people";

/**
 * The signed-in pages on a phone (spec #68, #84): the Welcome, the Course Map, the Notebook, Settings, an older Session, a
 * Library passage and Admin all open at 360 px with nothing sideways, under a header that fits on one line, 56 px or less.
 * No page says the Study Workspace needs a bigger screen (the phone gate is gone). Runs on the phone projects only.
 */

test.beforeEach(async ({}, info) => {
  test.skip(!["p360", "p390"].includes(info.project.name), "the phone projects (#84)");
});

/**
 * What sticks out past the screen's right edge, as "tag.class (right px)": any visible element, unless a box between it
 * and the page scrolls or clips it sideways (a wide table in its own scroller is fine).
 */
function sticksOut(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const clipped = (el: Element) => {
      for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== "visible") return true;
      }
      return false;
    };
    const out: string[] = [];
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= vw + 1 || clipped(el)) continue;
      out.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").split(" ").slice(0, 3).join(".")} (${Math.round(r.right)})`);
    }
    return out.slice(0, 10);
  });
}

/** The page fits the phone: no sideways scroll, nothing past the edge, the header one line of 56 px or less, no gate. */
async function fitsThePhone(page: Page, what: string) {
  // The app header (an older Session has a header of its own under it).
  const appHeader = page.locator("header").filter({ has: page.locator('a[title="Home"]') });
  await expect(appHeader).toBeVisible();
  await expect(page.getByText("needs a bigger screen")).toHaveCount(0);
  const layout = await measureLayout(page);
  expect(layout.horizontalScroll, `${what}: no sideways scroll`).toBe(false);
  expect(layout.headerHeight, `${what}: the header is 56 px or less`).toBeLessThanOrEqual(56);
  expect(await sticksOut(page), `${what}: nothing past the right edge`).toEqual([]);
  // Every control in the header is on screen: Home, the three pages, Settings (and the account menu).
  const header = await appHeader.locator("a, button").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "", left: r.left, right: r.right, width: r.width };
    }),
  );
  const vw = page.viewportSize()!.width;
  for (const c of header) {
    expect(c.width, `${what}: header control "${c.name}" shows`).toBeGreaterThan(0);
    expect(c.left, `${what}: header control "${c.name}" starts on screen`).toBeGreaterThanOrEqual(0);
    expect(c.right, `${what}: header control "${c.name}" ends on screen`).toBeLessThanOrEqual(vw);
  }
}

async function visit(page: Page, state: State, path: string) {
  await seed(page, state);
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(200);
  await hydrated(page);
  await fitsThePhone(page, path);
}

test("[#84] the Welcome opens on a phone", async ({ page }) => {
  await visit(page, "fresh", "/welcome");
  await expect(page.getByRole("heading", { level: 1 }).last()).toBeVisible();
});

test("[#84] the Course Map opens on a phone, every Elective group open", async ({ page }) => {
  await visit(page, "many-topics", "/course");
  await page.locator("details[data-subject]").evaluateAll((groups) => groups.forEach((g) => ((g as HTMLDetailsElement).open = true)));
  await expect(page.locator("details[data-subject]:not([open])")).toHaveCount(0);
  await fitsThePhone(page, "/course, every group open");
});

test("[#84] the Notebook opens on a phone", async ({ page }) => {
  await visit(page, "notebook-long", "/notebook");
  await expect(page.locator("[data-notebook-row]").first()).toBeVisible();
  await fitsThePhone(page, "/notebook, rows in");
});

test("[#84] Settings opens on a phone", async ({ page }) => {
  await visit(page, "story", "/settings");
});

test("[#84] an older Session opens on a phone", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, "story");
  // As notebook.spec.ts does: a seeded Session holds no messages (its page is a 404), so talk once and read its id off the turn.
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
  await page.goto(`/sessions/${sent[0]}`);
  await expect(page.getByTestId("old-session")).toBeVisible();
  await fitsThePhone(page, "/sessions/[id]");
});

test("[#84] a Library passage opens on a phone", async ({ page }) => {
  await seed(page, "story");
  const { passageId } = await fixture<{ passageId: number }>(page.request, { passage: "long-credit" });
  const response = await page.goto(`/passages/${passageId}?blocks=0-0`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("link", { name: "Back to the Study Workspace" })).toBeVisible();
  await fitsThePhone(page, "/passages/[id]");
});

test("[#84] Admin opens on a phone for the owner", async ({ browser }, info) => {
  const context = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await becomePerson(page, { person: "owner" });
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();
  await fitsThePhone(page, "/admin");
  await context.close();
});
