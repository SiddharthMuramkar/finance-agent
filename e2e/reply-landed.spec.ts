import { expect, test } from "@playwright/test";
import { replyLanded, script, seed } from "./support/app";

/**
 * replyLanded() on an empty Session whose opener is still running. The opener draws its reply line, empty, the moment it
 * starts, with Stop in place of Send, so a reply line on the page is not yet a landed reply. The test bed read "no Stop"
 * and "a reply is there" at two moments; an opener that started in between counted as landed, and its Widget chip, which
 * came in a moment later, was counted as the next reply's (main CI run 42251293052: widget-every-reply.spec.ts, beside an
 * open quiz, "Received: 2"). Here the opener is held mid-turn, so the in-between moment lasts as long as the test wants.
 */
test("replyLanded() waits until the opener has finished, with its Widget chip, while its reply line is already drawn", async ({ page }, info) => {
  test.skip(info.project.name !== "mbp14", "one viewport is enough");
  await seed(page, "story");
  await script(page, "story-reply");
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/turn", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/study");
  // The opener has started and is held: its reply line is drawn, still empty, and Stop stands in for Send.
  await expect(page.getByTestId("stop-reply")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("assistant-message")).toHaveCount(1);
  await expect(page.getByTestId("widget-chip")).toHaveCount(0);

  let landed = false;
  const waiting = replyLanded(page).then(() => {
    landed = true;
  });
  await page.waitForTimeout(1_000);
  expect(landed, "an opener still running is not a landed reply").toBe(false);

  release();
  await waiting;
  // Landed means finished: the opener's reply and the Widget code added to it are both on the page.
  await expect(page.getByTestId("assistant-message")).toContainText("In February 1994 the Federal Reserve lifted its key rate");
  expect(await page.getByTestId("widget-chip").count()).toBe(1);
});
