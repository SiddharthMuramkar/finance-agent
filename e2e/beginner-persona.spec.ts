import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PERSONA_TURNS, WORD_CHOICE, WORD_CHOICE_LABEL, type PersonaTurn } from "../src/dev/beginner-persona";
import { say, script, seed, settled } from "./support/app";

/**
 * The Beginner persona's 10-turn transcript (spec 2026-11-05, §6.2 "Persona scores"; #531). Owner decision, 11 Nov 2026:
 * the persona gate is scored on this scripted run, which costs nothing, not on a 20-prompt live eval. The run plays ten
 * turns at the Concept step of "Percent, percentage points and basis points", each with its own scripted reply
 * (src/dev/beginner-persona.ts), and writes the transcript the persona critic reads: the Learner's line, the Tutor's reply,
 * the Widget's text and the Choices, turn by turn. `PERSONA_OUT` names the folder to write it in (default: the test's output folder).
 * Measured at mbp14 (1512×982).
 */

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "mbp14", "measured at 1512×982");
});

/** How long a turn may take: the first one can reach a dev server that has not compiled the Tutor route or the Widget path yet. */
const TURN_MS = 180_000;

type Seen = { turn: number; learner: string; script: string; tutor: string; widget: string; choices: string[] };

/** Taps the Choice with these words under the latest reply and waits for the reply it brings. */
async function tap(page: Page, turn: PersonaTurn) {
  await script(page, turn.script);
  // The word Choice names the word the reply used (G6), so it is found by its shape.
  const choice = page.getByTestId("choices").last().getByTestId("choice").filter({ hasText: turn.learner === WORD_CHOICE ? WORD_CHOICE_LABEL : turn.learner });
  await expect(choice).toHaveCount(1, { timeout: TURN_MS });
  const before = await page.getByTestId("assistant-message").count();
  await choice.click();
  await expect(page.getByTestId("assistant-message")).toHaveCount(before + 1, { timeout: TURN_MS });
  await settled(page, TURN_MS);
}

/** What the Learner sees after a turn: the latest reply (less its label and Save button), the Widget on the stage and the Choices. */
async function seen(page: Page, n: number, turn: PersonaTurn): Promise<Seen> {
  const choices = page.getByTestId("choices").last().getByTestId("choice");
  // The Choices come back once the page has re-read the Learner's place after the turn.
  await expect(choices.first()).toBeVisible({ timeout: TURN_MS });
  const reply = await page.getByTestId("assistant-message").last().innerText();
  const card = page.getByTestId("widget-card").first();
  return {
    turn: n,
    learner: turn.how === "tapped" ? `[tapped Choice] ${turn.learner}` : turn.learner,
    script: turn.how === "seed" ? `${turn.script} (seed)` : turn.script,
    tutor: reply.replace(/^Tutor\s+/, "").replace(/\s+Save to Notebook\s*$/, "").trim(),
    widget: (await card.count()) ? (await card.innerText()).trim() : "",
    choices: await choices.allInnerTexts(),
  };
}

const markdown = (turns: Seen[]) =>
  [
    "# 10-turn scripted transcript (seed concept-widget, Topic num-percent-bps, scripted Tutor, no paid calls)",
    ...turns.map((t) => `## Turn ${t.turn} (script ${t.script})\n\n**Learner:** ${t.learner}\n\n**Tutor:**\n${t.tutor}\n\n**Widget:**\n${t.widget}\n\n**Choices:** ${t.choices.join(" | ")}`),
  ].join("\n\n") + "\n";

test("Beginner persona: ten turns, ten different scripted replies, each one answering what was asked", async ({ page }, info) => {
  test.setTimeout(600_000);
  await seed(page, "concept-widget");
  await page.goto("/study");
  await expect(page.getByTestId("workspace-frame")).toBeVisible();
  await settled(page);

  const transcript: Seen[] = [await seen(page, 1, PERSONA_TURNS[0])];
  for (const [i, turn] of PERSONA_TURNS.slice(1).entries()) {
    if (turn.how === "tapped") await tap(page, turn);
    else await say(page, turn.script, turn.learner, TURN_MS);
    transcript.push(await seen(page, i + 2, turn));
  }

  const out = process.env.PERSONA_OUT ?? info.outputPath("beginner-persona");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "transcript-concept-reply-widget.md"), markdown(transcript));
  writeFileSync(join(out, "transcript-concept-reply-widget.json"), JSON.stringify({ seed: "concept-widget", topic: "num-percent-bps", turns: transcript }, null, 2));

  // Each reply carries what the persona asked about, and no two replies are the same words.
  for (const [i, turn] of PERSONA_TURNS.entries()) expect(transcript[i].tutor, `turn ${i + 1}: ${turn.learner}`).toContain(turn.answers);
  const replies = transcript.map((t) => t.tutor);
  expect(replies.filter((reply, i) => replies.indexOf(reply) !== i), "replies repeated word for word").toEqual([]);
  expect(new Set(transcript.map((t) => t.script)).size, "scripts played").toBe(10);
});
