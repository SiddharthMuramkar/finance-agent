import { expect, test, type Page } from "@playwright/test";
import { replyLanded, say, seed, type Script, type State } from "./support/app";

/**
 * A Widget with every reply (spec 2026-11-05, E4a, §6.2 "Widget on 100 % of replies (scripted)"): six scripted
 * replies across story, concept, your turn and reveal, none of which shows a Widget itself, each bring exactly one
 * Widget into the panel, because code adds a Companion Widget. Beside an open quiz, no Widget code adds shows the
 * quiz's numbers. Measured at mbp14 (1512×982).
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

test("Widget on 100 % of replies (scripted): 6 replies across story, concept, your turn and reveal give 6 Widgets, one per reply", async ({ page }) => {
  // Each reply is about one idea, and the Widget code adds shows it (Widget fit, spec §8.9): the step's scene, else the
  // Lingo card for the term the reply is about. Each Session's opener took the step's scene, unless code opened the step's card.
  const plan: { state?: State | "reveal"; script: string; text: string; widget: string }[] = [
    { state: "story", script: "story-trader", text: "Who is the bond trader?", widget: "Lingo: basis point" },
    { script: "story-hike", text: "What is the Fed deciding?", widget: "Lingo: rate hike" },
    { state: "concept-widget", script: "concept-two-ways", text: "Why do they say it differently?", widget: "One move, two ways to say it" },
    { script: "concept-percent-change", text: "What is a percent change?", widget: "Lingo: percent change" },
    { state: "your-turn", script: "your-turn-reply", text: "How do I start?", widget: "Lingo: percentage point" },
    { state: "reveal", script: "reveal-reply", text: "What did the Fed do?", widget: "Lingo: quarter point" },
  ];
  const perReply: string[][] = [];
  for (const step of plan) {
    if (step.state) await study(page, step.state);
    perReply.push(await reply(page, step.script, step.text));
  }
  expect(perReply).toEqual(plan.map((step) => [step.widget]));
});

/** The panel's own counters ("3 of 3" in the pager, "1 of 3" under a story's beats) are not the Widget's numbers. */
const withoutCounters = (text: string) => text.replace(/\b\d+ of \d+\b/g, "");

test("Widget on 100 % of replies (scripted): beside an open quiz, no Widget code adds shows the quiz's numbers", async ({ page }) => {
  await study(page, "quiz-open");
  const quizNumbers = numbersIn((await page.getByTestId("quiz").first().textContent()) ?? "");
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
