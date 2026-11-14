import { expect, test, type Page } from "@playwright/test";
import { replyLanded, say, script, seed, type Script, type State } from "./support/app";

/**
 * A Widget when it fits (spec 2026-11-12, B6, ADR 0019; replaces E4a's "Widget on 100 % of replies"): a step-led reply
 * shows the step's own Widget, a Lingo card answers "What does '…' mean?", and a reply with neither (a question about
 * valuation, say) leaves the Widget panel as it was. The panel never lists more than six. Beside an open quiz, no Widget
 * code adds shows the quiz's numbers. Measured at mbp14 (1512×982).
 */

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
});

/**
 * Seeds the state, opens the Study Workspace and waits for the Topic's opener to land, its Widget with it, so neither
 * is counted as a reply's below (main CI run 42251293052 read the chips while the opener was still running).
 */
async function study(page: Page, state: State | "reveal") {
  await seed(page, state as State);
  // The page's opener plays the script chosen last on this server; a Widget-free one keeps earlier tests' Widgets
  // (a Lingo card already in the panel) out of this Session.
  await script(page, "story-reply");
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  await replyLanded(page);
}

const chipNames = async (page: Page) => page.getByTestId("widget-chip").evaluateAll((els) => els.map((e) => e.getAttribute("title") ?? e.textContent ?? ""));

/** Sends one scripted reply and returns the names of the Widgets it brought into the panel. */
async function reply(page: Page, script: string, text: string): Promise<string[]> {
  const before = await chipNames(page);
  await say(page, script as Script, text);
  const after = await chipNames(page);
  const left = [...before];
  return after.filter((name) => {
    const i = left.indexOf(name);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
}

const numbersIn = (text: string) => new Set((text.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));

test("a step's own Widget, and a Lingo card only when a word's meaning is asked (B6)", async ({ page }) => {
  // The word Choice names its word (G6); its words count as a Choice press, so the reply is step-led.
  await study(page, "story");
  expect(await reply(page, "story-trader", "What does 'basis point' mean?")).toEqual(["Lingo: basis point"]);
  await study(page, "concept-widget");
  expect(await reply(page, "concept-two-ways", "Show me.")).toEqual(["One move, two ways to say it"]);
});

test("a question about valuation leaves the Widget panel unchanged, and the panel never lists more than six (B6)", async ({ page }) => {
  await study(page, "concept-widget");
  const before = await chipNames(page);
  expect(before.length).toBeGreaterThan(0);
  await say(page, "plain-reply" as Script, "How does this connect to valuing a stock?");
  expect(await chipNames(page)).toEqual(before);
  for (const [script, text] of [
    ["concept-two-ways", "Show me."],
    ["concept-percent-change", "What does 'percent change' mean?"],
    ["plain-reply", "Why do traders care?"],
    ["concept-two-ways", "Show me."],
  ] as const) {
    await say(page, script as Script, text);
    expect(await page.getByTestId("filmstrip-thumb").count().catch(() => 0)).toBeLessThanOrEqual(6);
    expect(new Set(await chipNames(page)).size).toBeGreaterThan(0);
  }
});

/** The panel's own counters ("3 of 3" in the pager, "1 of 3" under a story's beats) are not the Widget's numbers. */
const withoutCounters = (text: string) => text.replace(/\b\d+ of \d+\b/g, "");

test("beside an open quiz, no Widget code adds shows the quiz's numbers", async ({ page }) => {
  await study(page, "quiz-open");
  // The quiz's own counters ("Question 1 of 3", "0 of 3 answered") are not its numbers either.
  const quizNumbers = numbersIn(withoutCounters((await page.getByTestId("quiz").first().textContent()) ?? ""));
  const added = await reply(page, "quiz-open", "Which question first?");
  expect(added.length).toBeLessThanOrEqual(1);
  // What the Learner sees: the Widget's card, every beat of a story, without the panel's counters.
  for (const name of added) {
    await page.getByTestId("widget-chip").filter({ hasText: name }).first().click();
    const card = page.getByTestId("widget-card");
    let text = `${name} ${await card.innerText()}`;
    const next = card.getByRole("button", { name: /Next beat/ });
    for (let i = 0; i < 12 && (await next.count()) > 0 && (await next.isEnabled()); i++) {
      await next.click();
      text += ` ${await card.innerText()}`;
    }
    const shown = numbersIn(withoutCounters(text));
    expect([...shown].filter((n) => quizNumbers.has(n))).toEqual([]);
  }
});

/**
 * #476: the Widget panel is never the empty "will appear here" box beside a Tutor reply. The Story step (its reply is the
 * Topic's opener, which the page starts on hydration) and the Topic complete step (seeded with the Reveal reply that
 * ended the Topic) each show a Widget, on arrival and when the Session is opened again from the database.
 */
// The topic-complete case left this test with B6 (ADR 0019): its Reveal reply has no Widget of its own, and the Case card
// that once filled the panel is no longer added, since no picture is better than an unrelated one.
for (const state of ["story"] as const) {
  test(`#476: the ${state} step shows a Widget beside its reply, on arrival and after a reload`, async ({ page }) => {
    test.setTimeout(90_000); // two page loads, each waiting for a reply to land: slow CPUs (CI, several runs at once) need more than 30 s
    await study(page, state);
    for (const look of ["on arrival", "after a reload"]) {
      if (look === "after a reload") {
        await page.reload();
        await expect(page.getByTestId("workspace-frame")).toBeVisible();
        await replyLanded(page);
      }
      expect(await page.getByTestId("assistant-message").count(), `${state} ${look}: a Tutor reply is on screen`).toBeGreaterThan(0);
      await expect(page.getByTestId("widget-card"), `${state} ${look}: the panel shows a Widget`).toBeVisible();
      await expect(page.getByText("Widgets for this Topic will appear here."), `${state} ${look}: not the empty panel`).toHaveCount(0);
      expect(await page.getByTestId("widget-chip").count(), `${state} ${look}: a Widget chip`).toBeGreaterThan(0);
    }
  });
}
