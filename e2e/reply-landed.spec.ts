import { expect, test, type Page } from "@playwright/test";
import { replyLanded, say, script, seed, settled, type Script } from "./support/app";

/**
 * The race behind main CI run 42251293052 (widget-every-reply.spec.ts, beside an open quiz: "Received: 2"), made
 * deterministic. On the runner the page hydrated after it looked quiet. study() ran settled() (no Stop, no writing
 * indicator), and only then did the Topic's opener start, drawing its reply line, still empty, with Stop. study()'s next
 * read, "is there a reply?", found that line and took the opener as landed. So the chips were read before the opener's
 * Widget came in, and that Widget was counted as the next reply's.
 *
 * Here the page's init script holds the opener's start (`__faE2eHoldOpener`, src/app/turn-stream.ts) until settled()
 * has passed, then lets it go; a route holds the opener's turn request, so the opener is still running when the guard
 * after settled() looks. The turn is let through once the guard returns, or after a second.
 */

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "mbp14", "one viewport is enough");
});

type Held = Window & { __faE2eHoldOpener?: Promise<void>; __faE2eStartOpener?: () => void };

/** main's study() after its settled(), as it was before replyLanded() (e2e/widget-every-reply.spec.ts at 9e868e35). */
async function mainGuard(page: Page) {
  if ((await page.getByTestId("assistant-message").count()) === 0) {
    await expect(page.getByTestId("assistant-message")).not.toHaveCount(0, { timeout: 30_000 }).catch(() => {});
    await settled(page);
  }
}

const chipNames = async (page: Page) => page.getByTestId("widget-chip").evaluateAll((els) => els.map((e) => e.getAttribute("title") ?? e.textContent ?? ""));

/**
 * Opens the Study Workspace beside an open quiz with the opener held, lets settled() pass, starts the opener and runs
 * `guard` while it runs. Returns the chips read once the guard let go (reply()'s "before") and the Widgets the next
 * reply added, counted as widget-every-reply.spec.ts counts them.
 */
async function lateOpener(page: Page, guard: (page: Page) => Promise<void>) {
  await seed(page, "quiz-open");
  // The script CI's opener played there (the previous test's): its Widget is a Lingo card.
  await script(page, "reveal-reply" as Script);
  await page.addInitScript(() => {
    const w = window as Held;
    w.__faE2eHoldOpener = new Promise<void>((resolve) => (w.__faE2eStartOpener = resolve));
  });
  let letTurnThrough!: () => void;
  const turnHeld = new Promise<void>((resolve) => (letTurnThrough = resolve));
  await page.route("**/api/turn", async (route) => {
    await turnHeld;
    await route.continue();
  });

  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  await settled(page);
  // The page looked quiet; now the opener starts, as it did on the runner: Stop and its empty reply line are drawn.
  await page.evaluate(() => (window as Held).__faE2eStartOpener?.());
  await expect(page.getByTestId("stop-reply")).toBeVisible();
  await expect(page.getByTestId("assistant-message")).toHaveCount(1);

  const before = guard(page).then(() => chipNames(page));
  await Promise.race([before, page.waitForTimeout(1_000)]);
  letTurnThrough();
  const chipsBefore = await before;

  await say(page, "quiz-open", "Which question first?");
  const left = [...chipsBefore];
  const added = (await chipNames(page)).filter((name) => {
    const i = left.indexOf(name);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
  return { before: chipsBefore, added };
}

test("[control] main's study() guard takes a late opener's empty reply line as landed and counts its Widget as the next reply's", async ({ page }) => {
  // The scenario reproduces CI's numbers with the old guard, so the test below cannot pass by missing the race.
  const { before, added } = await lateOpener(page, mainGuard);
  expect(before).toEqual([]);
  expect(added).toHaveLength(2);
});

test("replyLanded() lets a late opener land first, with its Widget, so the next reply adds only its own", async ({ page }) => {
  const { before, added } = await lateOpener(page, replyLanded);
  expect(before, "the opener's Widget is in before the reply").toHaveLength(1);
  // widget-every-reply.spec.ts:71's assertion.
  expect(added.length).toBeLessThanOrEqual(1);
});
