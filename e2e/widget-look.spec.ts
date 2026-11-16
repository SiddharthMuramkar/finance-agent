import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { seed } from "./support/app";
import { WIDGET_CONTENT, accentFamilies, auditAffordances, widgetLook } from "./support/measure";

/**
 * A7a and later tickets: each row is a part fixture that must be flat, icon-only and free of family fills, at rest and
 * after a press. `press` is a selector inside the root (default: its first enabled button). `then` is a second press,
 * made before the pressed probe, and `shot` names the pressed state's screenshot when the spec asks for one (A9a's Lingo
 * card turned over, A9b's TwoPaths with one outcome open, A9c's MythOrFact with one wrong and one right card).
 */
type Part = { ticket: string; fixture: string; root: string; press?: string; then?: string; shot?: string };
const PARTS: Part[] = [
  { ticket: "A7b", fixture: "breakeven", root: "breakeven" },
  { ticket: "A7b", fixture: "money-stack", root: "money-stack" },
  { ticket: "A7b", fixture: "pictogram", root: "pictogram" },
  { ticket: "A7b", fixture: "predict", root: "predict", press: 'button:has-text("Lock in my guess")' },
  { ticket: "A7b", fixture: "quick-check", root: "quick-check", press: '[data-testid="quick-check-option-0"]' },
  { ticket: "A7b", fixture: "quick-check-poll", root: "quick-check", press: '[data-testid="quick-check-option-1"]' },
  { ticket: "A7b", fixture: "stat", root: "stat" },
  { ticket: "A7b", fixture: "verdict", root: "verdict" },
  { ticket: "A7b", fixture: "versus", root: "versus" },
  { ticket: "A7b", fixture: "waffle", root: "waffle", press: 'button:has-text("Zoom")' },
  { ticket: "A8", fixture: "draw-the-line", root: "draw-the-line" },
  { ticket: "A8", fixture: "price-tag", root: "price-tag" },
  { ticket: "A8", fixture: "rank", root: "rank", press: 'button:has-text("Check the order")' },
  { ticket: "A8", fixture: "rate-move", root: "rate-move" },
  { ticket: "A8", fixture: "rate-move-practice", root: "rate-move", press: '[data-testid="rate-move-choice"]' },
  { ticket: "A8", fixture: "shrinking-note", root: "shrinking-note" },
  { ticket: "A8", fixture: "step-through", root: "step-through", press: 'button:has-text("Next")' },
  { ticket: "A8", fixture: "time-travel", root: "time-travel" },
  { ticket: "A8", fixture: "waterfall", root: "waterfall" },
  // At 860 px the scene shows every beat with no Next (spec 2026-11-12 B8), so there is nothing to press: probed at rest.
  { ticket: "A9a", fixture: "story-scene", root: "story-scene", press: '[data-testid="story-next"]:visible' },
  { ticket: "A9a", fixture: "lingo-card", root: "lingo-card", press: '[data-testid="lingo-flip"]', shot: "turned" },
  { ticket: "A9b", fixture: "timeline-strip", root: "timeline-strip", press: '[data-testid="timeline-marker"]' },
  { ticket: "A9b", fixture: "two-paths", root: "two-paths", press: '[data-testid="path-reveal"]', shot: "open" },
  { ticket: "A9b", fixture: "money-jar", root: "money-jar", press: '[data-testid="jar-again"]' },
  { ticket: "A9c", fixture: "who-pays-whom", root: "who-pays-whom", press: '[data-testid="flow"]' },
  // The first card is a fact, so "Myth" on it is wrong; the next open card is a myth, so "Myth" on it is right.
  {
    ticket: "A9c",
    fixture: "myth-or-fact",
    root: "myth-or-fact",
    press: '[data-testid="myth-button"]',
    then: '[data-testid="myth-card"][data-verdict="open"] [data-testid="myth-button"]',
    shot: "answered",
  },
  { ticket: "A9c", fixture: "headline", root: "headline" },
  { ticket: "A9c", fixture: "choice-cards", root: "choice-cards", press: '[data-testid="choice"]' },
  // Workbench Widgets (spec 2026-11-12, B3, B4 and Appendix D): their bars and weights are SVG chart paint, never a box's fill.
  ...["", "-market", "-margin-marks", "-roic", "-failure", "-two-stories", "-match-price", "-range", "-all-open"].map((mode) => ({
    ticket: mode ? "B4" : "B3",
    fixture: `value-levers${mode}`,
    root: "value-levers",
    press: '[data-story="case"]',
  })),
  ...["value-bridge", "terminal-seesaw", "wacc-stack", "cash-waterfall", "multiple-decoder"].map((root) => ({ ticket: "B4", fixture: root, root })),
  { ticket: "B4", fixture: "cash-waterfall-company", root: "cash-waterfall" },
];
// And mbp14-dark: the same audits in Dark (ADR 0019, #80), on a device set to dark.
const PROJECTS = ["mbp14", "mbp14-dark"];
const NONE = { fills: [], text: [], shadows: [], tilted: [], heavy: [], semibold: [] };
const SHOTS = join("docs", "specs", "img", "2026-11-11");

