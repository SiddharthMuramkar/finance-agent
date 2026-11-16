import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_SCRIPTS } from "../src/dev/e2e-tutor";
import { quietDevtools, replyLanded, RESET_RETRIES, script, seed, settled, signIn, type Script } from "./support/app";

/**
 * Spine Topic 1 on the Test bed (spec 2026-11-12 Part C, "Done when"): a browser test completes Spine Topic 1 ("What is
 * a business worth?", Damodaran's Amazon of February 2000) in under 15 minutes of scripted play. A fresh tools Learner
 * starts at the Topic's Story (fixture `spine-01-start`); every step after is taken in the page, as a Learner takes it:
 * the Next chip, the Value levers Workbench, the Insight's choices, the Quick tries, the quiz Check and the judging Check.
 * The Learner types nothing (ticket #88, ADR 0020): the Insight is a tap code marks, and both Checks are taps. The
 * scripted Tutor (src/dev/e2e-tutor.ts, the `spine1-*` scripts) plays each Tutor Turn; show_widget opens the explore
 * Workbench. Each turn's Learner message, Tutor reply, Widget text and Choices go to the critics' transcript.
 *
 * On a phone (390 px, spec #68, #83) the same play is passed by touch: the explore Workbench and the quiz Check each have
 * an entry in the conversation that slides them up in the full-screen sheet, and the sheet's Back button returns to the
 * conversation. A due spaced Review has its entry too, and is answered the same way.
 */

const LIMIT_MS = 15 * 60 * 1000;
/** Each Tutor Turn's wait: the dev server compiles a route the first time it is asked for. */
const TURN_MS = 60_000;

/** A phone's width (below 768 px, src/app/screen.ts): there the Widget column is a sheet the conversation slides up. */
const onPhone = (page: Page) => page.viewportSize()!.width < 768;

/** A tap on a phone, a click elsewhere: the Learner's press. */
const press = (target: Locator) => (onPhone(target.page()) ? target.tap() : target.click());

/** The phone's sheet (the Widget column), up or away. */
const sheet = (page: Page) => page.getByTestId("panel-column");

/** On a phone, taps the conversation's entry for `view` ("explore", "check", "review") so the sheet slides it up. */
async function openSheet(page: Page, view: "explore" | "check" | "review") {
  if (!onPhone(page)) return;
  const entry = page.locator(`[data-testid="sheet-entry"][data-view="${view}"]`);
  // A press before the page hydrates does nothing yet: press again until the sheet is up (pressing an open entry keeps it up).
  await expect(async () => {
    await press(entry);
    await expect(sheet(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/** On a phone, the sheet's own Back button: back to the conversation. */
async function closeSheet(page: Page) {
  if (!onPhone(page)) return;
  await press(page.getByRole("button", { name: "Back to the conversation" }));
  await expect(sheet(page)).toBeHidden();
}

const plain = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * The critics' inputs (docs/critics/README.md): the scripted transcript, one entry per Learner move (the Learner's tap,
 * the Tutor's reply, the Widget's text, the Choices), and screenshots at 1280 and 390 px. Written to CRITICS_OUT, or to
 * test-results/spine-01 when it is not set.
 */
const OUT = process.env.CRITICS_OUT ?? "test-results/spine-01";
type Seen = { move: number; learner: string; script: string; tutor: string; widget: string; choices: string[] };
const transcript: Seen[] = [];

async function record(page: Page, learner: string, name: string) {
  const reply = page.getByTestId("assistant-message").last();
  const widget = page.getByTestId("value-levers-headline").first();
  const quiz = page.getByTestId("quiz");
  const pick = page.getByTestId("insight-pick");
  const widgetText = [
    (await widget.count()) ? `Workbench: ${plain(await widget.innerText())}` : "",
    (await pick.count()) ? `Insight question: ${plain(await pick.innerText())}` : "",
    (await quiz.count()) ? `Check tab: ${plain(await quiz.innerText())}` : "",
  ].filter(Boolean).join("\n");
  transcript.push({
    move: transcript.length + 1,
    learner,
    script: name,
    tutor: (await reply.count()) ? plain(await reply.innerText()).replace(/^Tutor\s+/, "").replace(/\s+Save to Notebook$/, "") : "",
    widget: widgetText,
    // The Choices come back once the page has re-read the Learner's place after the turn.
    choices: await page.getByTestId("choices").last().getByRole("button").first().waitFor({ timeout: 15_000 }).then(
      () => page.getByTestId("choices").last().getByRole("button").allInnerTexts(),
      () => [],
    ),
  });
}

/**
 * A screenshot at 1280 px and one at 390 px of the same moment, then back to the project's width. Only the critics' run
 * (w1280) calls it, so a second run of the play (p390) never overwrites its files (G40); each shot sets its own width,
 * so a file's name always says the width it was taken at.
 */
async function shoot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: join(OUT, `spine-01-${name}-1280.png`) });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(OUT, `spine-01-${name}-390.png`) });
  await page.setViewportSize(size);
}

