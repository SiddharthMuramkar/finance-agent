import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { hydrated, quietDevtools, seed, signIn } from "./support/app";
import { frameLook } from "./support/measure";

/**
 * Home, signed out (spec 2026-11-11, D2, B1, D3): Home is the page a stranger opens, so every case here runs with no
 * saved sign-in, as `e2e/affordance.spec.ts` does. A dark project is a visitor who chose Dark: the theme cookie works
 * signed out. With SHOTS=<ID>, the cases save that ticket's screenshots under docs/specs/img/2026-11-11/.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const SHOTS = join("docs", "specs", "img", "2026-11-11");
const DESKTOP = ["mbp14", "mbp14-dark"];
const themeOf = (name: string) => (name.endsWith("-dark") ? "dark" : "light");
const shotsFor = (id: string, name: string) => process.env.SHOTS === id && DESKTOP.includes(name);

/** Saves a screenshot without Next's dev overlay (`nextjs-portal`, not part of the app) and with no link under the pointer. */
async function shot(page: Page, file: string, fullPage = false) {
  mkdirSync(SHOTS, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: join(SHOTS, file), fullPage });
}

test.beforeEach(async ({ page, baseURL }, info) => {
  await quietDevtools(page);
  if (info.project.name.endsWith("-dark")) await page.context().addCookies([{ name: "theme", value: "dark", url: baseURL! }]);
});

async function openHome(page: Page) {
  await page.goto("/");
  await hydrated(page);
  // Signed out: the header offers Sign in, never the Study Workspace.
  await expect(page.locator("header.home-header").getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
}

/**
 * Presses a header page link and checks the jump: the page scrolled, the section's top sits 24 px under the sticky
 * header (`.home [id] { scroll-margin-top: calc(var(--home-header) + 24px) }`), and its h2 is below the header and
 * inside the viewport.
 */
async function jumpsTo(page: Page, link: string, id: string) {
  await page.locator("header.home-header").getByRole("link", { name: link, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#${id}$`));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const at = await page.evaluate((sectionId) => {
    const header = document.querySelector("header.home-header")!.getBoundingClientRect();
    const section = document.getElementById(sectionId)!.getBoundingClientRect();
    const h2 = document.querySelector(`#${sectionId} h2`)!.getBoundingClientRect();
    return { headerBottom: header.bottom, sectionTop: section.top, h2Top: h2.top, h2Bottom: h2.bottom, viewport: window.innerHeight };
  }, id);
  expect(Math.abs(at.sectionTop - (at.headerBottom + 24)), JSON.stringify(at)).toBeLessThanOrEqual(2);
  expect(at.h2Top, JSON.stringify(at)).toBeGreaterThanOrEqual(at.headerBottom);
  expect(at.h2Bottom, JSON.stringify(at)).toBeLessThanOrEqual(at.viewport);
}

test("[D2] How it works jumps below the sticky header", async ({ page }, info) => {
  test.skip(!DESKTOP.includes(info.project.name), "1512, Light and Dark");
  await openHome(page);
  if (shotsFor("D2", info.project.name)) await shot(page, `D2-home-${themeOf(info.project.name)}.png`, true);
  // The section starts below the fold, so the press must scroll the page.
  const before = await page.locator("#how-it-works").evaluate((el) => el.getBoundingClientRect().top);
  expect(before).toBeGreaterThan(await page.evaluate(() => window.innerHeight));
  await jumpsTo(page, "How it works", "how-it-works");
});

test("[D2, G9] Home never scrolls sideways", async ({ page }, info) => {
  test.skip(!["w1024", "p390", "t768"].includes(info.project.name), "1024, a tablet and a phone (G9)");
  await openHome(page);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways, "Home scrolls sideways").toBeLessThanOrEqual(0);
  if (info.project.name === "p390") {
    await expect(page.locator("header.home-header").getByRole("link", { name: "How it works" })).toBeHidden();
    await expect(page.locator("footer").getByRole("link", { name: "How it works" })).toBeVisible();
    if (process.env.SHOTS === "D2") await shot(page, "D2-home-phone-light.png", true);
  }
});

/** Every request to an `/api/` route from now on: a public page's Widgets must make none (no model, no Case Data route). */
function apiCalls(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) calls.push(`${request.method()} ${request.url()}`);
  });
  return calls;
}

