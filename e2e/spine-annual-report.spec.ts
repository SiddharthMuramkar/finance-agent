import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_SCRIPTS, type E2eScriptName } from "../src/dev/e2e-tutor";
import { quietDevtools, replyLanded, script, settled, signIn } from "./support/app";

/**
 * The new last Spine Topic on the Test bed (#93, spec #68): a valuation's numbers in an annual report. It plays its first
 * three Tutor Turns in the page, Story, Concept and Explore, with the scripted Tutor (src/dev/e2e-tutor.ts, the `ar-*`
 * scripts), and opens the Value bridge on Amazon's Case at explore; the Course Map lists it last on the Spine. The run
 * writes what the critics read: each turn's Learner action, Tutor reply, Widget text and Choices, with a screenshot of each
 * turn at 1280 and 390 px. `CRITICS_OUT` names the folder to write it in (default: the test's output folder).
 */

const TURN_MS = 120_000;
const plain = (text: string) => text.replace(/\s+/g, " ").trim();

type Seen = { turn: number; learner: string; script: string; tutor: string; widget: string; choices: string[]; shots: string[] };

type Play = { topic: string; title: RegExp; seed: string; turns: [E2eScriptName, E2eScriptName, E2eScriptName] };

const PLAYS: Play[] = [
  { topic: "spine-annual-report", title: /where are a valuation's numbers in an annual report/i, seed: "spine-ar-start", turns: ["ar-story", "ar-concept", "ar-explore"] },
];

/** The first sentence of a script's words, which the reply on the page must hold if the reply checks let it through. */
const firstSentence = (name: E2eScriptName) => {
  const replies = E2E_SCRIPTS[name].replies as { content?: { type: string; text?: string }[] }[];
  const words = replies.flatMap((r) => r.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n\n");
  return plain(words.split(/(?<=[.!?])\s/)[0]);
};

async function seedAt(page: Page, state: string) {
  await quietDevtools(page);
  await signIn(page);
  const response = await page.request.post("/api/dev-e2e", { data: { state } });
  expect(response.status(), `seed ${state}: ${await response.text()}`).toBe(200);
}

/** Presses the Next chip with the scripted Tutor set to `name`, and waits for its reply; returns the chip's words. */
async function next(page: Page, name: E2eScriptName): Promise<string> {
  await script(page, name);
  const chip = page.getByTestId("next-chip").last();
  await expect(chip).toBeVisible({ timeout: TURN_MS });
  const label = plain(await chip.innerText());
  const before = await page.getByTestId("assistant-message").count();
  await chip.click();
  await expect(page.getByTestId("assistant-message")).toHaveCount(before + 1, { timeout: TURN_MS });
  await settled(page, TURN_MS);
  return label;
}

/** What the Learner sees after a turn, with a screenshot at 1280 and at 390 px. */
async function seen(page: Page, out: string, play: Play, n: number, learner: string, name: E2eScriptName): Promise<Seen> {
  const reply = page.getByTestId("assistant-message").filter({ hasText: firstSentence(name).slice(0, 60) }).last();
  await expect(reply, name).toBeVisible({ timeout: TURN_MS });
  const choices = page.getByTestId("choices").last().getByTestId("choice");
  const card = page.getByTestId("widget-card").first();
  const shots: string[] = [];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
    const file = `${play.topic}-turn${n}-${width}.png`;
    await page.screenshot({ path: join(out, file), fullPage: false });
    shots.push(file);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  return {
    turn: n,
    learner,
    script: name,
    tutor: (await reply.innerText()).replace(/^Tutor\s+/, "").replace(/\s+Save to Notebook\s*$/, "").trim(),
    widget: (await card.count()) ? (await card.innerText()).trim() : "",
    choices: (await choices.count()) ? await choices.allInnerTexts() : [],
    shots,
  };
}

const markdown = (play: Play, turns: Seen[]) =>
  [
    `# ${play.topic}: three scripted turns (seed ${play.seed}, scripted Tutor, no paid calls)`,
    ...turns.map(
      (t) =>
        `## Turn ${t.turn} (script ${t.script})\n\n**Learner:** ${t.learner}\n\n**Tutor:**\n${t.tutor}\n\n**Widget:**\n${t.widget || "(none)"}\n\n**Choices:** ${t.choices.join(" | ") || "(none)"}\n\n**Screenshots:** ${t.shots.join(", ")}`,
    ),
  ].join("\n\n") + "\n";

for (const play of PLAYS) {
  test(`[#93] ${play.topic}: Story, Concept and Explore play on the Test bed, with the Value bridge at explore`, async ({ page }, info) => {
    test.skip(info.project.name !== "w1280", "one run takes both widths itself");
    test.setTimeout(600_000);
    const out = process.env.CRITICS_OUT ?? info.outputPath("critics");
    mkdirSync(out, { recursive: true });

    await seedAt(page, play.seed);
    await script(page, play.turns[0]);
    await page.goto("/study");
    await replyLanded(page);
    await expect(page.getByTestId("topic-bar")).toContainText(play.title);
    const turns: Seen[] = [await seen(page, out, play, 1, "[opened the Topic]", play.turns[0])];

    const concept = await next(page, play.turns[1]);
    turns.push(await seen(page, out, play, 2, `[tapped] ${concept}`, play.turns[1]));
    const explore = await next(page, play.turns[2]);
    turns.push(await seen(page, out, play, 3, `[tapped] ${explore}`, play.turns[2]));

    writeFileSync(join(out, `transcript-${play.topic}.md`), markdown(play, turns));
    writeFileSync(join(out, `transcript-${play.topic}.json`), JSON.stringify({ seed: play.seed, topic: play.topic, turns }, null, 2));

    // The six numbers at Story, the two pages at Concept, and the Value bridge on Amazon's Case at Explore.
    expect(turns[0].tutor).toContain("sales, operating profit, tax, debt, cash and shares");
    expect(turns[1].tutor).toMatch(/income statement[\s\S]*balance sheet/);
    expect(turns[2].widget).toMatch(/Business value/);
    expect(turns[2].widget).toMatch(/Left for shareholders/);
  });
}