function writeTranscript() {
  mkdirSync(OUT, { recursive: true });
  const lines = [
    "# Spine Topic 1 scripted transcript (e2e/spine-01.spec.ts, scripted Tutor, no paid calls)",
    "",
    ...transcript.flatMap((t) => [`## Move ${t.move} (${t.script})`, "", `**Learner:** ${t.learner}`, "", `**Tutor:** ${t.tutor}`, "", ...(t.widget ? [`**Widget:** ${t.widget}`, ""] : []), `**Choices:** ${t.choices.join(" · ")}`, ""]),
  ];
  writeFileSync(join(OUT, "transcript-spine-01.md"), lines.join("\n"));
  writeFileSync(join(OUT, "transcript-spine-01.json"), JSON.stringify(transcript, null, 2));
}

/** Topic 1's daily-life line, as its Topic file writes it (spec #68, ticket #88). */
const DAILY_LIFE = "A headline says a firm is worth $50bn. A price someone paid, or a value someone argued?";

/** The quiz Check's right choice for each of its six questions, found by the question's words (predict: the band it lands in). */
function quizPick(prompt: string): string | null {
  // The judging Check (worth-talk): other people's stories, judged by tap. First: its founder story also "contradicts itself".
  if (/A fan says \$84 is a fair price/i.test(prompt)) return "A far bigger Amazon that keeps a little more of each sale";
  if (/A headline says/i.test(prompt)) return "A price someone paid";
  if (/An analyst writes/i.test(prompt)) return "A value someone argued";
  if (/founder pitches/i.test(prompt)) return "Sales grow ten times over and it builds no new warehouses";
  if (/never cut their prices/i.test(prompt)) return "What it keeps, down";
  if (/safer bet/i.test(prompt)) return "How risky it is, down";
  if (/which change lifts the value most/i.test(prompt)) return "Margin 10% to 12%";
  if (/Which story gets there/i.test(prompt)) return "$65bn of sales and a 12% margin";
  if (/margin ends at 4%/i.test(prompt)) return "Nothing left for shareholders";
  // A predict tap is never marked wrong (spec D1): any band will do for the other change.
  if (/the value will be/i.test(prompt)) return null;
  if (/toys? and electronics/i.test(prompt)) return "How big it gets, up";
  if (/contradicts itself/i.test(prompt)) return "Sales grow 35 times in ten years and it invests almost nothing";
  if (/price or a value/i.test(prompt)) return "A price";
  throw new Error(`No answer written for the quiz question "${prompt}".`);
}

/** The right choice of each of the quiz Check's seven Quick tries, found by the try's words. */
function tryPick(prompt: string): string {
  if (/so it is worth \$84/.test(prompt)) return "A price";
  if (/says \$35 a share/.test(prompt)) return "A value";
  if (/\$89 for a share/.test(prompt)) return "A price";
  if (/toys and electronics/.test(prompt)) return "How big it gets, up";
  if (/Rival shops/.test(prompt)) return "What it keeps, down";
  if (/which change lifts the value most/i.test(prompt)) return "Margin 10% to 12%";
  if (/holds together/.test(prompt)) return "Sales grow fast and it builds warehouses first";
  throw new Error(`No answer written for the Quick try "${prompt}".`);
}

/** Starts the tools Learner over at Spine Topic 1's Story, with an empty live Session; this browser is signed in as it. */
async function seedSpineOne(page: Page) {
  await quietDevtools(page);
  await signIn(page);
  const response = await page.request.post("/api/dev-e2e", { data: { state: "spine-01-start" }, ...RESET_RETRIES });
  expect(response.status(), `seed spine-01-start: ${await response.text()}`).toBe(200);
}

/**
 * The script's reply landed as written: a Tutor reply on the page holds its first sentence and its ask. A reply the checks
 * had rejected would show a retry's or a trimmed fallback's words instead, so this proves every script passed them live.
 */
