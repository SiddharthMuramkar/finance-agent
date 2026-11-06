import { expect, test } from "@playwright/test";
import { seed } from "./support/app";

/**
 * #313: the compact Topic bar. On the Percent Topic (four Checks) the bar is two rows, about 80 px tall (it was
 * 128 / 168 / 192 px when the strip wrapped), its strip stays on one line, and the current step is scrolled into
 * the strip's view. Measured at 1512×982 and 768×1024, so it runs once, in the mbp14 project.
 */
for (const viewport of [
  { width: 1512, height: 982 },
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
    await expect(strip.locator(":scope > li", { hasText: /^Check \d/ })).toHaveCount(4);
    const m = await bar.evaluate((nav) => {
      const ol = nav.querySelector<HTMLElement>('ol[aria-label="Steps in this Topic"]')!;
      const here = ol.querySelector<HTMLElement>('[aria-current="step"]')!;
      const o = ol.getBoundingClientRect();
      const h = here.getBoundingClientRect();
      const pad = getComputedStyle(ol);
      // One line: every group's middle on the same height (a Chip is taller than a Tag, so their tops differ).
      const middles = [...ol.querySelectorAll<HTMLElement>(":scope > li")].map((li) => {
        const r = li.getBoundingClientRect();
        return Math.round(r.top + r.height / 2);
      });
      return {
        bar: nav.getBoundingClientRect().height,
        // The strip's line, without the room it keeps around its Chips (below).
        line: ol.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom),
        rows: new Set(middles).size,
        left: h.left - o.left,
        right: o.right - h.right,
      };
    });
    console.log(`[#313] ${viewport.width}x${viewport.height}: bar ${m.bar} px, strip line ${m.line} px`);
    // 86 px before the strip kept 4 px more room under its Chips for their shadow (T313-C1); still two rows.
    expect(m.bar).toBeLessThanOrEqual(90);
    expect(m.rows).toBe(1);
    expect(m.line).toBeLessThanOrEqual(32);
    // The current step sits inside the strip's visible box.
    expect(m.left).toBeGreaterThanOrEqual(0);
    expect(m.right).toBeGreaterThanOrEqual(0);
  });
}

/**
 * #313 review (T313-C1): the strip scrolls sideways, so it clips whatever sticks out of it. A scroll-back Chip's
 * focus ring (2 px outline at a 2 px offset, so 4 px all round) and its lip and soft shadow (up to 12 px below it at
 * rest) must fit inside the strip, on every side, for the first and last steps too; and pressing a Chip (it drops
 * 2 px) must not give the strip a vertical scroll.
 */
test("[#313] the strip keeps room for a Chip's focus ring and shadow, and never scrolls up and down", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "one viewport is enough: the room is in px, not in the layout");
  await seed(page, "your-turn");
  await page.goto("/study");
  const strip = page.getByTestId("topic-bar").locator('ol[aria-label="Steps in this Topic"]');
  const chips = strip.locator('button[data-affordance="chip"]');
  await expect(chips.first()).toBeVisible();
  const room = await strip.evaluate((ol) => {
    const o = ol.getBoundingClientRect();
    // Positions in the strip's scrolled content, so the first and last steps count wherever the strip is scrolled to.
    const x = (r: DOMRect) => ({ left: r.left - o.left + ol.scrollLeft, right: ol.scrollWidth - (r.right - o.left + ol.scrollLeft) });
    const items = [...ol.querySelectorAll<HTMLElement>("[data-step-number]")];
    const chips = [...ol.querySelectorAll<HTMLElement>('button[data-affordance="chip"]')].map((c) => c.getBoundingClientRect());
    return {
      top: Math.min(...chips.map((r) => r.top - o.top)),
      bottom: Math.min(...chips.map((r) => o.bottom - r.bottom)),
      first: x(items[0].getBoundingClientRect()).left,
      last: x(items[items.length - 1].getBoundingClientRect()).right,
      overflowY: getComputedStyle(ol).overflowY,
    };
  });
  expect(room.top, "room above a Chip for its focus ring").toBeGreaterThanOrEqual(4);
  expect(room.bottom, "room below a Chip for its lip, shadow and focus ring").toBeGreaterThanOrEqual(12);
  expect(room.first, "room left of the first step for its focus ring").toBeGreaterThanOrEqual(4);
  expect(room.last, "room right of the last step for its focus ring").toBeGreaterThanOrEqual(4);
  expect(room.overflowY).toBe("hidden");
  // Press a Chip and hold it down: it drops 2 px, and the strip still has nothing to scroll up and down.
  const box = (await chips.first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const pressed = await strip.evaluate((ol) => ({ scroll: ol.scrollHeight, client: ol.clientHeight }));
  await page.mouse.up();
  expect(pressed.scroll).toBeLessThanOrEqual(pressed.client);
});

test("[#313] a narrow bar never squeezes the goal away: it keeps 12rem or drops to its own line", async ({ page }, info) => {
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
  expect(m.goalWidth, "the goal keeps room to be read").toBeGreaterThanOrEqual(Math.min(12 * m.rem, 360 - 40));
  expect(m.spill, "nothing spills past the title row").toBeLessThanOrEqual(0.5);
  expect(m.rowScroll, "the title row does not overflow").toBeLessThanOrEqual(0);
});

test("[#313] the strip's scrollbar stays quiet, so a classic scrollbar never adds height (T313-C2)", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "a computed style, the same at every viewport");
  await page.setViewportSize({ width: 768, height: 1024 });
  await seed(page, "your-turn");
  await page.goto("/study");
  const strip = page.getByTestId("topic-bar").locator('ol[aria-label="Steps in this Topic"]');
  await expect(strip).toBeVisible();
  // Headless Chromium hides scrollbars, so measure the style that keeps them hidden on Windows, Linux and a Mac set to
  // always show scrollbars: the repo's quiet-scroll (thin and transparent at rest), as the chat and the Widget panel use.
  const s = await strip.evaluate((ol) => {
    const cs = getComputedStyle(ol);
    return { width: cs.scrollbarWidth, color: cs.scrollbarColor, overflows: ol.scrollWidth > ol.clientWidth };
  });
  expect(s.overflows, "four Checks overflow the strip at 768, so its scrollbar would show").toBe(true);
  expect(s.width).toBe("thin");
  expect(s.color).toMatch(/^(transparent|rgba\(0, 0, 0, 0\)) (transparent|rgba\(0, 0, 0, 0\))$/);
});
