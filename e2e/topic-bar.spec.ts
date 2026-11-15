import { expect, test, type Locator } from "@playwright/test";
import { hydrated, seed } from "./support/app";

/**
 * The strip is visible in the server's HTML before it hydrates, but its centring, fade and wheel handler exist only once
 * its effects ran, which a data-more-* attribute (set by those effects) proves. A test that moves the strip or wheels
 * over it first waits for that, or on a slow CI the centring effect can undo its scrollLeft = 0 and a wheel can land
 * before the handler (on Linux Chromium the unhandled wheel then scrolls the strip, not the box): main CI 42219779094.
 */
async function stripReady(strip: Locator) {
  await expect
    .poll(() => strip.evaluate((ol) => ol.hasAttribute("data-more-left") || ol.hasAttribute("data-more-right")), { message: "the strip's effects ran" })
    .toBe(true);
}

/**
 * #313 as ADR 0013 amends it, and spec 2026-11-12 F3 (ADR 0022): the compact Topic bar, now a Band across the Study
 * Workspace above both columns. On the Percent Topic (four Checks) the bar is one row from 44rem: the title over the goal
 * on the left, the current-step line ("Your turn — Step 3 of 15", with All steps) over the step bar on the right, then
 * Topic options. About 76 px tall at 1512, 1024 and 768 (measured: 76, 76, 76). The step
 * bar stays on one line, and the current step is scrolled into its view. Measured at 1512×982, 1024×768 and 768×1024,
 * so it runs once, in the mbp14 project.
 */
for (const viewport of [
  { width: 1512, height: 982 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
]) {
  test(`[#313] the Topic bar stays compact at ${viewport.width}×${viewport.height}`, async ({ page }, info) => {
    test.skip(info.project.name !== "mbp14", "sizes its own viewport");
    await page.setViewportSize(viewport);
    await seed(page, "your-turn");
    await page.goto("/study");
    const bar = page.getByTestId("topic-bar");
    await expect(bar).toBeVisible();
    const strip = bar.locator('ol[aria-label="Steps in this Topic"]');
    const current = strip.locator('[aria-current="step"]');
    await expect(current).toHaveText("Your turn");
    // Story, four Checks' groups, Reveal and Principle: no group is named or numbered, and no exam word is in the strip (#544).
    await expect(strip.locator(":scope > li")).toHaveCount(7);
    await expect(strip).not.toContainText(/\b(Check|Test|Quiz|Exam)\b/i);
    await expect(bar.getByTestId("current-step")).toHaveText(/^Your turn — Step 3 of \d+$/);
    const m = await bar.evaluate((nav) => {
      const ol = nav.querySelector<HTMLElement>('ol[aria-label="Steps in this Topic"]')!;
      const here = ol.querySelector<HTMLElement>('[aria-current="step"]')!;
      const o = ol.getBoundingClientRect();
      const h = here.getBoundingClientRect();
      const pad = getComputedStyle(ol);
      // One line: every group's middle on the same height.
      const middles = [...ol.querySelectorAll<HTMLElement>(":scope > li")].map((li) => {
        const r = li.getBoundingClientRect();
        return Math.round(r.top + r.height / 2);
      });
      return {
        bar: nav.getBoundingClientRect().height,
        // The strip's line, without the room it keeps around its segments for their focus ring (below).
        line: ol.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom),
        rows: new Set(middles).size,
        left: h.left - o.left,
        right: o.right - h.right,
      };
    });
    console.log(`[#313] ${viewport.width}x${viewport.height}: bar ${m.bar} px, strip line ${m.line} px`);
    // 8 px above and below a row as tall as its taller side: the current-step line (28) over the step bar (24 + 4 + 4 of
    // focus-ring room), or the title (24) over the goal (18 a line): 76 px, with room for one more line where a long title
    // wraps at 768. One step bar row.
    expect(m.bar).toBeLessThanOrEqual(viewport.width >= 1024 ? 88 : 104);
    expect(m.rows).toBe(1);
    expect(m.line).toBeLessThanOrEqual(32);
    // The current step sits inside the strip's visible box.
    expect(m.left).toBeGreaterThanOrEqual(0);
    expect(m.right).toBeGreaterThanOrEqual(0);
  });
}

/**
 * #313 review (T313-C1) as ADR 0013 amends it: the strip scrolls sideways, so it clips whatever sticks out of it. A
 * scroll-back segment's focus ring (2 px outline at a 2 px offset, so 4 px all round) must fit inside the strip, on
 * every side, for the first and last steps too; and pressing a segment (flat: nothing moves) must not give the strip a
 * vertical scroll.
 */
