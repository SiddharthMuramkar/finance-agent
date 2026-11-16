import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { parse } from "yaml";
import { E2E_SCRIPTS, type E2eScriptName } from "../src/dev/e2e-tutor";
import { hydrated, replyLanded, script, seed, settled } from "./support/app";

/**
 * The ready-Case valuation Topic (spine-15-value-yourself, ticket #92): the Learner judges a published Story on one of
 * three ready Cases (Amazon 2000, Coffee Day 2015, Zomato 2021) instead of telling their own. Its explore Workbench is
 * Value levers in match_price mode with a chip for each Case and no "Save my story", and the Topic Start card offers
 * "I know this: quiz me" like any other Spine Topic; one miss still passes. The play's turns are shot at 1280 and 390 px
 * for the Spine critics (CRITICS_DIR, when set), with the scripted transcript beside them.
 */

const TOPIC = "spine-15-value-yourself";
const TURN_MS = 60_000;
const plain = (text: string) => text.replace(/\s+/g, " ").trim();

type Written = { prompt: string; choices?: { id: string; text: string }[]; answer?: string };
const file = parse(readFileSync(`course/topics/${TOPIC}.yaml`, "utf8")) as { questions: Written[] };
const written = file.questions.filter((q) => q.choices && q.answer);
const rightFor = new Map(written.map((q) => [plain(q.prompt), q.choices!.find((c) => c.id === q.answer)!.text]));
const wrongFor = new Map(written.map((q) => [plain(q.prompt), q.choices!.find((c) => c.id !== q.answer)!.text]));

/**
 * The right choice of a computed question, worked out by the engine from the Case's valuation block (spec D2): Coffee
 * Day's value moves most with its margin; of the four Zomato stories, only far more sales with a higher margin reaches
 * the Rs 76 offer price.
 */
function computedPick(prompt: string): string | null {
  if (/Coffee Day story, which change moves the value most/.test(prompt)) return "What it keeps in ten years: 15% to 18%";
  if (/Zomato story comes to about Rs 41, and the offer price is Rs 76/.test(prompt)) return "Sales of Rs 30,000 crore in ten years, keeping 41%";
  return null;
}

const quizAnswer = (page: Page) => page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/skip-ahead");

