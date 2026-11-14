import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { seed } from "./support/app";

/**
 * Spec 2026-11-11 A10a (R8): the Off-Topic answer's way back reads "Back to <Topic>" after a lucide CornerUpLeft Icon,
 * not the ↩ emoji. With SHOTS=A10a, the 1512 x 982 projects save it in Light and Dark.
 */
const SHOTS = join("docs", "specs", "img", "2026-11-11");

test("[A10a] the Off-Topic answer's way back is an arrow Icon and words, with no emoji", async ({ page }, info) => {
  test.skip(!["mbp14", "mbp14-dark"].includes(info.project.name), "1512, Light and Dark");
  await seed(page, "off-topic");
  await page.goto("/study");
  const back = page.getByTestId("off-topic-back");
  await back.scrollIntoViewIfNeeded();
  await expect(back).toBeVisible();
  await expect(back).toHaveText(/^\s*Back to Percent/);
  await expect(back.locator("svg.lucide-corner-up-left")).toHaveCount(1);
  // The Icon sits before the words on their line, not stacked above them.
  const line = (await back.boundingBox())!;
  const icon = (await back.locator("svg").boundingBox())!;
  expect(Math.abs(icon.y + icon.height / 2 - (line.y + line.height / 2)), "the Icon is centred on the words' line").toBeLessThan(3);
  expect(await page.getByTestId("off-topic-block").textContent()).not.toMatch(/\p{Extended_Pictographic}/u);
  if (process.env.SHOTS === "A10a") {
    mkdirSync(SHOTS, { recursive: true });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }); // the dev server's issue badge
    await page.screenshot({ path: join(SHOTS, `A10a-back-to-topic-${info.project.name.endsWith("-dark") ? "dark" : "light"}.png`) });
  }
});
