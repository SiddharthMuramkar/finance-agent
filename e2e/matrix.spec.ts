import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { TOGGLE_LABEL, type ThemeId } from "../src/app/theme";
import { cellsOfProject, MATRIX_DIR, matrixThresholds, type MatrixCell } from "../src/dev/preview-matrix";
import { hydrated, quietDevtools, seed, settled } from "./support/app";
import { WIDGET_CONTENT, accentFamilies, auditAffordances, measureLayout, widgetLook, type Affordances, type Layout, type WidgetLook } from "./support/measure";

/**
 * F1's preview matrix (spec 2026-11-05, ticket F1): one shot and one set of numbers for every cell of the current
 * project. It runs only with UI_MATRIX=1, so the ordinary `ui` CI job does not touch it. Run it with
 * `node scripts/preview-matrix.mjs`. Expected numbers are the thresholds of §6.2, not values read from the code.
 * Pages still changing (header, Settings, Topic menu) are found by route and role, never by markup.
 */
test.skip(process.env.UI_MATRIX !== "1", "the preview matrix runs only with UI_MATRIX=1 (node scripts/preview-matrix.mjs)");
// Default mode, one worker: the three tests run in file order, and a failing cell must not skip the later tests.

type Result = {
  cell: string;
  file: string;
  layout: Layout | null;
  affordances: Affordances | null;
  focus: FocusWalk | null;
  /**
   * Which accent families (mint, coral, sun, violet, each with every variant its theme defines) the whole /study page
   * paints outside Widget content: header, chat, Topic bar, panel frame. `accentVia` says, per family,
   * the first variant and paint that matched ("--sun-tag as background"). Measured on every /study cell (so the Story
   * scene, Lingo card and mix-up fix cells of #481 show their sunflower, violet and coral); the chrome-has-none test reads concept-widget.
   */
  accents: string[] | null;
  /** /study cells: family fills, family text, shadows, tilt and heavy type inside Widgets. Empty lists are the flat look. */
  look: WidgetLook | null;
  accentVia?: Record<string, string>;
  /** /study cells: how many openers the page asked for (POST /api/turn with `opener`) while the cell was measured. */
  openers?: number;
  /** The mix-up cell (#481): what the conversation and the Widget panel show once the page is quiet. */
  mixup?: MixupView;
  scrollWidth: number;
  innerWidth: number;
  error?: string;
};

type FocusWalk = {
  /** How many elements Tab stopped on before it left the page or came back round. */
  stops: number;
  /** Accessible names Tab reached (aria-label, else the text), in order. */
  reached: string[];
  /** Stops whose outline and box-shadow did not change from the element's own resting look. */
  withoutRing: string[];
};

type MixupView = {
  /** Tutor replies on the page: only the seeded ones when no opener streamed in. */
  replies: number;
  /** The answered try's result line (the Known mistake's fix), and whether it sits inside the conversation's view. */
  fix: string | null;
  fixInView: boolean;
  /** Whether the answered try's result is the conversation's last answered result, with no Tutor reply below it. */
  replyBelowFix: boolean;
  /** The Widget panel's title line (the open Widget's name). */
  panel: string | null;
};

/** Run envelope: `run` matches the token test 1 left in Playwright's output dir, which Playwright empties every run. */
type Saved = { run: string; cells: Result[] };

const results: Result[] = [];

// A failing test restarts the Playwright worker, which would empty `results`: the later tests read the numbers back
// from the file the first test wrote. The token file lives in the project's outputDir (test-results/), which Playwright
// deletes at the start of every run, so a cells.json left by an earlier run (or a run whose test 1 died) never matches.
const cellsFile = (project: string) => join(process.cwd(), MATRIX_DIR, project, "cells.json");
const tokenFile = (outputDir: string, project: string) => join(outputDir, `matrix-run-${project}.txt`);
function saved(project: string, outputDir: string): Result[] {
  const token = tokenFile(outputDir, project);
  if (!existsSync(token)) throw new Error(`no matrix run token for ${project}: test 1 ("every cell loads") did not run in this run`);
  if (!existsSync(cellsFile(project))) throw new Error(`${cellsFile(project)} is missing: test 1 did not finish its cells in this run`);
  const data = JSON.parse(readFileSync(cellsFile(project), "utf8")) as Saved;
  if (data.run !== readFileSync(token, "utf8").trim()) throw new Error(`${cellsFile(project)} is from an earlier run (stale): test 1 did not finish in this run`);
  return data.cells;
}