test("[#313] the strip keeps room for a segment's focus ring, and never scrolls up and down", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "one viewport is enough: the room is in px, not in the layout");
  await seed(page, "your-turn");
  await page.goto("/study");
  const strip = page.getByTestId("topic-bar").locator('ol[aria-label="Steps in this Topic"]');
  const steps = strip.locator('button[data-affordance="step"]');
  await expect(steps.first()).toBeVisible();
  const room = await strip.evaluate((ol) => {
    const o = ol.getBoundingClientRect();
    // Positions in the strip's scrolled content, so the first and last steps count wherever the strip is scrolled to.
    const x = (r: DOMRect) => ({ left: r.left - o.left + ol.scrollLeft, right: ol.scrollWidth - (r.right - o.left + ol.scrollLeft) });
    const items = [...ol.querySelectorAll<HTMLElement>("[data-step-number]")];
    const steps = [...ol.querySelectorAll<HTMLElement>('button[data-affordance="step"]')].map((c) => c.getBoundingClientRect());
    return {
      top: Math.min(...steps.map((r) => r.top - o.top)),
      bottom: Math.min(...steps.map((r) => o.bottom - r.bottom)),
      first: x(items[0].getBoundingClientRect()).left,
      last: x(items[items.length - 1].getBoundingClientRect()).right,
      overflowY: getComputedStyle(ol).overflowY,
    };
  });
  expect(room.top, "room above a segment for its focus ring").toBeGreaterThanOrEqual(4);
  expect(room.bottom, "room below a segment for its focus ring").toBeGreaterThanOrEqual(4);
  expect(room.first, "room left of the first step for its focus ring").toBeGreaterThanOrEqual(4);
  expect(room.last, "room right of the last step for its focus ring").toBeGreaterThanOrEqual(4);
  expect(room.overflowY).toBe("hidden");
  // Press a segment and hold it down: nothing moves, and the strip still has nothing to scroll up and down.
  const box = (await steps.first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const pressed = await strip.evaluate((ol) => ({ scroll: ol.scrollHeight, client: ol.clientHeight }));
  await page.mouse.up();
  expect(pressed.scroll).toBeLessThanOrEqual(pressed.client);
});

/**
 * ADR 0013: the step names left the bar for its tooltips and its line, so All steps lists every step by number and
 * name, grouped as the bar groups them (Story, four Checks' groups, Reveal and Principle on Percent), and reaches every step
 * the bar does.
 */
test("[ADR 0013] All steps lists every step of the bar, in its groups, and a finished one scrolls the chat back", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "one viewport is enough");
  await seed(page, "your-turn");
  await page.goto("/study");
  const bar = page.getByTestId("topic-bar");
  const strip = bar.locator('ol[aria-label="Steps in this Topic"]');
  // At 1512 the bar fits, so no edge fade is set: wait for hydration itself, so the toggle's press is React's.
  await hydrated(page);
  const toggle = bar.getByRole("button", { name: "All steps" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const list = bar.getByTestId("all-steps");
  await expect(list).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-controls", (await list.getAttribute("id"))!);
  const stepCount = await strip.locator("[data-step-number]").count();
  await expect(list.locator("[data-list-step]")).toHaveCount(stepCount);
  await expect(list.locator("[data-all-steps-group]")).toHaveCount(6);
  await expect(list.locator('[data-list-step="3"]')).toHaveText("3 Your turn, current step");
  // Every step the bar can scroll back to, the list can too.
  const barTargets = await strip.locator("button[data-scroll-to]").evaluateAll((els) => els.map((el) => el.getAttribute("data-scroll-to")));
  const listTargets = await list.locator("button[data-jump-to]").evaluateAll((els) => els.map((el) => el.getAttribute("data-jump-to")));
  expect(listTargets).toEqual(barTargets);
  expect(listTargets.length).toBeGreaterThan(0);
  await toggle.click();
  await expect(list).toHaveCount(0);
});

