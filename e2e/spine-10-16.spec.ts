import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_SCRIPTS } from "../src/dev/e2e-tutor";
import { quietDevtools, replyLanded, script, settled, signIn, type Script } from "./support/app";

/**
 * Spine Topics 10 to 16 for beginners (#96, spec #68): the first three Tutor Turns, Story, Concept and Explore, of each
 * Topic #96 changed (one share, survival, story to numbers, price or value, what the price assumes, being wrong, judge
 * a published valuation), played on the Test bed with the scripted Tutor (src/dev/e2e-tutor.ts, the `oneshare-*`, `survive-*`,
 * `numbers-*`, `multiple-*`, `assumes-*`, `wrong-*` and `yourself-*` scripts). It checks that each Topic plays
 * its three turns with its explore Workbench on the stage at explore, and writes what the Spine
 * critics read (docs/critics): the transcript of Learner, Tutor, Widget and Choices (in the test's output folder, or
 * `SPINE_CRITICS_OUT`), and, only when `SPINE_CRITICS_OUT` is set, a screenshot of each turn at 1280 and 390 px there.
 */

const TURN_MS = 90_000;
const plain = (text: string) => text.replace(/\s+/g, " ").trim();

type Seen = { topic: string; turn: number; step: string; script: Script; learner: string; tutor: string; widget: string; choices: string[] };

const TOPICS = [
  { id: "spine-09-to-one-share", seed: "spine-09-start", title: "How do you get from the business to one share?", scripts: ["oneshare-story", "oneshare-concept", "oneshare-explore"], bench: "value-bridge" },
  { id: "spine-10-survival", seed: "spine-10-start", title: "What if it does not survive?", scripts: ["survive-story", "survive-concept", "survive-explore"], bench: "value-levers" },
  { id: "spine-11-story-to-numbers", seed: "spine-11-start", title: "How does a story become numbers?", scripts: ["numbers-story", "numbers-concept", "numbers-explore"], bench: "value-levers" },
  { id: "spine-12-price-or-value", seed: "spine-12-start", title: "Is a price a value?", scripts: ["multiple-story", "multiple-concept", "multiple-explore"], bench: "multiple-decoder" },
  { id: "spine-13-price-assumes", seed: "spine-13-start", title: "What does the price assume?", scripts: ["assumes-story", "assumes-concept", "assumes-explore"], bench: "value-levers" },
  { id: "spine-14-being-wrong", seed: "spine-14-start", title: "How do you live with being wrong?", scripts: ["wrong-story", "wrong-concept", "wrong-explore"], bench: "value-levers" },
  { id: "spine-15-value-yourself", seed: "spine-15-start", title: "Judge a published valuation, as of a past date", scripts: ["yourself-story", "yourself-concept", "yourself-explore"], bench: "value-levers" },
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
    "# Spine Topics 10 to 16 (#96): the first three turns of each Topic changed (scripted Tutor, Test bed, no paid calls)",
    ...turns.map((t) => `## ${t.topic}, turn ${t.turn}: ${t.step} (script ${t.script})\n\n**Learner:** ${t.learner}\n\n**Tutor:**\n${t.tutor}\n\n**Widget:**\n${t.widget || "(none)"}\n\n**Choices:** ${t.choices.join(" | ") || "(none)"}`),
  ].join("\n\n") + "\n";

test("[#96] Spine Topics 10 to 16 open for a beginner: three turns each, with the explore Workbench at explore", async ({ page }, info) => {
  test.skip(info.project.name !== "w1280", "one width plays; the screenshots take 1280 and 390 themselves");
  test.setTimeout(25 * 60_000);
  const out = process.env.SPINE_CRITICS_OUT ?? info.outputPath("spine-10-16");
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

  // Every Topic played its three turns, and each explore turn has its Workbench on the stage.
  expect(transcript.map((t) => `${t.topic} ${t.step}`)).toEqual(TOPICS.flatMap((t) => ["story", "concept", "explore"].map((s) => `${t.id} ${s}`)));
  for (const t of transcript.filter((x) => x.step === "explore")) expect(t.widget, t.topic).not.toBe("");
});