/** The accessible names the Done-when keyboard pass needs: the header's three icons, and the sign-in form's Enter (issue #33: Clerk is off in the test bed). */
const headerControls = (theme: ThemeId) => [TOGGLE_LABEL[theme], "Settings", "Account menu"];
const SIGN_IN_CONTROLS = ["Enter"];

/**
 * Walks Tab through the whole page (until focus leaves it or comes back round, at most 80 stops). Before the first Tab
 * it notes every element's resting outline and box-shadow, so a raised button's resting lip is not mistaken for a ring:
 * a stop shows a ring when its outline turns visible (not none, not 0 px, not transparent) or its box-shadow changes
 * from that resting look. A stop whose style shows neither (a slider draws its ring on the thumb, which computed styles
 * cannot read) is judged by pixels: its box while focused, against the same box once the walk ends and nothing has focus
 * (so a neighbour's ring cannot leak into the comparison).
 */
async function focusWalk(page: Page): Promise<FocusWalk> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const rest = new WeakMap<Element, { outline: string; shadow: string }>();
    for (const el of document.querySelectorAll("*")) {
      const s = getComputedStyle(el);
      rest.set(el, { outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, shadow: s.boxShadow });
    }
    (window as unknown as { __f1Rest: typeof rest }).__f1Rest = rest;
    // Start the walk at the top of the document, not at the element the page focused on load (a panel or quiz): park
    // the sequential-focus starting point on a throwaway node at the very start of the body, then remove it.
    const anchor = document.createElement("span");
    anchor.tabIndex = -1;
    anchor.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;overflow:hidden";
    document.body.prepend(anchor);
    anchor.focus();
    anchor.remove();
  });
  const viewport = page.viewportSize()!;
  const clipOf = async (id: string) => {
    const b = await page.locator(`[data-f1-stop="${id}"]`).boundingBox();
    if (!b) return null;
    const pad = 6; // outline-offset 2 px + a 2 px ring, with room to spare
    const x = Math.max(0, Math.floor(b.x - pad)), y = Math.max(0, Math.floor(b.y - pad));
    const width = Math.min(viewport.width, Math.ceil(b.x + b.width + pad)) - x, height = Math.min(viewport.height, Math.ceil(b.y + b.height + pad)) - y;
    return width > 0 && height > 0 ? { x, y, width, height } : null;
  };
  const shot = async (id: string) => { const clip = await clipOf(id); return clip ? page.screenshot({ clip, animations: "disabled" }) : null; };
  const walk: FocusWalk = { stops: 0, reached: [], withoutRing: [] };
  let first: string | null = null;
  const pending: { id: string; label: string; focused: Buffer | null }[] = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      // Next's dev overlay (nextjs-portal) is not part of the app; it sits after the page in Tab order.
      if (!el || el === document.body || el === document.documentElement || el.tagName === "NEXTJS-PORTAL") return null;
      const id = el.getAttribute("data-f1-stop") ?? String(Math.random()).slice(2);
      el.setAttribute("data-f1-stop", id);
      const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 40);
      const s = getComputedStyle(el);
      const before = (window as unknown as { __f1Rest: WeakMap<Element, { outline: string; shadow: string }> }).__f1Rest.get(el);
      const transparent = (c: string) => c === "transparent" || /,\s*0\)$|\/\s*0\)$/.test(c);
      const outline = `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`;
      const outlineShown = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 && !transparent(s.outlineColor) && outline !== before?.outline;
      // An element that appeared after the snapshot has no known resting shadow: only its outline can count.
      const shadowShown = !!before && s.boxShadow !== "none" && s.boxShadow !== before.shadow;
      return { id, label: `${el.tagName.toLowerCase()} "${name}"`, name, ring: outlineShown || shadowShown };
    });
    if (!stop || stop.id === first) break;
    first ??= stop.id;
    walk.stops++;
    walk.reached.push(stop.name);
    if (!stop.ring) pending.push({ id: stop.id, label: stop.label, focused: await shot(stop.id) });
  }
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  for (const p of pending) {
    await page.locator(`[data-f1-stop="${p.id}"]`).scrollIntoViewIfNeeded().catch(() => {});
    const unfocused = await shot(p.id);
    if (!p.focused || !unfocused || p.focused.equals(unfocused)) walk.withoutRing.push(p.label);
  }
  return walk;
}

