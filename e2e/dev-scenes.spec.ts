import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// E3: /dev/scenes draws a Topic's scenes, terms as Lingo cards and its Running-example scene. This file finds
// every Topic that has `scenes:` itself (a resolved gap of the lane brief), so the E6 batches never edit it:
// they add scenes to Topic files and their Topics are picked up here.

function topicsWithScenes(): string[] {
  const dir = join(process.cwd(), "course", "topics");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .flatMap((f) => {
      const text = readFileSync(join(dir, f), "utf8");
      if (!/^scenes:/m.test(text)) return [];
      const id = /^id:\s*(\S+)\s*$/m.exec(text)?.[1];
      return id ? [id] : [];
    })
    .sort();
}

async function rendersClean(page: Page, topic: string) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1512, height: 982 });
  const response = await page.goto(`/dev/scenes?topic=${topic}`);
  expect(response?.status(), topic).toBe(200);
  await expect(page.getByTestId("dev-scenes")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${topic} horizontal overflow`).toBeLessThanOrEqual(0);
  expect(errors, `${topic} console errors`).toEqual([]);
}

test("present-value renders with no console error", async ({ page }) => {
  await rendersClean(page, "present-value");
});

test("the fixture Topic renders its scenes with no console error", async ({ page }) => {
  await rendersClean(page, "scene-fixture");
  await expect(page.getByTestId("dev-scene")).toHaveCount(9);
  await expect(page.getByTestId("story-scene").first()).toBeVisible();
  await expect(page.getByTestId("headline")).toBeVisible();
});

for (const topic of topicsWithScenes()) {
  test(`${topic} renders its scenes with no console error and no overflow at 860 px of Widget`, async ({ page }) => {
    await rendersClean(page, topic);
    await expect(page.getByTestId("dev-scene").first()).toBeVisible();
  });
}