test("[#313] a narrow bar never squeezes the goal away: it has its own line under the title and keeps 12rem", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "forces its own bar width");
  await seed(page, "your-turn");
  await page.goto("/study");
  const bar = page.getByTestId("topic-bar");
  await expect(bar.getByTestId("topic-goal")).toBeVisible();
  // A phone-wide bar: the Percent title alone nearly fills the row, so a goal that only gets what the title leaves
  // would shrink to nothing (T313-R1).
  await bar.evaluate((nav) => { (nav as HTMLElement).style.width = "360px"; });
  const m = await bar.evaluate((nav) => {
    const row = nav.querySelector<HTMLElement>("[data-topic-title-row]")!;
    const goal = nav.querySelector<HTMLElement>('[data-testid="topic-goal"]')!;
    const title = goal.previousElementSibling as HTMLElement;
    const r = row.getBoundingClientRect();
    const g = goal.getBoundingClientRect();
    const t = title.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return { goalWidth: g.width, rem, ownLine: g.top >= t.bottom - 1, spill: Math.max(0, g.right - r.right, t.right - r.right), rowScroll: row.scrollWidth - row.clientWidth };
  });
  expect(m.ownLine, "the goal sits on its own line under the title").toBe(true);
  expect(m.goalWidth, "the goal keeps room to be read").toBeGreaterThanOrEqual(Math.min(12 * m.rem, 360 - 40));
  expect(m.spill, "nothing spills past the title row").toBeLessThanOrEqual(0.5);
  expect(m.rowScroll, "the title row does not overflow").toBeLessThanOrEqual(0);
});

test("[#313] the strip hides its scrollbar, so a classic scrollbar never adds height (T313-C2)", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "a computed style, the same at every viewport");
  await page.setViewportSize({ width: 768, height: 1024 });
  await seed(page, "your-turn");
  await page.goto("/study");
  const strip = page.getByTestId("topic-bar").locator('ol[aria-label="Steps in this Topic"]');
  await expect(strip).toBeVisible();
  // Headless Chromium draws overlay scrollbars, so the height a classic scrollbar (Windows, Linux, a Mac set to always
  // show scrollbars) would add cannot be measured here. A thin one still takes layout height, so the strip hides its
  // scrollbar outright (scrollbar-width: none); it still scrolls by trackpad, shift-wheel and Tab, and centres the
  // current step itself.
  const s = await strip.evaluate((ol) => ({ width: getComputedStyle(ol).scrollbarWidth, overflows: ol.scrollWidth > ol.clientWidth }));
  expect(s.overflows, "four Checks overflow the strip at 768, so its scrollbar would show").toBe(true);
  expect(s.width).toBe("none");
});

test("[#313] a strip with steps out of view shows it with a fade, and a plain mouse wheel scrolls it sideways", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "sizes its own viewport");
  await page.setViewportSize({ width: 768, height: 1024 });
  await seed(page, "your-turn");
  await page.goto("/study");
  const strip = page.getByTestId("topic-bar").locator('ol[aria-label="Steps in this Topic"]');
  await expect(strip).toBeVisible();
  // Scroll to the start, so the hidden steps are all on the right.
  await stripReady(strip);
  await strip.evaluate((ol) => { ol.scrollLeft = 0; ol.dispatchEvent(new Event("scroll")); });
  await expect(strip).toHaveAttribute("data-more-right", "true");
  await expect(strip).not.toHaveAttribute("data-more-left", "true");
  expect(await strip.evaluate((ol) => getComputedStyle(ol).maskImage), "the right edge fades").toContain("linear-gradient");
  // A plain wheel (no Shift) over the strip moves it sideways, not the page.
  const box = (await strip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await strip.evaluate((ol) => ol.scrollLeft);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => strip.evaluate((ol) => ol.scrollLeft)).toBeGreaterThan(before);
  await expect(strip).toHaveAttribute("data-more-left", "true");
  // At the far end the wheel is the page's again.
  await strip.evaluate((ol) => { ol.scrollLeft = ol.scrollWidth; ol.dispatchEvent(new Event("scroll")); });
  await expect(strip).not.toHaveAttribute("data-more-right", "true");
});

test("[#313] the edge fade follows the strip's content, not only its box (T313-F1)", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "sizes its own viewport");
  await page.setViewportSize({ width: 768, height: 1024 });
  await seed(page, "your-turn");
  await page.goto("/study");
  const strip = page.getByTestId("topic-bar").locator('ol[aria-label="Steps in this Topic"]');
  await stripReady(strip);
  await strip.evaluate((ol) => { ol.scrollLeft = 0; ol.dispatchEvent(new Event("scroll")); });
  await expect(strip).toHaveAttribute("data-more-right", "true");
  // The content shrinks to fit while the strip's own box and scroll position stay put (as when the next Topic has
  // fewer Checks, or a font loads): no scroll event and no resize of the <ol>, yet the fade must go.
  await page.addStyleTag({ content: '[data-strip-group]:nth-child(n+2) { display: none !important; }' });
  await expect(strip).not.toHaveAttribute("data-more-right", "true");
  // And back: the content grows past the box again, so the fade returns.
  await page.addStyleTag({ content: '[data-strip-group]:nth-child(n+2) { display: flex !important; }' });
  await expect(strip).toHaveAttribute("data-more-right", "true");
});