/** What the mix-up cell shows: its Tutor replies, the answered try's fix and where it sits, and the Widget panel's title. */
async function mixupView(page: Page): Promise<MixupView> {
  return page.evaluate(() => {
    const replies = [...document.querySelectorAll('[data-testid="assistant-message"]')];
    const fix = document.querySelector<HTMLElement>('[data-testid="quick-try-result"]');
    const viewport = document.querySelector<HTMLElement>('[data-testid="thread-viewport"]');
    let fixInView = false;
    if (fix && viewport) {
      const f = fix.getBoundingClientRect(), v = viewport.getBoundingClientRect();
      fixInView = f.height > 0 && f.top >= v.top && f.bottom <= v.bottom;
    }
    const replyBelowFix = !!fix && replies.some((r) => fix.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING);
    const card = document.querySelector('[data-testid="widget-pane"] [data-testid="widget-card"]');
    const panel = (card?.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || null;
    return { replies: replies.length, fix: fix?.textContent?.trim().replace(/\s+/g, " ") ?? null, fixInView, replyBelowFix, panel };
  });
}

async function visit(page: Page, cell: MatrixCell): Promise<Result> {
  const { page: p } = cell;
  const out: Result = { cell: `${cell.project}/${p.id}`, file: cell.file, layout: null, affordances: null, focus: null, accents: null, look: null, scrollWidth: 0, innerWidth: 0 };
  try {
    // Signed out keeps the theme cookie: a dark cell is a Learner who chose Dark, not the computer's setting.
    if (p.signedOut) await page.context().clearCookies({ name: /^(?!theme$)/ });
    else await seed(page, p.seed!);
    let openers = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname === "/api/turn" && /"opener"\s*:\s*true/.test(r.postData() ?? "")) openers++;
    });
    await page.goto(p.path);
    if (p.kind === "study") {
      await expect(page.getByTestId("workspace-frame")).toBeVisible();
      // An empty live Session starts its opener only once the page hydrates, which can come after the page looks quiet.
      // Wait for hydration and for the opener to land (as say() does), so the screenshot, the audit and the Tab walk
      // never run before or during the opener's stream.
      await hydrated(page);
      await settled(page);
      if ((await page.getByTestId("assistant-message").count()) === 0) {
        await expect(page.getByTestId("assistant-message")).not.toHaveCount(0, { timeout: 30_000 }).catch(() => {});
        await settled(page);
      }
    } else if (p.kind === "reading" && p.path !== "/" && p.path !== "/about") {
      await expect(page.getByTestId("reading-column")).toBeVisible();
      await page.waitForLoadState("networkidle");
    } else {
      await expect(page.getByRole("heading").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
    }
    const dims = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    out.scrollWidth = dims.scrollWidth;
    out.innerWidth = dims.innerWidth;
    // Reading pages (the ReadingPage shell) are measured on their running prose: the column's paragraphs, minus the
    // blurbs of cards that sit beside other cards (measureLayout skips those), except on a page whose cards are its
    // columns (Settings): there each card's paragraphs are measured inside the card.
    out.layout = await measureLayout(page, p.prose ? { prose: '[data-testid="reading-column"] p', cardsAsColumns: p.cardsAsColumns === true } : {});
    out.affordances = await auditAffordances(page);
    if (p.kind === "study") {
      const a = await accentFamilies(page, { outside: WIDGET_CONTENT });
      out.accents = a.families;
      out.accentVia = a.via;
      // A cell with no Widget yet has no Widget look (widgetLook throws on a scope that matches nothing).
      out.look = (await page.locator(WIDGET_CONTENT).count()) ? await widgetLook(page) : null;
      out.openers = openers;
    }
    if (p.seed === "mix-up") out.mixup = await mixupView(page);
    mkdirSync(dirname(join(process.cwd(), cell.file)), { recursive: true });
    await page.screenshot({ path: cell.file, fullPage: true });
    out.focus = await focusWalk(page); // after the shot, so the ring does not appear in it
  } catch (e) {
    out.error = String(e instanceof Error ? e.message : e).split("\n")[0];
  }
  return out;
}

