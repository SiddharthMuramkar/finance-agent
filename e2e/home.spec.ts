import { expect, test, type Page } from "@playwright/test";
import { quietDevtools, siteReady } from "./support/app";

/**
 * Home, signed out (Signal spec 7.2 and its §13 QA rows): the page a stranger opens, so every case here runs with no saved
 * sign-in. The site mounts the Signal widgets directly (decision #5), so nothing on Home calls the server or loads the
 * general Widget renderer (OpenUI).
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  await quietDevtools(page);
});

/** Every request to an `/api/` route from now on: Home's widgets must make none. */
function apiCalls(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) calls.push(`${request.method()} ${request.url()}`);
  });
  return calls;
}

async function openHome(page: Page) {
  await page.goto("/");
  await siteReady(page);
}

/**
 * Records, from before a press, each part of the demo thread as it first appears (spec 7.2.1's script): the typing dots,
 * the skeleton and the widget. A short phase is caught by a DOM observer in the page, not by polling it from here.
 */
async function recordDemo(page: Page) {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __demo: string[] }).__demo = seen;
    const thread = document.querySelector('[data-testid="demo-thread"]')!;
    const look = () => {
      for (const [name, selector] of [["typing", ".v-typing"], ["skeleton", ".v-skel"], ["widget", '[data-testid="demo-widget"] [data-widget]']] as const) {
        const on = !!thread.querySelector(selector);
        if (on && seen.at(-1) !== name && !seen.includes(name)) seen.push(name);
      }
    };
    // The finished jackpot conversation is on the page already: only what appears after the press counts.
    new MutationObserver(look).observe(thread, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => (window as unknown as { __demo: string[] }).__demo);
}