test("[#313] a wheel over the strip scrolls a box around it first, and the strip only when that box cannot (T313-T1)", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "sizes its own viewport");
  await page.setViewportSize({ width: 768, height: 1024 });
  await seed(page, "your-turn");
  await page.goto("/study");
  const strip = page.getByTestId("topic-bar").locator('ol[aria-label="Steps in this Topic"]');
  await expect(strip).toBeVisible();
  // Hydrate first: a node added before React hydrates the page would be thrown away with the server's markup.
  await stripReady(strip);
  // The Topic bar is a Band above both columns (spec 2026-11-12 F3), so the box around it that can scroll is the page:
  // make the page taller than the window, as a short window with a tall Topic bar would.
  await page.evaluate(() => {
    const pad = document.createElement("div");
    pad.style.height = "2000px";
    pad.dataset.testPad = "1";
    document.body.appendChild(pad);
    document.scrollingElement!.scrollTop = 0;
  });
  await strip.evaluate((ol) => { ol.scrollLeft = 0; ol.dispatchEvent(new Event("scroll")); });
  const r = (await strip.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop), { message: "the page scrolls" }).toBeGreaterThan(0);
  expect(await strip.evaluate((ol) => ol.scrollLeft), "the strip stays put while the page can scroll").toBe(0);
  // Once the page cannot scroll (and the strip is still under the mouse), the wheel moves the strip sideways.
  await page.evaluate(() => { document.querySelector("[data-test-pad]")!.remove(); document.scrollingElement!.scrollTop = 0; });
  const r2 = (await strip.boundingBox())!;
  await page.mouse.move(r2.x + r2.width / 2, r2.y + r2.height / 2);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => strip.evaluate((ol) => ol.scrollLeft)).toBeGreaterThan(0);
});

/**
 * Spec 2026-11-12 F3 and G2: the goal was cut off at 1,293 px ("…and name its ba…"). On the Band it is shown whole at
 * 1,024 px wide: every word on screen inside the bar, on at most two lines, with no ellipsis, clamp or clipping.
 */
test("[F3] the Topic bar is a Band above both columns and shows the whole goal at 1,024 px wide", async ({ page }, info) => {
  test.skip(!["mbp14"].includes(info.project.name), "sizes its own viewport");
  await page.setViewportSize({ width: 1024, height: 768 });
  await seed(page, "your-turn");
  await page.goto("/study");
  const bar = page.getByTestId("topic-bar");
  const goal = bar.getByTestId("topic-goal");
  // The Percent Topic's goal, word for word from its Topic file (course/topics/num-percent-bps.yaml).
  await expect(goal).toHaveText("Say any rate change in percent, percentage points and basis points, and name its base.");
  const m = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>('[data-testid="topic-bar"]')!;
    const g = nav.querySelector<HTMLElement>('[data-testid="topic-goal"]')!;
    const s = getComputedStyle(g);
    const lineHeight = parseFloat(s.lineHeight);
    const gr = g.getBoundingClientRect(), nr = nav.getBoundingClientRect();
    const box = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
    // Each ancestor up to the bar that clips its overflow must hold the goal's whole box.
    const clipped: string[] = [];
    for (let el = g.parentElement; el && el !== nav.parentElement; el = el.parentElement) {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (/hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY) && (gr.left < r.left - 0.5 || gr.right > r.right + 0.5 || gr.top < r.top - 0.5 || gr.bottom > r.bottom + 0.5)) clipped.push(el.tagName);
    }
    return {
      lines: Math.round(gr.height / lineHeight),
      overflow: g.scrollWidth - g.clientWidth,
      ellipsis: s.textOverflow,
      clamp: s.webkitLineClamp,
      whiteSpace: s.whiteSpace,
      inside: gr.left >= nr.left && gr.right <= nr.right && gr.top >= nr.top && gr.bottom <= nr.bottom,
      clipped,
      background: getComputedStyle(nav).backgroundColor,
      // Full width across the window, under the header, above both columns.
      left: nr.left,
      right: window.innerWidth - nr.right,
      belowHeader: nr.top >= document.querySelector("header")!.getBoundingClientRect().bottom - 0.5,
      aboveChat: nr.bottom <= box("chat-column").top + 0.5,
      abovePanel: nr.bottom <= box("widget-pane").top + 0.5,
    };
  });
  expect(m.lines, "the goal takes at most two lines").toBeLessThanOrEqual(2);
  expect(m.overflow, "the goal does not overflow its box").toBeLessThanOrEqual(0);
  expect(m.ellipsis).not.toBe("ellipsis");
  expect(m.clamp).toBe("none");
  expect(m.whiteSpace).not.toBe("nowrap");
  expect(m.inside, "the goal sits inside the bar").toBe(true);
  expect(m.clipped, "nothing clips the goal").toEqual([]);
  // A Band: the royal #1F3FAE.
  expect(m.background).toBe("rgb(31, 63, 174)");
  expect(m.left).toBeLessThanOrEqual(0.5);
  expect(m.right).toBeLessThanOrEqual(0.5);
  expect(m.belowHeader && m.aboveChat && m.abovePanel, JSON.stringify(m)).toBe(true);
});

