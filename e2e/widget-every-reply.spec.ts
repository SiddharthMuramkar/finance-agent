import { expect, test, type Page } from "@playwright/test";
import { say, seed, settled, type Script, type State } from "./support/app";

/**
 * A Widget with every reply (spec 2026-11-05, E4a, §6.2 "Widget on 100 % of replies (scripted)"): six scripted
 * replies across story, concept, your turn and reveal, none of which shows a Widget itself, each bring exactly one
 * Widget into the panel, because code adds a Companion Widget. Beside an open quiz, no Widget code adds shows the
 * quiz's numbers. Measured at mbp14 (1512×982).
 */

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
});

/** Seeds the state, opens the Study Workspace and waits for the Topic's opener, so it is not counted as a reply below. */
async function study(page: Page, state: State | "reveal") {
  await seed(page, state as State);
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  await settled(page);
  if ((await page.getByTestId("assistant-message").count()) === 0) {
    await expect(page.getByTestId("assistant-message")).not.toHaveCount(0, { timeout: 30_000 }).catch(() => {});
    await settled(page);
  }
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
  const plan: { state?: State | "reveal"; script: string; text: string }[] = [
    { state: "story", script: "story-reply", text: "Tell me the story." },
    { script: "plain-reply", text: "What is a basis point?" },
    { state: "concept-widget", script: "concept-percent-change", text: "What is a percent change?" },
    { script: "plain-reply", text: "And a basis point again?" },
    { state: "your-turn", script: "your-turn-reply", text: "How do I start?" },
    { state: "reveal", script: "reveal-reply", text: "What did the Fed do?" },
  ];
  const perReply: string[][] = [];
  for (const step of plan) {
    if (step.state) await study(page, step.state);
    perReply.push(await reply(page, step.script, step.text));
  }
  expect(perReply.map((names) => names.length)).toEqual([1, 1, 1, 1, 1, 1]);
});

test("Widget on 100 % of replies (scripted): beside an open quiz, no Widget code adds shows the quiz's numbers", async ({ page }) => {
  await study(page, "quiz-open");
  const quizNumbers = numbersIn((await page.getByTestId("quiz").first().textContent()) ?? "");
  const added = await reply(page, "quiz-open", "Which question first?");
  expect(added.length).toBeLessThanOrEqual(1);
  for (const name of added) {
    await page.getByTestId("widget-chip").filter({ hasText: name }).first().click();
    const shown = numbersIn(`${name} ${await page.getByTestId("widget-pane").innerText()}`.replace(await page.getByTestId("quiz").first().innerText().catch(() => ""), ""));
    expect([...shown].filter((n) => quizNumbers.has(n))).toEqual([]);
  }
});