/** What the critics read (docs/critics/README.md): each turn at 1280 and 390 px, and the scripted transcript. */
const CRITICS_DIR = process.env.CRITICS_DIR;
const transcript: string[] = [];
async function shoot(page: Page, name: string) {
  if (!CRITICS_DIR) return;
  mkdirSync(CRITICS_DIR, { recursive: true });
  await page.screenshot({ path: join(CRITICS_DIR, `${name}-1280.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(CRITICS_DIR, `${name}-390.png`), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
}
function tutorSaid(name: E2eScriptName) {
  const replies = E2E_SCRIPTS[name].replies as { content?: { type: string; text?: string; name?: string; input?: unknown }[] }[];
  for (const block of replies.flatMap((r) => r.content ?? [])) {
    if (block.type === "text") transcript.push(`Tutor (${name}): ${block.text}`);
    else transcript.push(`Tutor tool (${name}): ${block.name} ${JSON.stringify(block.input)}`);
  }
}

async function next(page: Page, label: string, name: E2eScriptName) {
  await script(page, name);
  const chip = page.getByTestId("next-chip").last();
  await expect(chip).toHaveText(`${label} →`, { timeout: TURN_MS });
  transcript.push(`Learner: taps "${label}"`);
  const before = await page.getByTestId("assistant-message").count();
  await chip.click();
  await expect(page.getByTestId("assistant-message")).toHaveCount(before + 1, { timeout: TURN_MS });
  await settled(page, TURN_MS);
  tutorSaid(name);
}

async function openTopic(page: Page) {
  await seed(page, "fresh");
  const chose = await page.request.post("/api/jump", { data: { topicId: TOPIC } });
  expect(chose.status()).toBe(200);
}

test("[#92] the Topic judges a published Story: Value levers in match_price with Case chips, and no Save my story", async ({ page }, info) => {
  test.skip(info.project.name !== "w1280", "one width plays it; the shots take 390 px too");
  test.setTimeout(300_000);
  await openTopic(page);
  await script(page, "spine15-story");
  await page.goto("/study");
  await hydrated(page);
  await replyLanded(page);
  await expect(page.getByTestId("topic-bar")).toContainText("Judge a published valuation, as of a past date");
  tutorSaid("spine15-story");
  // Skip ahead is offered on this Spine Topic like any other.
  await expect(page.getByTestId("topic-start").getByRole("button", { name: "I know this: quiz me" })).toBeVisible();
  await shoot(page, "turn1-story");

  await next(page, "Next: Concept", "spine15-concept");
  await shoot(page, "turn2-concept");

  await next(page, "Next: Explore", "spine15-explore");
  const bench = page.getByTestId("value-levers").last();
  await expect(bench).toBeVisible({ timeout: TURN_MS });
  const chips = bench.locator("[data-case]");
  await expect(chips).toHaveText(["Amazon, Feb 2000", "Coffee Day, Oct 2015", "Zomato, Jul 2021"]);
  await expect(bench.getByTestId("value-levers-save")).toHaveCount(0);
  await expect(page.getByText("Save my story")).toHaveCount(0);
  // match_price reads out what the price assumed: which lever alone reaches the $84 price.
  await expect(bench.getByTestId("value-levers-numbers")).toContainText("Reaches the $84 price alone");
  transcript.push(`Widget: ${plain(await bench.innerText())}`);
  await chips.nth(2).click();
  transcript.push('Learner: taps the chip "Zomato, Jul 2021"');
  await expect(bench.getByTestId("value-levers-headline")).toContainText("₹");
  await expect(bench.getByTestId("value-levers-numbers")).toContainText("₹76");
  transcript.push(`Widget: ${plain(await bench.innerText())}`);
  await shoot(page, "turn3-explore");

  if (CRITICS_DIR) writeFileSync(join(CRITICS_DIR, "transcript.txt"), `${transcript.join("\n\n")}\n`);
});

test("[#92] I know this: quiz me works on the Topic: one miss, and it is passed on the Course Map", async ({ page }, info) => {
  test.skip(info.project.name !== "w1280", "one width is enough: the quiz is the behaviour");
  test.setTimeout(180_000);
  await openTopic(page);
  await page.goto("/study");
  await hydrated(page);
  await replyLanded(page);

  const start = page.getByTestId("topic-start");
  const opened = quizAnswer(page);
  await start.getByRole("button", { name: "I know this: quiz me" }).click();
  expect((await opened).status(), "POST /api/skip-ahead (open)").toBe(200);
  const quiz = start.getByTestId("skip-ahead-quiz");
  await expect(quiz).toBeVisible();
  const questions = quiz.locator("fieldset");
  const count = await questions.count();
  expect(count).toBeGreaterThanOrEqual(4);
  expect(count).toBeLessThanOrEqual(8);
  let missed = false;
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const question = questions.nth(i);
    const prompt = plain(await question.locator("legend span").nth(1).innerText());
    // Miss the first written question; every other is answered right.
    const miss = !missed && wrongFor.has(prompt);
    const pick = miss ? wrongFor.get(prompt) : (rightFor.get(prompt) ?? computedPick(prompt));
    expect(pick, `an answer for "${prompt}"`).toBeTruthy();
    if (miss) missed = true;
    lines.push(`Choices: ${prompt} -> ${pick}${miss ? " (missed on purpose)" : ""}`);
    await question.getByText(pick!, { exact: true }).click();
  }
  expect(missed, "a written question to miss").toBe(true);
  const marked = quizAnswer(page);
  await quiz.getByRole("button", { name: "Submit answers" }).click();
  expect((await marked).status(), "POST /api/skip-ahead (answers)").toBe(200);
  await expect(start.getByTestId("skip-ahead-result")).toContainText(`${count - 1} of ${count} right. Topic passed.`);
  if (CRITICS_DIR) {
    await shoot(page, "turn4-quiz-me");
    writeFileSync(join(CRITICS_DIR, "transcript-quiz-me.txt"), `${lines.join("\n")}\n`);
  }

  await page.goto("/course");
  await expect(page.locator(`li[data-topic="${TOPIC}"]`)).toHaveAttribute("data-status", "passed");
});
