import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { seed } from "./support/app";
import { readingBlock, type ReadingBlock } from "./support/measure";

/**
 * C1 (spec 2026-11-11): the conversation reads as one centred column. The reading block is min(544, conversation − 32)
 * wide, centred in the conversation; the latest reply, step divider, Widget chip and the composer field share its edges,
 * the Choices its left edge, and the Learner's bubble its right edge at three quarters of its width at most.
 */

const SHOTS = join("docs", "specs", "img", "2026-11-11");

/** The spec's block widths at C2a's 45 / 55 default, in px, by viewport width. */
const WIDTH: Record<number, number> = { 1024: 406.7, 1280: 516.4, 1512: 544, 1920: 544 };

/** Within `by` px of the spec's figure. */
function near(actual: number | null | undefined, expected: number, what: string, by = 1) {
  expect(actual, what).toBeGreaterThanOrEqual(expected - by);
  expect(actual, what).toBeLessThanOrEqual(expected + by);
}

/** The centring metric (C1): one column, shared edges. */
function centred(r: ReadingBlock, parts: string[]) {
  const block = r.block!;
  expect(r.offCentre, "reading block off centre").toBeLessThanOrEqual(2);
  near(r.composer?.left, block.left, "composer block left");
  near(r.composer?.right, block.right, "composer block right");
  const edge = (name: string) => {
    const e = r.edges.find((x) => x.name === name);
    expect(e, `${name} is on the page`).toBeDefined();
    return e!;
  };
  for (const name of parts) {
    near(edge(name).left, block.left, `${name} left`);
    near(edge(name).right, block.right, `${name} right`);
  }
  near(edge("choices").left, block.left, "Choices left");
  const bubble = edge("learner-message");
  near(bubble.right, block.right, "Learner bubble right");
  expect(bubble.width, "Learner bubble width").toBeLessThanOrEqual(0.75 * block.width + 1);
}

async function open(page: Page) {
  await seed(page, "reading");
  await page.goto("/study");
  await expect(page.getByTestId("assistant-message").last()).toBeVisible();
  await expect(page.getByTestId("choice").first()).toBeVisible();
}

test("[C1] reading block centred at 1024, 1280, 1512 and 1920", async ({ page }, info) => {
  const width = page.viewportSize()!.width;
  const want = WIDTH[width];
  test.skip(!want, "measured at the spec's four widths");
  await open(page);
  await expect(page.getByTestId("step-divider")).toHaveCount(1);
  await expect(page.getByTestId("learner-message")).toHaveCount(1);
  await expect(page.getByTestId("widget-chip")).toHaveCount(1);
  const choices = await page.getByTestId("choice").count();
  expect(choices).toBeGreaterThanOrEqual(2);
  expect(choices).toBeLessThanOrEqual(3);

  const r = await readingBlock(page);
  near(r.block?.width, want, "reading block width");
  centred(r, ["assistant-message", "step-divider", "widget-chip", "composer"]);

  const shot = process.env.SHOTS === "C1" && (width === 1512 || (width === 1280 && !info.project.name.endsWith("-dark")));
  if (shot) {
    mkdirSync(SHOTS, { recursive: true });
    const name = width === 1280 ? "1280" : info.project.name.endsWith("-dark") ? "dark" : "light";
    await page.screenshot({ path: join(SHOTS, `C1-reading-block-${name}.png`) });
  }
});

/** The `split` cookie, as the Split handle saves it: path /, for this test server. */
const saveSplit = (page: Page, value: string, baseURL: string) => page.context().addCookies([{ name: "split", value, url: baseURL }]);

test("[C1] reading block stays centred and capped at any share", async ({ page, baseURL }, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
  for (const [share, want] of [["33", 443.0], ["67", 544]] as const) {
    await saveSplit(page, share, baseURL!);
    await open(page);
    const r = await readingBlock(page);
    near(r.block?.width, want, `reading block width at ${share}`);
    expect(r.offCentre, `off centre at ${share}`).toBeLessThanOrEqual(2);
    const composer = r.edges.find((e) => e.name === "composer");
    near(composer?.left, r.block!.left, `composer left at ${share}`);
    near(composer?.right, r.block!.right, `composer right at ${share}`);
  }
});