async function landedAsWritten(page: Page, name: Script) {
  const replies = E2E_SCRIPTS[name].replies as { content?: { type: string; text?: string }[] }[];
  const words = replies.flatMap((r) => r.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n\n");
  const first = plain(words.split(/(?<=[.!?])\s/)[0]);
  const ask = plain(words.split("\n").filter(Boolean).at(-1)!);
  // By its words, not by place: after Complete this Topic the page draws more rows below the closing reply.
  const reply = page.getByTestId("assistant-message").filter({ hasText: first.slice(0, 60) }).last();
  await expect(reply, name).toBeVisible({ timeout: TURN_MS });
  await expect(reply, name).toContainText(ask);
}

/** Presses the Next chip, which must read `label`, with the scripted Tutor set to `name`, and waits for its reply. */
async function next(page: Page, label: string, name: Script) {
  await script(page, name);
  const chip = page.getByTestId("next-chip").last();
  await expect(chip).toHaveText(`${label} →`, { timeout: TURN_MS });
  const before = await page.getByTestId("assistant-message").count();
  await press(chip);
  await expect(page.getByTestId("assistant-message")).toHaveCount(before + 1, { timeout: TURN_MS });
  await settled(page, TURN_MS);
  await landedAsWritten(page, name);
  await record(page, `[tapped] ${label}`, name);
}

/** The current step line of the Topic bar ("Explore — Step 3 of 12"). */
const currentStep = (page: Page) => page.getByTestId("topic-bar").getByTestId("current-step");

/** Taps the right choice of the open Quick try; returns false when no try is open. */
async function answerOpenTry(page: Page): Promise<boolean> {
  const card = page.getByTestId("quick-try").last();
  if (!(await card.count())) return false;
  const choices = card.getByTestId("quick-try-choice");
  if (await choices.first().isDisabled()) return false;
  const prompt = plain(await card.locator(":scope > p").first().innerText());
  const answered = await page.getByTestId("quick-try-result").count();
  await press(choices.filter({ hasText: new RegExp(`^${escape(tryPick(prompt))}$`) }));
  const result = page.getByTestId("quick-try-result").nth(answered);
  // The first answer may wait on the dev server compiling its route.
  await expect(result, prompt).toHaveAttribute("data-verdict", "right", { timeout: TURN_MS });
  return true;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Picks the right choice of every question in the open quiz and submits it. */
async function passQuiz(quiz: Locator) {
  const questions = quiz.locator("fieldset");
  const count = await questions.count();
  expect(count, "questions drawn for one attempt").toBe(4);
  for (let i = 0; i < count; i++) {
    const question = questions.nth(i);
    const prompt = plain(await question.getByTestId("quiz-prompt").innerText());
    const pick = quizPick(prompt);
    if (pick) await press(question.getByText(pick, { exact: true }));
    else await question.getByRole("radio").first().check();
  }
  await press(quiz.getByRole("button", { name: "Submit answers" }));
}

test("[Part C] Spine Topic 1 is played whole on the Test bed, and passed, in under 15 minutes", async ({ page }, info) => {
  test.skip(info.project.name !== "w1280", "one width is enough: the play is the behaviour");
  await playTopicOne(page, { critics: true });
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true });

  test("[#83] Spine Topic 1 is passed whole at 390 px, by taps and Lever moves", async ({ page }, info) => {
    test.skip(info.project.name !== "p390", "one phone width is enough (#83)");
    // The critics' transcript and shots come from the w1280 play only (G40): this run writes none.
    await playTopicOne(page, { critics: false });
  });

  test("[#83] a due spaced Review has an entry in the conversation, and is answered in the sheet", async ({ page }, info) => {
    test.skip(info.project.name !== "p390", "one phone width is enough (#83)");
    test.setTimeout(3 * TURN_MS);
    await seed(page, "review-due");
    await page.goto("/study");
    await expect(page.getByTestId("workspace-frame")).toBeVisible();
    await expect(sheet(page)).toBeHidden();
    await openSheet(page, "review");
    const review = page.getByTestId("review");
    await expect(review).toBeVisible();
    if (!(await review.getByRole("radio").first().isVisible())) await press(review.locator("summary"));
    await press(review.locator('label[data-affordance="option"]').first());
    await press(review.getByRole("button", { name: "Submit answer" }));
    await expect(page.getByTestId("review-result")).toBeVisible({ timeout: TURN_MS });
    await closeSheet(page);
    await expect(page).toHaveURL(/\/study$/);
  });
});