/** B1's frame (ADR 0018: a shadow only on a floating layer): white (--frame), one 1 px --rule edge, no shadow, 12 px corners at most. */
async function expectPlainFrame(page: Page, selector: string, dark: boolean) {
  const frame = await frameLook(page, selector);
  expect(frame.backgroundColor, selector).toBe(dark ? "rgb(15, 15, 15)" : "rgb(255, 255, 255)");
  expect(frame.borderTopWidth, selector).toBe("1px");
  expect(frame.borderTopColor, selector).toBe(dark ? "rgb(31, 31, 31)" : "rgb(226, 229, 234)");
  expect(frame.boxShadow, selector).toBe("none");
  expect(frame.radius, selector).toBeLessThanOrEqual(12);
  expect(frame.innerBorder, selector).toBe("0px");
}

test("[B1] the Home Widget's frame is plain and white, with one edge, one control and no request", async ({ page }, info) => {
  test.skip(!DESKTOP.includes(info.project.name), "1512, Light and Dark");
  const calls = apiCalls(page);
  await openHome(page);
  if (shotsFor("B1", info.project.name)) await shot(page, `B1-home-widget-${themeOf(info.project.name)}.png`);
  await expectPlainFrame(page, '[data-testid="home-widget"]', info.project.name.endsWith("-dark"));

  // Since #609 (the owner's design E) the hero is an Explorable with no Guided Task: its one slider is the rate (its chips
  // set it in one tap, E3), and moving it works a new worth today in the browser.
  const widget = page.getByTestId("home-widget");
  await expect(widget.locator("li[data-state]")).toHaveCount(0);
  const rate = widget.getByRole("slider");
  await expect(rate).toHaveCount(1);
  const worth = widget.getByTestId("explorable-worth");
  const before = await worth.textContent();
  await rate.focus();
  await page.keyboard.press("End");
  await expect(worth).not.toHaveText(before ?? "");
  expect(calls, "Home's Widget called the server").toEqual([]);
});

test("[D3, E6] Examples jumps to the Showcases, one on screen at a time, and each Widget plays in the browser with no request", async ({ page }, info) => {
  test.skip(!DESKTOP.includes(info.project.name), "1512, Light and Dark");
  const calls = apiCalls(page);
  await openHome(page);
  await jumpsTo(page, "Examples", "examples");
  if (shotsFor("D3", info.project.name)) await shot(page, `D3-showcases-${themeOf(info.project.name)}.png`);

  const tabs = page.locator("#examples").getByRole("tab");
  await expect(tabs).toHaveText(["Everyday money", "The news", "A real company"]);
  const showcase = page.getByTestId("showcase-widget");
  await expect(showcase).toHaveCount(1);
  await expectPlainFrame(page, '[data-testid="showcase-widget"]', info.project.name.endsWith("-dark"));

  // Everyday money: a picture of growth (E6), not a Formula Card: ₹1,000 put in and ₹331 earned at 3 years; one key press
  // on the years slider grows it.
  await expect(showcase.getByTestId("formula-output")).toHaveCount(0);
  await expect(showcase).toContainText("Growth ₹331");
  await showcase.locator('input[type="range"]').first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(showcase).not.toContainText("Growth ₹331");

  // The news: RateMove says the one move three ways.
  await tabs.nth(1).click();
  await expect(page.getByTestId("showcase-widget")).toHaveCount(1);
  await expect(page.getByTestId("showcase-widget").getByTestId("rate-move-readout")).toHaveCount(3);

  // A real company: a wide frame shows every beat at once with no Next (spec 2026-11-12 B8); a narrow one steps to its second.
  await tabs.nth(2).click();
  const story = page.getByTestId("showcase-widget");
  if (await story.getByTestId("story-beats").isVisible()) {
    await expect(story.getByTestId("story-beats")).toContainText("Over seven years to $1 billion run-rate");
    await expect(story.getByRole("button", { name: /Next beat/ })).toHaveCount(0);
  } else {
    await story.getByTestId("story-next").click();
    await expect(story.getByTestId("story-bubble")).toContainText("Over seven years to $1 billion run-rate");
  }

  expect(calls, "a Showcase called the server").toEqual([]);
});

