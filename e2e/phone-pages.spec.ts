import { expect, test, type Page, type Request } from "@playwright/test";
import { hydrated, replyLanded, say, script, seed, type State } from "./support/app";
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
      // Not drawn (visibility: hidden, such as OpenUI's closed dev-only inspector panels): nothing to see past the edge.
      if (!r.width || !r.height || r.right <= vw + 1 || !el.checkVisibility({ visibilityProperty: true }) || clipped(el)) continue;
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
  // Every control in the header is on screen: Home, the three pages, the theme switch and the account menu. Below 768 px
  // the Settings gear steps aside (display: none) for the account menu's Settings row; nothing else may.
  const header = await appHeader.locator("a, button").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "", left: r.left, right: r.right, width: r.width, shown: el.checkVisibility() };
    }),
  );
  const names = header.filter((c) => c.shown).map((c) => c.name);
  for (const name of ["Value It", "Study", "Course Map", "Notebook", "Account menu"]) expect(names, `${what}: the header shows ${name}`).toContain(name);
  expect(names.some((n) => /^Switch to (?:dark|light) theme$/.test(n)), `${what}: the header shows the theme switch`).toBe(true);
  expect(header.filter((c) => !c.shown).map((c) => c.name), `${what}: only the Settings gear steps aside`).toEqual(header.some((c) => c.name === "Account menu") ? ["Settings"] : []);
  const vw = page.viewportSize()!.width;
  for (const c of header.filter((h) => h.shown)) {
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

test("[#84] Settings opens on a phone, from the account menu", async ({ page }) => {
  await visit(page, "story", "/welcome");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  // The row is a client-side navigation, so hydrated()'s network idle was already reached on /welcome, and the URL turns
  // as /settings' loading skeleton draws (its own header, with no account menu; a cold compile holds it there). As
  // density.spec.ts does, wait for the skeleton to go and the page's own heading before measuring.
  await expect(page.getByTestId("route-skeleton")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Settings", exact: true })).toBeVisible();
  await hydrated(page);
  await fitsThePhone(page, "/settings");
});

test("[#84] an older Session opens on a phone, its Widget in the workspace's sheet", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, "story");
  // A Session whose opener showed a Widget. As notebook.spec.ts does: a seeded Session holds no messages (its page is a
  // 404), so talk once and read its id off the turn.
  await script(page, "concept-reply-widget");
  const sent: number[] = [];
  const onRequest = (r: Request) => {
    if (r.method() !== "POST" || new URL(r.url()).pathname !== "/api/turn") return;
    const body = r.postDataJSON() as { message?: string; shown?: { sessionId?: number } } | null;
    if (body?.message === "Tell me more." && body.shown?.sessionId) sent.push(body.shown.sessionId);
  };
  page.on("request", onRequest);
  await page.goto("/study");
  await replyLanded(page);
  await say(page, "plain-reply", "Tell me more.");
  page.off("request", onRequest);
  expect(sent, "one message sent, from a shown Session").toHaveLength(1);
  await page.goto(`/sessions/${sent[0]}`);
  await expect(page.getByTestId("old-session")).toBeVisible();
  await hydrated(page);
  await fitsThePhone(page, "/sessions/[id]");

  // G04: the conversation fills the screen and the Widget waits in the sheet below it, never painted over the text.
  const width = page.viewportSize()!.width;
  const sheet = page.getByTestId("panel-column");
  const chat = (await page.locator("#conversation-column").boundingBox())!;
  expect(chat.x + chat.width, "the conversation ends inside the screen").toBeLessThanOrEqual(width);
  expect(chat.width, "and takes nearly all of it").toBeGreaterThan(width * 0.85);
  await expect(sheet, "the Widget sheet waits below the screen").toBeHidden();

  // A chip slides the Widget up full screen; the sheet's Back button returns to the conversation.
  await page.getByTestId("widget-chip").first().click();
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  expect(box.x, "the sheet starts at the screen's left edge").toBeGreaterThanOrEqual(0);
  expect(Math.round(box.width), "and is as wide as the screen").toBe(width);
  await expect(page.getByTestId("widget-pane")).toBeVisible();
  expect((await measureLayout(page)).horizontalScroll, "no sideways scroll with the Widget open").toBe(false);
  await page.getByRole("button", { name: "Back to the conversation" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("link", { name: "Back to the workspace" })).toBeVisible();
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

test("[#84] the Assignment opens on a phone, its form open and an Own Case valued", async ({ browser }, info) => {
  test.setTimeout(180_000); // the dev server compiles /assignment on first visit
  const context = await browser.newContext({ ...info.project.use, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  // Ravi is the test bed's Spine-passed person, so the Assignment is open for him (own-case.spec.ts).
  await becomePerson(page, { person: "ravi" });
  const response = await page.goto("/assignment");
  expect(response?.status()).toBe(200);
  await hydrated(page);
  const form = page.locator("[data-own-case-form]");
  await expect(form).toBeVisible();
  await fitsThePhone(page, "/assignment, the form open");

  // Coffee Day's prospectus figures, as own-case.spec.ts copies them, then Value it.
  await form.getByLabel("Company").fill("Coffee Day Enterprises");
  await form.getByLabel("Date of the annual report").fill("2015-10-21");
  await form.locator('[data-industry="food"]').click();
  const figures = { sales: "2,479.36", operatingProfit: "109.59", taxPercent: "33.99", debt: "4998.4", cash: "3679.63", price: "328", shares: "20,60,01,719" };
  for (const [key, value] of Object.entries(figures)) await form.locator(`[data-own-case-field="${key}"]`).fill(value);
  await form.getByRole("button", { name: "Value it" }).click();
  await expect(form.locator('[data-own-case-result="value"]')).toContainText("The engine's value:");
  await expect(form.getByRole("button", { name: "Save to Notebook" })).toBeVisible();
  await fitsThePhone(page, "/assignment, an Own Case valued");
  await context.close();
});