/**
 * Spec 2026-11-12 F3 and G2, at the limit: a Topic file's goal may be up to 120 characters (`goal` in src/course/map.ts),
 * and the build's browser-test plan asked for "the Topic bar goal at 1024 wide". The goal shown is swapped, after
 * hydration, for one of exactly 120 characters in the Percent Topic's words; at 1,024 × 768 it must still read whole on
 * at most two lines: no overflow, no ellipsis, clamp or nowrap, nothing that clips it, and inside the Band.
 */
test("[F3, G2] a goal as long as a Topic file allows reads whole on two lines at most, at 1,024 px wide", async ({ page }, info) => {
  test.skip(info.project.name !== "w1280", "sizes its own viewport");
  await page.setViewportSize({ width: 1024, height: 768 });
  await seed(page, "your-turn");
  await page.goto("/study");
  await hydrated(page);
  const goal = page.getByTestId("topic-bar").getByTestId("topic-goal");
  await expect(goal).toBeVisible();
  const longest = "Say a rate change in percent, percentage points and basis points, name its base, and tell which of them a headline uses.";
  expect(longest).toHaveLength(120);
  await goal.evaluate((el, text) => { el.textContent = text; }, longest);
  await expect(goal).toHaveText(longest);
  const m = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>('[data-testid="topic-bar"]')!;
    const g = nav.querySelector<HTMLElement>('[data-testid="topic-goal"]')!;
    const s = getComputedStyle(g);
    const gr = g.getBoundingClientRect(), nr = nav.getBoundingClientRect();
    // Each ancestor up to the bar that clips its overflow must hold the goal's whole box.
    const clipped: string[] = [];
    for (let el = g.parentElement; el && el !== nav.parentElement; el = el.parentElement) {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (/hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY) && (gr.left < r.left - 0.5 || gr.right > r.right + 0.5 || gr.top < r.top - 0.5 || gr.bottom > r.bottom + 0.5)) clipped.push(el.tagName);
    }
    return {
      lines: Math.round(gr.height / parseFloat(s.lineHeight)),
      width: Math.round(gr.width),
      overflowX: g.scrollWidth - g.clientWidth,
      overflowY: g.scrollHeight - g.clientHeight,
      ellipsis: s.textOverflow,
      clamp: s.webkitLineClamp,
      whiteSpace: s.whiteSpace,
      inside: gr.left >= nr.left && gr.right <= nr.right && gr.top >= nr.top && gr.bottom <= nr.bottom,
      clipped,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log(`[F3, G2] 120-character goal at 1024: ${m.lines} line(s), ${m.width} px wide`);
  expect(m.lines, `the goal takes at most two lines: ${JSON.stringify(m)}`).toBeLessThanOrEqual(2);
  expect(m.overflowX, "the goal does not overflow its box sideways").toBeLessThanOrEqual(0);
  expect(m.overflowY, "the goal does not overflow its box downwards").toBeLessThanOrEqual(0);
  expect(m.ellipsis).not.toBe("ellipsis");
  expect(m.clamp).toBe("none");
  expect(m.whiteSpace).not.toBe("nowrap");
  expect(m.inside, `the goal sits inside the bar: ${JSON.stringify(m)}`).toBe(true);
  expect(m.clipped, "nothing clips the goal").toEqual([]);
  expect(m.sideways, "the page does not scroll sideways").toBeLessThanOrEqual(0);
});