/**
 * The test bed holds no Case Data (it lives only in the private database), so the Explorable has no cash option to compare
 * against. This seeds it through the test bed's own route, as the tools Learner, then signs the browser out again.
 */
async function withCashOption(page: Page, baseURL: string, dark: boolean) {
  await signIn(page);
  const response = await page.request.post("/api/dev-e2e", { data: { caseData: "home-cash-option" } });
  expect(response.status(), await response.text()).toBe(200);
  await page.context().clearCookies();
  if (dark) await page.context().addCookies([{ name: "theme", value: "dark", url: baseURL }]);
}

/**
 * Spec 2026-11-12 E3, Done when: "Dragging the hero slider from 0% upward, the line 'You found it' appears between 3.3% and
 * 3.5%, and the axis labels do not change during the drag." The mouse drags the rate from 0% in small moves; at each stop
 * the test reads the rate, the match line and the axis label.
 */
test("[E3] dragging the rate up from 0%, You found it appears between 3.3% and 3.5%, and the axis never changes", async ({ page, baseURL }, info) => {
  test.skip(!["mbp14", "mbp14-dark", "w1280", "w1280-dark", "p390", "p390-dark"].includes(info.project.name), "1512, 1280 and a phone, in Light and Dark (the dark twins run with UI_MATRIX=1)");
  await withCashOption(page, baseURL!, info.project.name.endsWith("-dark"));
  await openHome(page);
  const widget = page.getByTestId("home-widget");
  await expect(widget.getByTestId("explorable-status")).toContainText("Raise the rate and watch the far-off payments shrink.");
  const axis = widget.getByTestId("explorable-axis");
  await expect(axis).toHaveText("$100.0M");
  const slider = widget.getByRole("slider");
  await slider.scrollIntoViewIfNeeded();
  const box = (await slider.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 1, y);
  await page.mouse.down();
  const seen: { rate: number; found: boolean; axis: string }[] = [];
  // Half the track (0% to 5%) in small moves, one about every 2 px.
  for (let x = box.x + 1; x <= box.x + box.width / 2; x += 2) {
    await page.mouse.move(x, y);
    seen.push({
      rate: Number((await widget.getByTestId("explorable-rate").textContent())!.replace("%", "")),
      found: (await widget.getByTestId("explorable-found").count()) > 0,
      axis: (await axis.textContent())!,
    });
  }
  await page.mouse.up();
  expect(new Set(seen.map((s) => s.axis)), "the axis label changed during the drag").toEqual(new Set(["$100.0M"]));
  const found = seen.filter((s) => s.found);
  expect(found.length, JSON.stringify(seen)).toBeGreaterThan(0);
  for (const s of found) {
    expect(s.rate, JSON.stringify(s)).toBeGreaterThanOrEqual(3.3);
    expect(s.rate, JSON.stringify(s)).toBeLessThanOrEqual(3.5);
  }
  // It rests there: every stop inside the match shows 3.38%.
  expect(new Set(found.map((s) => s.rate))).toEqual(new Set([3.38]));
  expect(seen.at(-1)!.rate).toBeGreaterThan(4.5);
  await expect(widget.getByTestId("explorable-standing")).toHaveText("The cash is worth more than the payments.");
});

/**
 * Spec 2026-11-12 E8, Done when: "The general Widget renderer is not requested until section 4 nears the screen, shown by a
 * browser test that watches requests." Home's scripts are counted after it settles at the top, where section 4 is more
 * than a screen below the fold, and nothing more is asked for; only bringing the Showcases within a screen of view asks
 * for the renderer's chunks, and the Showcase's Widget then draws.
 */