test("[7.2.1, QA 1] Home opens on the finished jackpot conversation, its controls locked, with no request", async ({ page }, info) => {
  test.skip(!["mbp14", "p390"].includes(info.project.name), "1512 and a phone");
  const calls = apiCalls(page);
  await openHome(page);
  const thread = page.getByTestId("demo-thread");
  await expect(thread).toContainText("Is a $1.537B jackpot really worth $1.537B?");
  await expect(thread).toContainText("The Tutor picked this widget. Tested code draws it.");
  const jackpot = thread.locator('[data-widget="jackpot"]');
  await expect(jackpot).toBeVisible();
  // Call first: the rate slider waits for the learner's call, and nothing is marked yet.
  await expect(jackpot.getByRole("slider")).toBeDisabled();
  await expect(jackpot.locator(".sig-pill")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(calls, "Home called the server").toEqual([]);
});

test("[7.2.1, QA 5] a picked question plays the script: typing, the Tutor's lead and a skeleton, then the levers widget at $35", async ({ page }, info) => {
  test.skip(!["mbp14", "w1280"].includes(info.project.name), "1512 and 1280");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const calls = apiCalls(page);
  await openHome(page);
  const played = await recordDemo(page);
  await page.getByRole("group", { name: "Pick a question" }).getByRole("button", { name: "Amazon at $84" }).click();
  const thread = page.getByTestId("demo-thread");
  const levers = thread.locator('[data-widget="levers"]');
  await expect(levers).toBeVisible();
  expect(await played()).toEqual(["typing", "skeleton", "widget"]);
  await expect(thread).toContainText("How can a loss-making Amazon be worth $84 a share?");
  await expect(levers.locator("[data-value]")).toContainText("$35");
  expect(calls, "the demo called the server").toEqual([]);
});

test("[QA 25] with reduced motion the demo answers at once", async ({ page }, info) => {
  test.skip(!["mbp14", "p390"].includes(info.project.name), "1512 and a phone");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHome(page);
  const played = await recordDemo(page);
  await page.getByRole("group", { name: "Pick a question" }).getByRole("button", { name: "Rates up 1%" }).click();
  await expect(page.getByTestId("demo-thread").locator('[data-widget="rates"]')).toBeVisible();
  // No typing dots and no skeleton: the widget is the first and only part to appear.
  expect(await played()).toEqual(["widget"]);
});

/**
 * Spec 7.2.8 and QA rows 22 and 23, as issue #33 has them: Clerk owns sign-up, so the closing block has no email form of
 * its own. A visitor's closing CTA is Join early access, to /join (Clerk's Waitlist), with the early-access note and the
 * three steps; the press is counted with its place (the join event, E10). It is followed to the page it lands on, so a Join
 * to a page that is not there fails here. Clerk is off in the test bed, so /join sends the visitor on to /sign-in.
 */
test("[7.2.8, QA 22, 23] the closing block's Join early access opens /join, with no email form", async ({ page }, info) => {
  test.skip(!["mbp14", "p390"].includes(info.project.name), "1512 and a phone");
  const sent: { name: string; data?: Record<string, unknown> }[] = [];
  await page.route(/va\.vercel-scripts\.com|\/_vercel\/insights\//, (route) => route.abort());
  await page.exposeFunction("__siteEventSent", (item: string) => {
    const [kind, payload] = JSON.parse(item) as [string, { name: string; data?: Record<string, unknown> }];
    if (kind === "event") sent.push(payload);
  });
  // @vercel/analytics queues each event on window.vaq until its script loads (kept from loading here): a queue put there
  // first hands each item to the test as it is sent, so the press that leaves the page loses nothing.
  await page.addInitScript(() => {
    const queue: unknown[] = [];
    const push = queue.push.bind(queue);
    queue.push = (...items: unknown[]) => {
      for (const item of items) (window as unknown as { __siteEventSent: (s: string) => void }).__siteEventSent(JSON.stringify(item));
      return push(...items);
    };
    (window as unknown as { vaq: unknown[] }).vaq = queue;
  });
  await openHome(page);
  const closing = page.locator('[data-site-section="closing"]');
  await closing.scrollIntoViewIfNeeded();
  await expect(closing.locator("input, form")).toHaveCount(0);
  await expect(closing.getByText("Free during early access. We let people in by hand and email you when you’re in.")).toBeVisible();
  await expect(closing.locator("ol li")).toHaveText([/Request received/, /Reviewed by hand/, /Email: you’re in/]);
  const join = closing.getByRole("link", { name: "Join early access", exact: true });
  await expect(join).toHaveAttribute("href", "/join");
  await join.click();
  await page.waitForURL((url) => url.pathname === "/sign-in");
  await expect(page.locator('[data-band="sign-in-strip"]').getByRole("heading", { level: 1, name: "Enter your passcode" })).toBeVisible();
  expect(sent.filter((e) => e.name === "home_join_pressed")).toEqual([{ name: "home_join_pressed", data: { section: "closing" } }]);
});

/**
 * Spec 7.2.3 and QA rows 10 and 12: the levers story drives the lever lab as the page scrolls. At lever 2 the stage shows his
 * story with only What it keeps live and its band drawn; at Your turn every lever is live; scrolling back up resets the stage
 * to his story, and coming back to Your turn restores the learner's own.
 */
test("[7.2.3, QA 10, 12] the levers story moves the stage with the scroll and keeps the learner's story", async ({ page }, info) => {
  test.skip(!["mbp14", "w1280"].includes(info.project.name), "1512 and 1280: the side-by-side stage");
  await openHome(page);
  const lab = page.locator('[data-widget="levers-story"]');
  /** Scrolls until step `n`'s top sits at 40% of the viewport, above the 55% line the scroll spy reads. */
  const scrollTo = async (n: number) => {
    await page.evaluate((step) => {
      const top = document.querySelector(`.v-step[data-step="${step}"]`)!.getBoundingClientRect().top;
      window.scrollBy(0, top - window.innerHeight * 0.4);
    }, n);
    await expect(page.locator(`.v-step[data-step="${n}"]`)).toHaveClass(/\bactive\b/);
  };
  const value = lab.locator("[data-value]");
  const enabled = () => lab.locator('[data-lever][data-enabled="true"]').evaluateAll((els) => els.map((el) => el.getAttribute("data-lever")));

  await scrollTo(2);
  expect(await enabled()).toEqual(["margin"]);
  await expect(page.locator('.v-step[data-step="2"]')).toContainText("It is the only lever that reaches the $84 price by itself, at 17.5%.");
  await expect(value).toContainText("$35");

  await scrollTo(5);
  expect((await enabled()).length).toBe(4);
  const margin = lab.getByRole("slider", { name: "What it keeps" });
  await margin.focus();
  await page.keyboard.press("End");
  const mine = await value.textContent();
  expect(mine).not.toContain("$35");

  await scrollTo(1);
  await expect(value).toContainText("$35");
  await scrollTo(5);
  await expect(value).toHaveText(mine!);
});

test("[QA 24] Home never scrolls sideways", async ({ page }, info) => {
  test.skip(!["w1024", "p390", "t768"].includes(info.project.name), "1024, a tablet and a phone");
  await openHome(page);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways, "Home scrolls sideways").toBeLessThanOrEqual(0);
});

/**
 * Decision #5: the site mounts the Signal widgets directly, so no script of Home carries the general Widget renderer
 * (OpenUI). The dev test bed (Turbopack) defines each module in a chunk under its path, so a chunk's body says whether it
 * holds OpenUI's code.
 */
test("[decision #5] Home loads no OpenUI", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "mbp14", "1512");
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script" && request.url().startsWith(baseURL!)) scripts.push(request.url());
  });
  await openHome(page);
  await page.locator('[data-site-section="closing"]').scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");
  const holding: string[] = [];
  for (const url of scripts) if (/"\[project\]\/node_modules\/@openuidev\//.test(await (await page.request.get(url)).text())) holding.push(new URL(url).pathname);
  expect(scripts.length, "Home loaded scripts").toBeGreaterThan(0);
  expect(holding, "a script of Home holds OpenUI").toEqual([]);
});