test.beforeEach(async ({ page }) => {
  await quietDevtools(page);
});

test("[F1] every cell loads without horizontal scroll", async ({ page }, info) => {
  test.setTimeout(10 * 60_000);
  // A fresh run starts from nothing: no screenshot or cells.json of an earlier run can be read as this run's.
  rmSync(join(process.cwd(), MATRIX_DIR, info.project.name), { recursive: true, force: true });
  const run = randomUUID();
  mkdirSync(info.project.outputDir, { recursive: true });
  writeFileSync(tokenFile(info.project.outputDir, info.project.name), run);
  for (const cell of cellsOfProject(info.project.name)) results.push(await visit(page, cell));
  mkdirSync(dirname(cellsFile(info.project.name)), { recursive: true });
  const cells = results.filter((r) => r.cell.startsWith(`${info.project.name}/`));
  writeFileSync(cellsFile(info.project.name), JSON.stringify({ run, cells } satisfies Saved, null, 2));
  const failing = results.filter((r) => r.error || r.scrollWidth > r.innerWidth).map((r) => `${r.cell}: ${r.error ?? `scrollWidth ${r.scrollWidth} > ${r.innerWidth}`}`);
  expect(failing, "cells that failed to load or scroll sideways").toEqual([]);
});

test("[F1] the §6 numbers hold in every cell", async ({}, info) => {
  const project = info.project.name;
  const { gutterMax, headerMax, panelMinPct, lineMin, lineMax } = matrixThresholds(project); // §6.2, 32 px gutters at 1024 too
  const failing: string[] = [];
  const cells = cellsOfProject(project);
  for (const r of saved(project, info.project.outputDir)) {
    const cell = cells.find((c) => `${c.project}/${c.page.id}` === r.cell)!;
    const id = r.cell.split("/")[1];
    const l = r.layout, a = r.affordances;
    if (!l || !a) { failing.push(`${r.cell}: not measured (${r.error ?? "no data"})`); continue; }
    const signIn = id.startsWith("sign-in");
    if (!signIn) {
      if (l.gutterLeft !== null && l.gutterLeft > gutterMax) failing.push(`${r.cell}: left gutter ${l.gutterLeft} > ${gutterMax}`);
      if (l.gutterRight !== null && l.gutterRight > gutterMax) failing.push(`${r.cell}: right gutter ${l.gutterRight} > ${gutterMax}`);
      if (l.headerHeight !== null && l.headerHeight > headerMax) failing.push(`${r.cell}: header ${l.headerHeight} > ${headerMax}`);
    }
    if (id === "study-concept-widget" && (l.panelWidthPct === null || l.panelWidthPct < panelMinPct)) failing.push(`${r.cell}: panelWidthPct ${l.panelWidthPct} < ${panelMinPct}`);
    // Notebook and Settings (per card) have running paragraphs: measuring none is a failure. Course Map is cards and panels.
    if (cell.page.prose === "required" && l.charsPerLine === null) failing.push(`${r.cell}: chars per line not measured (${l.proseMeasured ?? 0} prose paragraphs of 2+ lines)`);
    if (l.charsPerLine !== null && (l.charsPerLine < lineMin || l.charsPerLine > lineMax)) failing.push(`${r.cell}: chars per line ${l.charsPerLine} outside ${lineMin}-${lineMax}`);
    if (l.horizontalScroll) failing.push(`${r.cell}: horizontal scroll`);
    for (const key of ["interactiveWithoutSignifier", "pointerOnStatic", "staticLooksPressable", "tooSmall"] as const) {
      if (a[key].length) failing.push(`${r.cell}: ${key} ${JSON.stringify(a[key].slice(0, 5))}`);
    }
    const f = r.focus;
    if (!f || f.stops === 0) failing.push(`${r.cell}: Tab reached nothing`);
    else {
      if (f.withoutRing.length) failing.push(`${r.cell}: no focus ring on Tab at ${JSON.stringify(f.withoutRing.slice(0, 5))}${f.withoutRing.length > 5 ? ` (+${f.withoutRing.length - 5})` : ""}`);
      // Home and the About page are public pages (Home's header, not the app's); only the plain sign-in cell must reach Enter, the error one is not held to it.
      const needed = id === "sign-in" ? SIGN_IN_CONTROLS : signIn || id === "home" || id === "about" ? [] : headerControls(cell.theme);
      const missed = needed.filter((n) => !f.reached.includes(n));
      if (missed.length) failing.push(`${r.cell}: Tab never reaches ${JSON.stringify(missed)}`);
    }
  }
  expect(failing, "failing cells (each is a finding)").toEqual([]);
});