/** A10b: the whole look probe on one part, at rest or pressed: no family fill or text, no lift, tilt or heavy type, and flat controls. */
async function probe(page: Page, row: Part, when: string) {
  expect(await widgetLook(page, { within: `[data-testid="${row.root}"]` }), `${row.fixture} ${when}`).toEqual(NONE);
  expect((await auditAffordances(page)).notFlat, `${row.fixture} ${when}`).toEqual([]);
}

/** With SHOTS=<ticket>, the page at 1512 x 982 as docs/specs/img/2026-11-11/<name>-<theme>.png (spec §7: never otherwise). */
async function shoot(page: Page, name: string, theme: string) {
  if (!process.env.SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  // The dev server's issue badge (Next's overlay) is not the product.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: join(SHOTS, `${name}-${theme}.png`) });
}

test("every fixture the table names exists, and every fixture has a row", () => {
  const files = new Set(readdirSync("src/widgets/fixtures/parts"));
  for (const row of PARTS) expect(files.has(`${row.fixture}.openui`), row.fixture).toBe(true);
  expect(new Set(PARTS.map((row) => row.fixture))).toEqual(new Set([...files].map((file) => file.replace(/\.openui$/, ""))));
});

for (const seedName of ["story-scene", "lingo", "concept-widget", "mix-up"] as const) {
  test(`[A10b] /study ${seedName} Widgets are thin marks`, async ({ page }, info) => {
    test.skip(!PROJECTS.includes(info.project.name), "1512");
    await seed(page, seedName);
    await page.goto("/study");
    await expect(page.getByTestId("widget-card")).toBeVisible();
    expect(await widgetLook(page, { within: WIDGET_CONTENT })).toEqual(NONE);
    // Spec §2.2 rule 7: at most three signal colours per widget (blue and black are not signal colours). Story scenes and
    // Lingo cards lost their sunflower and violet (no sixth colour, decision #17), so they are counted like any Widget.
    expect((await accentFamilies(page, { within: WIDGET_CONTENT })).families.length).toBeLessThanOrEqual(3);
  });
}

for (const row of PARTS) {
  test(`[${row.ticket}] ${row.fixture} is a thin-mark Widget`, async ({ page }, info) => {
    test.skip(!PROJECTS.includes(info.project.name), "1512");
    await page.goto(`/dev/widgets?fixture=${row.fixture}&width=860`);
    await expect(page.getByTestId("widget-card")).toBeVisible();
    const root = page.getByTestId("widget-card").getByTestId(row.root).first();
    // A part that never draws (its Case Data missing, say) fails its row: it must not pass on an empty card.
    await expect(root, `${row.fixture} draws its [data-testid="${row.root}"]`).toBeVisible({ timeout: 15_000 });
    await probe(page, row, "at rest");
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    if (process.env.SHOTS === row.ticket) await shoot(page, `${row.ticket}-${row.fixture}`, "light");
    // A7a's screenshots: the dot-only family Tag on Stat and the Lingo card.
    if (process.env.SHOTS === "A7a" && (row.fixture === "stat" || row.fixture === "lingo-card")) await shoot(page, `A7a-${row.fixture}`, "light");
    const press = row.press ? root.locator(row.press).first() : root.locator("button:enabled").first();
    if (await press.count()) {
      await press.click();
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      if (row.then) await root.locator(row.then).first().click();
      await probe(page, row, "after the press");
      if (row.shot && process.env.SHOTS === row.ticket) await shoot(page, `${row.ticket}-${row.fixture}-${row.shot}`, "light");
    }
  });
}

/** The colour a token resolves to, as the browser computes it (rgb(…)), read through a probe element's background. */
const tokenColour = (page: import("@playwright/test").Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  }, token);

test("[A8] a Rank row reached with Tab shows the 2 px --ring focus outline", async ({ page }, info) => {
  test.skip(!PROJECTS.includes(info.project.name), "1512");
  await page.goto(`/dev/widgets?fixture=rank&width=860`);
  const row = page.getByTestId("widget-card").getByTestId("rank-item").first();
  await expect(row).toBeVisible();
  for (let i = 0; i < 40 && !(await row.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(row).toBeFocused();
  const outline = await row.evaluate((el) => {
    const s = getComputedStyle(el);
    return { visible: el.matches(":focus-visible"), style: s.outlineStyle, width: s.outlineWidth, colour: s.outlineColor };
  });
  expect(outline).toEqual({ visible: true, style: "solid", width: "2px", colour: await tokenColour(page, "--ring") });
});

test("[A7b] a picked QuickCheck poll row sits on --accent-tint", async ({ page }, info) => {
  test.skip(!PROJECTS.includes(info.project.name), "1512");
  await page.goto(`/dev/widgets?fixture=quick-check-poll&width=860`);
  const row = page.getByTestId("widget-card").getByTestId("quick-check-option-1");
  await row.click();
  await expect(row).toHaveAttribute("data-state", "picked");
  await page.mouse.move(0, 0);
  const background = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).toBe(await tokenColour(page, "--accent-tint"));
});