test("[E8] the general Widget renderer is requested only when the Showcases near the screen", async ({ page, baseURL }, info) => {
  test.skip(!["mbp14", "p390"].includes(info.project.name), "1512 and a phone");
  // Home as it is in production, with its cash option (the hero is taller with the guess and the comparison), whatever
  // ran before.
  await withCashOption(page, baseURL!, false);
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });
  // The renderer's code: the dev server's chunks name the modules they hold. A lazy import's stub names live-widget.tsx
  // without holding it, so the mark is a module only the renderer pulls in (widget-view.tsx, under WidgetWithSave).
  const holdsRenderer = async (urls: string[]) => {
    const found: string[] = [];
    // The app's own chunks only (the analytics script is another site's).
    for (const url of urls.filter((u) => u.startsWith(baseURL!))) if ((await (await page.request.get(url)).text()).includes("src/app/widget-view.tsx")) found.push(new URL(url).pathname);
    return found;
  };
  await openHome(page);
  // At the top, section 4 starts more than a screen below the fold, so the renderer is not asked for.
  const far = await page.evaluate(() => document.getElementById("examples")!.getBoundingClientRect().top - 2 * window.innerHeight);
  expect(far, "section 4 is more than a screen below the fold").toBeGreaterThan(0);
  const atTop = scripts.length;
  await page.waitForTimeout(1000);
  expect(scripts.slice(atTop), "a script was requested before section 4 neared the screen").toEqual([]);
  await expect(page.getByTestId("showcase-widget")).toHaveCount(0);
  await expect(page.getByTestId("showcase-widget-space")).toHaveCount(3);

  expect(await holdsRenderer(scripts.slice(0, atTop)), "a script of Home's first view holds the renderer").toEqual([]);

  await page.locator("#examples").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("showcase-widget")).toHaveCount(1);
  expect(scripts.length, "the renderer's chunks were requested as section 4 neared").toBeGreaterThan(atTop);
  expect((await holdsRenderer(scripts.slice(atTop))).length, "the chunks asked for near section 4 hold the renderer").toBeGreaterThan(0);
});

/** One event as Vercel Web Analytics queues it on `window.vaq`: ["event", { name, data }]. */
type Sent = { name: string; data?: Record<string, unknown> };

/**
 * Records every event Home sends, in Node, as it is sent. `@vercel/analytics` queues each call on `window.vaq` (it keeps a
 * queue that is already there) until its script loads; the script is kept from loading, and an init script puts a queue
 * there first whose push also hands each item to Node, so a press that leaves the page (Join) cannot lose what was sent.
 */
