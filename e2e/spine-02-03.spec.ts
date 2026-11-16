import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_SCRIPTS } from "../src/dev/e2e-tutor";
import { quietDevtools, replyLanded, script, settled, signIn, type Script } from "./support/app";

/**
 * Spine Topics 2 and 3 for beginners (#89, spec #68): the first three Tutor Turns of each, Story, Concept and Explore,
 * played on the Test bed with the scripted Tutor (src/dev/e2e-tutor.ts, the `spine2-*` and `spine3-*` scripts). It checks
 * what a beginner meets first (the jackpot only, no Amazon; the cash Workbench opening at a small profit on each sale)
 * and writes what the Spine critics read (docs/critics): the transcript of Learner, Tutor, Widget and Choices (in the
 * test's output folder, or `SPINE_CRITICS_OUT`), and, only when `SPINE_CRITICS_OUT` is set, a screenshot of each turn at
 * 1280 and 390 px there. CI sets neither, so it writes no PNG (src/dev/e2e-shots.test.ts).
 */

const TURN_MS = 90_000;
const plain = (text: string) => text.replace(/\s+/g, " ").trim();

type Seen = { topic: string; turn: number; step: string; script: Script; learner: string; tutor: string; widget: string; choices: string[] };

const TOPICS = [
  { id: "spine-02-money-later", seed: "spine-02-start", title: "Why is money later worth less?", scripts: ["spine2-story", "spine2-concept", "spine2-explore"], bench: "annuity-slider" },
  { id: "spine-03-cash", seed: "spine-03-start", title: "Where does the cash come from?", scripts: ["spine3-story", "spine3-concept", "spine3-explore"], bench: "cash-waterfall" },
] as const;

/** The script's reply landed as written: a Tutor reply on the page holds its first sentence. */
async function landedAsWritten(page: Page, name: Script) {
  const replies = E2E_SCRIPTS[name].replies as { content?: { type: string; text?: string }[] }[];
  const words = replies.flatMap((r) => r.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n\n");
  const first = plain(words.split(/(?<=[.!?])\s/)[0]);
  await expect(page.getByTestId("assistant-message").filter({ hasText: first.slice(0, 60) }).last(), name).toBeVisible({ timeout: TURN_MS });
}

/** Presses the Next chip, which must read `label`, with the scripted Tutor set to `name`, and waits for its reply. */
async function next(page: Page, label: string, name: Script) {
  await script(page, name);
  const chip = page.getByTestId("next-chip").last();
  await expect(chip).toHaveText(`${label} →`, { timeout: TURN_MS });
  const before = await page.getByTestId("assistant-message").count();
  await chip.click();
  await expect(page.getByTestId("assistant-message")).toHaveCount(before + 1, { timeout: TURN_MS });
  await settled(page, TURN_MS);
  await landedAsWritten(page, name);
}

/** What the Learner sees after a turn: the latest reply, the Widget on the stage, and the Choices under the reply. */
async function seen(page: Page, topic: string, turn: number, step: string, name: Script, learner: string, bench?: string): Promise<Seen> {
  const reply = await page.getByTestId("assistant-message").last().innerText();
  const pane = bench ? page.getByTestId("widget-pane").filter({ has: page.getByTestId(bench) }).first() : page.getByTestId("widget-pane").first();
  const choices = page.getByTestId("choices").last().getByTestId("choice");
  return {
    topic,
    turn,
    step,
    script: name,
    learner,
    tutor: reply.replace(/^Tutor\s+/, "").replace(/\s+Save to Notebook\s*$/, "").trim(),
    widget: (await pane.count()) && (await pane.isVisible()) ? plain(await pane.innerText()) : "",
    choices: (await choices.count()) ? await choices.allInnerTexts() : [],
  };
}

/** One screenshot of the turn at 1280 px and one at 390 px, then back to the project's width; only for the critics' folder. */
async function shoot(page: Page, out: string, topic: string, turn: number) {
  if (!process.env.SPINE_CRITICS_OUT) return;
  const size = page.viewportSize()!;
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `${topic}-turn${turn}-${width}.png`) });
  }
  await page.setViewportSize(size);
}

const markdown = (turns: Seen[]) =>
  [
    "# Spine Topics 2 and 3: the first three turns of each (scripted Tutor, Test bed, no paid calls)",
    ...turns.map((t) => `## ${t.topic}, turn ${t.turn}: ${t.step} (script ${t.script})\n\n**Learner:** ${t.learner}\n\n**Tutor:**\n${t.tutor}\n\n**Widget:**\n${t.widget || "(none)"}\n\n**Choices:** ${t.choices.join(" | ") || "(none)"}`),
  ].join("\n\n") + "\n";

test("[#89] Spine Topics 2 and 3 open for a beginner: the jackpot only, and the cash Workbench at a profit on each sale", async ({ page }, info) => {
  test.skip(info.project.name !== "w1280", "one width plays; the screenshots take 1280 and 390 themselves");
  test.setTimeout(10 * 60_000);
  const out = process.env.SPINE_CRITICS_OUT ?? info.outputPath("spine-02-03");
  mkdirSync(out, { recursive: true });
  const transcript: Seen[] = [];

  await quietDevtools(page);
  await signIn(page);
  for (const topic of TOPICS) {
    const response = await page.request.post("/api/dev-e2e", { data: { state: topic.seed } });
    expect(response.status(), `seed ${topic.seed}: ${await response.text()}`).toBe(200);

    // Story: the page starts the Topic's opener on its empty Session.
    await script(page, topic.scripts[0]);
    await page.goto("/study");
    await replyLanded(page);
    await expect(page.getByTestId("topic-bar")).toContainText(topic.title);
    await landedAsWritten(page, topic.scripts[0]);
    transcript.push(await seen(page, topic.id, 1, "story", topic.scripts[0], "(opens the Topic)"));
    await shoot(page, out, topic.id, 1);

    await next(page, "Next: Concept", topic.scripts[1]);
    transcript.push(await seen(page, topic.id, 2, "concept", topic.scripts[1], "[tapped Choice] Next: Concept"));
    await shoot(page, out, topic.id, 2);

    await next(page, "Next: Explore", topic.scripts[2]);
    // Code opens the Topic's explore Widget when the explore step begins: the annuity Widget, or the cash waterfall.
    await expect(page.getByTestId(topic.bench).first()).toBeVisible({ timeout: TURN_MS });
    await settled(page, TURN_MS);
    transcript.push(await seen(page, topic.id, 3, "explore", topic.scripts[2], "[tapped Choice] Next: Explore", topic.bench));
    await shoot(page, out, topic.id, 3);
  }

  writeFileSync(join(out, "transcript.md"), markdown(transcript));
  writeFileSync(join(out, "transcript.json"), JSON.stringify({ topics: TOPICS.map((t) => t.id), turns: transcript }, null, 2));

  // The lottery Topic is about the lottery only: no turn names Amazon.
  const lottery = transcript.filter((t) => t.topic === "spine-02-money-later");
  for (const t of lottery) expect(`${t.tutor} ${t.widget}`, `turn ${t.turn}`).not.toMatch(/amazon|damodaran/i);
  // The cash Workbench opens at a small profit on each sale, not Webvan's own -179%.
  const bench = transcript.find((t) => t.topic === "spine-03-cash" && t.step === "explore")!;
  expect(bench.widget).not.toMatch(/-179|−179/);
  expect(bench.widget).toMatch(/Operating margin/);
});