/** Plays Spine Topic 1 whole. `critics` writes the critics' transcript and screenshots to OUT (one run only, G40). */
async function playTopicOne(page: Page, { critics }: { critics: boolean }) {
  test.setTimeout(LIMIT_MS + 120_000);
  const snap = (name: string) => (critics ? shoot(page, name) : Promise.resolve());
  const started = Date.now();

  // Story: the page starts the Topic's opener on its empty Session.
  await seedSpineOne(page);
  await script(page, "spine1-story");
  await page.goto("/study");
  await replyLanded(page);
  await expect(page.getByTestId("topic-bar")).toContainText("What is a business worth?");
  await expect(currentStep(page)).toHaveText(/^The moment — Step 1 of \d+$/);
  await landedAsWritten(page, "spine1-story");
  await record(page, "[opened the Topic]", "spine1-story");
  await snap("story");

  // Concept: code shows the quiz Check's Concept card; the Tutor names the four levers.
  await next(page, "Next: Concept", "spine1-concept");
  await expect(page.getByText("A price is paid; a value is argued").first()).toBeVisible();

  // Explore: the Tutor opens the Value levers Workbench; the Learner finds a story worth the $84 price.
  await next(page, "Next: Explore", "spine1-explore");
  await expect(currentStep(page)).toHaveText(/^Explore — /, { timeout: TURN_MS });
  const headline = page.getByTestId("value-levers-headline");
  await expect(headline).toHaveText("This story is worth $35 a share", { timeout: TURN_MS });
  // One Value levers tab: code opens the Workbench as "Explore"; the Tutor's show_widget of the same recipe and Case is
  // pointed at it instead of adding "Amazon, February 2000: the four levers" beside it.
  await landedAsWritten(page, "spine1-explore");
  await expect(page.getByTestId("widget-chip").filter({ hasText: "the four levers" })).toHaveCount(0);
  await openSheet(page, "explore");
  await expect(headline).toHaveCount(1);
  await expect(headline).toBeVisible();
  // One name per idea between the Topic and its Workbench (#88): the Topic's lever words, and the bars in plain words.
  // Read once the Workbench is on screen: on a phone that is after its entry slides the sheet up (#83).
  await expect(page.getByRole("slider", { name: "Sales for each dollar invested" })).toBeVisible();
  await expect(page.getByText("Cash it makes each year, then after year 10")).toBeVisible();
  // A first look (critics round 4): lever 1 says sales, as the Topic does, and no share of the value after year 10 (over 100%).
  await expect(page.getByTestId("value-levers-numbers")).not.toContainText("after year 10");
  await page.getByRole("slider", { name: "Sales in year 10" }).fill("60");
  await page.getByRole("slider", { name: "Operating margin once mature" }).fill("12.5");
  await expect(headline).toHaveText("This story is worth $84 a share");
  const tasks = page.locator('[data-testid="guided-tasks"] li');
  await expect(tasks.nth(1)).toContainText("Find a story worth the $84 price");
  await expect(tasks.nth(1)).toHaveAttribute("data-state", "done");
  await closeSheet(page);
  // The Insight settled by a tap (#88): a wrong tap shows its fix and hint 1; the right one finds it, marked by code.
  const pick = page.getByTestId("insight-pick");
  await expect(pick).toContainText("Find a story worth the price");
  await pick.getByTestId("insight-pick-choice").filter({ hasText: "Only a lower cost of capital" }).click();
  await expect(page.getByTestId("insight-pick-result")).toHaveAttribute("data-released", "hint_1", { timeout: TURN_MS });
  await expect(page.getByTestId("insight-pick-result")).toContainText("A lower cost of capital alone");
  await pick.getByTestId("insight-pick-choice").filter({ hasText: "Far more sales, and more kept of each sale" }).click();
  await expect(page.getByTestId("insight-pick-result")).toHaveAttribute("data-released", "found");
  await expect(page.getByTestId("insight-pick-result")).toContainText("a cheaper cost of capital alone could not get there");
  await record(page, "[tapped Insight choices] Only a lower cost of capital, then Far more sales, and more kept of each sale", "insight-pick (code)");
  await snap("explore");

  // Your turn: the Quick tries, tapped right until every Skill of the Check is fluent; then code moves on to the Check
  // and the page starts the Tutor's follow-up, which points to the quiz.
  await next(page, "Next: Your turn", "spine1-your-turn");
  await expect(currentStep(page)).toHaveText(/^Your turn — /, { timeout: TURN_MS });
  await script(page, "spine1-quiz-open");
  let tries = 0;
  while (tries < 12) {
    await expect(page.getByTestId("quick-try").last()).toBeVisible({ timeout: TURN_MS });
    if (!(await answerOpenTry(page))) break;
    tries++;
    await settled(page, TURN_MS);
    if (/^Wrap up — /.test(await currentStep(page).innerText())) break;
  }
  expect(tries, "Quick tries answered").toBeGreaterThanOrEqual(4);
  await replyLanded(page);
  await landedAsWritten(page, "spine1-quiz-open");

  // The quiz Check, in the Check tab: four of its six questions, three right to pass.
  await expect(currentStep(page)).toHaveText(/^Wrap up — /, { timeout: TURN_MS });
  const quiz = page.getByTestId("quiz");
  await openSheet(page, "check");
  await expect(quiz).toBeVisible({ timeout: TURN_MS });
  await passQuiz(quiz);
  await expect(page.getByTestId("quiz-result")).toContainText("Passed.");
  await closeSheet(page);

  // The judging Check (worth-talk, the id it had as a conversation Check): its concept and Your turn are taught by Next,
  // then its questions open in the Check tab, other people's stories judged by tap: no own story, nothing typed.
  await next(page, "Next: Concept", "spine1-talk-concept");
  await next(page, "Next: Your turn", "spine1-talk-your-turn");
  await next(page, "Next: Check", "spine1-talk-prompt");
  await expect(currentStep(page)).toHaveText(/^Wrap up — /);
  const judging = page.getByTestId("quiz");
  await openSheet(page, "check");
  await expect(judging).toBeVisible({ timeout: TURN_MS });
  // Each judged Story names who tells it, with its line Icon (critics round 4).
  await expect(judging.getByTestId("quiz-speaker").first()).toBeVisible();
  await expect(judging.getByTestId("quiz-speaker")).toHaveCount(4);
  await snap("judging-check");
  await record(page, "[the judging Check open in the Check tab]", "spine1-talk-prompt");
  await passQuiz(judging);
  await expect(page.getByTestId("quiz-result").last()).toContainText("Passed.");
  await closeSheet(page);

  // Reveal and Principle, then Complete this Topic.
  const chip = page.getByTestId("next-chip").last();
  await expect(chip).toBeVisible({ timeout: TURN_MS });
  const revealTaught = (await chip.innerText()).startsWith("Next: Reveal");
  if (revealTaught) await next(page, "Next: Reveal", "spine1-reveal");
  await next(page, "Next: Principle", "spine1-principle");
  // Spec #68: code shows the Topic's daily-life line at its Principle step, and the Topic complete card repeats it.
  await expect(page.getByTestId("daily-life-line")).toContainText(DAILY_LIFE);
  await next(page, "Complete this Topic", "spine1-complete");
  await expect(page.getByTestId("topic-complete-card")).toBeVisible({ timeout: TURN_MS });
  await expect(page.getByTestId("topic-complete-card").getByTestId("topic-daily-life")).toContainText(DAILY_LIFE);
  await snap("complete");
  if (critics) writeTranscript();

  const played = Date.now() - started;
  console.log(`[Part C] Spine Topic 1 played whole in ${(played / 1000).toFixed(1)} s (${tries} Quick tries${revealTaught ? ", Reveal taught by its own Next" : ""}).`);
  expect(played).toBeLessThan(LIMIT_MS);

  // The Course Map shows the Topic passed.
  await page.goto("/course");
  await expect(page.locator('li[data-topic="spine-01-worth"]')).toHaveAttribute("data-status", "passed");
}

test("[spec #68] Pressing Go deeper in Spine Topic 1 shows its Go deeper text", async ({ page }, info) => {
  test.skip(info.project.name !== "w1280", "one width is enough: the press is the behaviour");
  test.setTimeout(4 * TURN_MS);
  await seedSpineOne(page);
  await script(page, "spine1-story");
  await page.goto("/study");
  await replyLanded(page);
  await next(page, "Next: Concept", "spine1-concept");
  // The Go deeper Choice posts "Go deeper."; the Tutor answers with the Topic's Go deeper material.
  await script(page, "spine1-go-deeper");
  const before = await page.getByTestId("assistant-message").count();
  await page.getByTestId("choices").last().getByTestId("choice").filter({ hasText: /^Go deeper$/ }).click();
  await expect(page.getByTestId("assistant-message")).toHaveCount(before + 1, { timeout: TURN_MS });
  await settled(page, TURN_MS);
  await landedAsWritten(page, "spine1-go-deeper");
  await expect(page.getByTestId("assistant-message").last()).toContainText("code shrinks every future year's cash by the cost of capital");
});