async function recordEvents(page: Page): Promise<Sent[]> {
  const sent: Sent[] = [];
  await page.route(/va\.vercel-scripts\.com|\/_vercel\/insights\//, (route) => route.abort());
  await page.exposeFunction("__homeEventSent", (item: string) => {
    const [kind, payload] = JSON.parse(item) as [string, Sent];
    if (kind === "event") sent.push({ name: payload.name, ...(payload.data !== undefined && { data: payload.data }) });
  });
  await page.addInitScript(() => {
    const queue: unknown[] = [];
    const push = queue.push.bind(queue);
    queue.push = (...items: unknown[]) => {
      for (const item of items) (window as unknown as { __homeEventSent: (s: string) => void }).__homeEventSent(JSON.stringify(item));
      return push(...items);
    };
    (window as unknown as { vaq: unknown[] }).vaq = queue;
  });
  return sent;
}

/**
 * Spec 2026-11-12 E10, Done when: "The six events arrive in analytics from a test visit." One visit does everything once,
 * and some things twice, and each event must arrive exactly once, in the order done: the hero's guess and a rate chip
 * (the slider's first move, by chip), keys to the match (match found, with the guess), past the match and back to it;
 * section 2's levers moved and the price found (revenue $60bn and margin 12.5% give $84.07, Appendix B.2), the margin
 * moved off and back to the price; two of section 3's steps opened (only the first is sent, with its step); then Join in
 * the hero (with its section).
 */
test("[E10] one test visit sends each of Home's six events once, in order", async ({ page, baseURL }, info) => {
  test.skip(!["mbp14", "w1280"].includes(info.project.name), "1512 and 1280");
  const sent = await recordEvents(page);
  await withCashOption(page, baseURL!, false);
  await openHome(page);
  const expected: Sent[] = [];

  // 1 and 2. The hero: a guess, a chip, keys to the match, past it and back.
  const widget = page.getByTestId("home-widget");
  await widget.getByRole("button", { name: "The cash" }).click();
  await widget.getByRole("button", { name: "5%" }).click();
  expected.push({ name: "home_slider_first_move", data: { via: "chip" } });
  const slider = widget.getByRole("slider");
  const toTheMatch = async () => {
    await slider.focus();
    await page.keyboard.press("Home");
    for (let i = 0; i < 3; i++) await page.keyboard.press("PageUp");
    for (let i = 0; i < 38; i++) await page.keyboard.press("ArrowRight");
    await expect(widget.getByTestId("explorable-found")).toBeVisible();
  };
  await toTheMatch();
  await expect(widget.getByTestId("explorable-guess")).toHaveText("You guessed: the cash");
  expected.push({ name: "home_match_found", data: { guess: "cash" } });
  await page.keyboard.press("End");
  await expect(widget.getByTestId("explorable-found")).toHaveCount(0);
  await toTheMatch();

  // 3 and 4. Section 2: two levers, then the price, then off it and back. Section 2 is wired: no levers is a failure.
  const section2 = page.locator('[data-home-section="value-a-company"]');
  const revenue = section2.getByRole("slider", { name: "Revenue in year 10" });
  const margin = section2.getByRole("slider", { name: "Operating margin once mature" });
  await revenue.fill("60");
  expected.push({ name: "home_lever_first_move" });
  await margin.fill("12.5");
  await expect(section2.getByTestId("value-levers-headline")).toHaveText("Your story is worth $84 a share");
  expected.push({ name: "home_price_found" });
  await margin.fill("10");
  await expect(section2.getByTestId("value-levers-headline")).not.toHaveText("Your story is worth $84 a share");
  await margin.fill("12.5");
  await expect(section2.getByTestId("value-levers-headline")).toHaveText("Your story is worth $84 a share");

  // 5. Section 3: open Learn the lingo, then Try it; only the first step opened is sent.
  const section3 = page.locator("#how-it-works");
  await section3.getByRole("tab", { name: /Learn the lingo/ }).click();
  await expect(section3.getByTestId("home-step-lingo")).toBeVisible();
  expected.push({ name: "home_step_opened", data: { step: "lingo" } });
  await section3.getByRole("tab", { name: /Try it/ }).click();
  await expect(section3.getByTestId("home-step-try")).toBeVisible();

  // 6. Join, in the hero.
  await page.locator('[data-home-section="hero"] a[data-join]').click();
  await page.waitForURL((url) => url.pathname === "/login");
  expected.push({ name: "home_join_pressed", data: { section: "hero" } });

  // Each once, in order; section 2's and 3's events carry nothing the test fixes beyond their names. Only Home's own
  // events count: a Showcase that came near the screen while the visitor was in section 2 sends the Widget renderer's
  // timing events too (widget_first_pixel, widget_interactive).
  const home = sent.filter((e) => e.name.startsWith("home_"));
  const loose = new Set(["home_lever_first_move", "home_price_found"]);
  expect(home.map((e) => (loose.has(e.name) ? { name: e.name } : e))).toEqual(expected);
  expect(new Set(home.map((e) => e.name)).size, "no event was sent twice").toBe(home.length);
  expect(new Set(home.map((e) => e.name)), "all six of Home's events").toEqual(new Set(["home_slider_first_move", "home_match_found", "home_lever_first_move", "home_price_found", "home_step_opened", "home_join_pressed"]));
});

/**
 * Spec 2026-11-12 E5 and E, Done when: "Section 3's Quick try marks a wrong tap and shows its fix with no network
 * request." Signed out, the visitor opens Try it in How every Topic works and taps the wrong answer: the tap gets its
 * cross and "Your pick" (G4), only the right answer its tick, and Spine Topic 1's fix shows at once. Every request the
 * page makes from the step's opening on is watched, and none is for data or a model: no /api/turn, no fetch, no POST.
 */
test("[E5] section 3's Quick try marks a wrong tap and shows its fix, with no request", async ({ page }, info) => {
  test.skip(!["mbp14", "mbp14-dark", "w1280", "p390"].includes(info.project.name), "1512 in Light and Dark, 1280 and a phone");
  await openHome(page);
  const section3 = page.locator("#how-it-works");
  await section3.scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");
  // Every request but the scripts, styles, fonts and images the page itself loads (section 4's Widget renderer arrives as
  // section 3 nears, E8): any call for data, a page or a model, and any POST, is the step's.
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "GET" && ["script", "stylesheet", "font", "image"].includes(request.resourceType())) return;
    // Home's own analytics beacon (opening a step sends home_step_opened, E10) is not the Quick try's.
    if (/va\.vercel-scripts\.com|\/_vercel\/insights\//.test(request.url())) return;
    calls.push(`${request.method()} ${request.resourceType()} ${request.url()}`);
  });

  // Nothing plays by itself: the first step is open and stays so until the visitor moves.
  await expect(section3.getByRole("tab", { name: /Hear the story/ })).toHaveAttribute("aria-selected", "true");
  await section3.getByRole("tab", { name: /Try it/ }).click();
  const quickTry = section3.getByTestId("quick-try");
  await expect(quickTry).toContainText("His story says $35 a share. Is that a price or a value?");
  await quickTry.getByRole("button", { name: "A price" }).click();

  await expect(quickTry.locator('[data-wrong-pick="true"]')).toContainText("Your pick");
  await expect(quickTry.locator('[data-right="true"]')).toContainText("A value");
  const result = section3.getByTestId("quick-try-result");
  await expect(result).toHaveAttribute("data-verdict", "known_mistake");
  await expect(result).toHaveText("Nobody paid $35: it is worked out from a story about the business, so it is a value.");
  await page.waitForTimeout(500);
  expect(calls, "section 3's Quick try made a request").toEqual([]);
});