// Until #32 lands and ADR 0015 remaps the tokens (--mint to gain, --coral to loss): accent families live only inside Widgets. The chrome (header, chat, Topic bar, panel frame) paints none.
test("/study with a Widget paints no accent family outside Widget content", async ({}, info) => {
  const r = saved(info.project.name, info.project.outputDir).find((x) => x.cell === `${info.project.name}/study-concept-widget`);
  expect(r?.accents, `accent families painted outside Widget content (${r?.error ?? "measured"})`).not.toBeNull();
  expect(r!.accents!, `accent families painted in the chrome: ${JSON.stringify(r!.accentVia)}`).toEqual([]);
});

test("[ADR 0015] /study Widgets paint families only as thin marks", async ({}, info) => {
  const rows = saved(info.project.name, info.project.outputDir).filter((x) => x.cell.includes("/study-") && x.look);
  expect(rows.length).toBeGreaterThan(0);
  const bad = rows.filter((r) => r.look && Object.values(r.look).some((list) => list.length > 0));
  expect(bad.map((r) => `${r.cell}: ${JSON.stringify(r.look)}`)).toEqual([]);
});

// #481, spec §8.3 "a wrong-choice mix-up fix": the cell is the answered try and its fix, as a real Session reaches it.
// The seed stores a Tutor reply (the Concept turn) before the try, so the page starts no opener: nothing streams in below
// the fix, and the panel keeps that reply's rate Widget, the points-versus-basis-points move the fix is about (an opener
// would put its own Lingo card there).
test("[F1] the mix-up cell shows its fix, with no opener streamed in", async ({}, info) => {
  const r = saved(info.project.name, info.project.outputDir).find((x) => x.cell === `${info.project.name}/study-mixup-fix`);
  expect(r?.error, "the mix-up cell loads").toBeUndefined();
  expect(r?.openers, "openers the page asked for").toBe(0);
  const m = r!.mixup!;
  expect(m.fix).toContain("Half a percent is a share of the old rate. The gap between two rates is in points.");
  expect(m.fixInView, "the fix is inside the conversation's view").toBe(true);
  expect(m.replyBelowFix, "a Tutor reply streamed in below the fix").toBe(false);
  expect(m.replies, "Tutor replies on the page (the seeded one only)").toBe(1);
  expect(m.panel, "the Widget panel's open Widget").toContain("One move, two ways");
  expect(m.panel, "the Widget panel's open Widget").not.toContain("Lingo");
});