/**
 * Spec 2026-11-12 E1: "the page at least a quarter shorter at the same width". Home was 5,736 px tall at 1,028 px wide
 * (Evidence); a quarter shorter is 4,302 px. Measured at 1,024 px, signed out, as it first paints, and as production draws
 * it: with the hero's cash option, seeded here so the height never depends on an earlier test (without it the hero is
 * about 250 px shorter, enough to hide section 2 falling back to one column).
 */
test("[E1] Home is at least a quarter shorter than the audited 5,736 px", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "w1024", "1024, the audited width");
  await withCashOption(page, baseURL!, false);
  await openHome(page);
  // The hero drew with its cash option (its guess chips ask only when there is a cash option to compare against).
  await expect(page.getByTestId("home-widget").getByRole("button", { name: "The cash" })).toBeVisible();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(height).toBeLessThanOrEqual(Math.floor(5736 * 0.75));
});

/** Spec 2026-11-12 E1, Done when: every section of Home has a control to use or a picture; none is only paragraphs. */
test("[E1] every section of Home has a control to use or a picture", async ({ page }, info) => {
  test.skip(!["mbp14", "mbp14-dark", "w1280", "w1280-dark", "p390", "p390-dark"].includes(info.project.name), "1512, 1280 and a phone, in Light and Dark (the dark twins run with UI_MATRIX=1)");
  await openHome(page);
  const sections = ['[data-band="home-hero"]', "#value-a-company", "#how-it-works", "#examples", "#what-you-get", '[data-home-section="closing"]'];
  for (const selector of sections) {
    const has = await page.locator(selector).evaluate((el) => !!el.querySelector('button, a[href], input, svg, [data-widget-content], [role="tab"]'));
    expect(has, `${selector} is only paragraphs`).toBe(true);
  }
});

/** Spec 2026-11-12 E7, Done when: "A signed-in Learner's main button shows the whole Topic title at 1,024 pixels wide." */
test("[E7] signed in, the main button says Resume over the whole Topic title, at 1,024 px", async ({ page }, info) => {
  test.skip(info.project.name !== "w1024", "1024");
  await seed(page, "story");
  await page.goto("/");
  await hydrated(page);
  const button = page.locator('[data-home-section="hero"] form[action="/api/open"] button');
  await expect(button).toBeVisible();
  const label = button.locator("[data-main-button-label]");
  await expect(label.locator("> span").first()).toHaveText(/^(Resume|Start)$/);
  const topic = button.locator("[data-main-button-topic]");
  const look = await topic.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const face = el.closest("button")!.getBoundingClientRect();
    return { text: el.textContent ?? "", overflow: el.scrollWidth - el.clientWidth, clipped: box.right > face.right + 0.5 || box.bottom > face.bottom + 0.5, ellipsis: getComputedStyle(el).textOverflow };
  });
  expect(look.text.length, JSON.stringify(look)).toBeGreaterThan(3);
  expect(look.overflow, JSON.stringify(look)).toBeLessThanOrEqual(0);
  expect(look.clipped, JSON.stringify(look)).toBe(false);
  expect(look.ellipsis).not.toBe("ellipsis");
});
