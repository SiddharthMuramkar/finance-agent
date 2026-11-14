import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_SCRIPTS, SPINE_ONE_SAYS } from "../src/dev/e2e-tutor";
import { quietDevtools, replyLanded, say, script, settled, signIn, type Script } from "./support/app";

/**
 * Spine Topic 1 on the Test bed (spec 2026-11-12 Part C, "Done when"): a browser test completes Spine Topic 1 ("What is
 * a business worth?", Damodaran's Amazon of February 2000) in under 15 minutes of scripted play. A fresh tools Learner
 * starts at the Topic's Story (fixture `spine-01-start`); every step after is taken in the page, as a Learner takes it:
 * the Next chip, the Value levers Workbench, typed words, the Quick tries, the quiz Check and the conversation Check.
 * The scripted Tutor (src/dev/e2e-tutor.ts, the `spine1-*` scripts) plays each Tutor Turn, and its tool calls are the
 * ones the real Tutor makes: show_widget opens the explore Workbench, record_insight_attempt records the Insight in the
 * Learner's typed words, and record_check_verdict passes the conversation Check.
 */

const LIMIT_MS = 15 * 60 * 1000;
/** Each Tutor Turn's wait: the dev server compiles a route the first time it is asked for. */
const TURN_MS = 60_000;

const plain = (text: string) => text.replace(/\s+/g, " ").trim();

/** The quiz Check's right choice for each of its six questions, found by the question's words (predict: the band it lands in). */
function quizPick(prompt: string): string | null {
  if (/which change lifts the value most/i.test(prompt)) return "Margin 10% to 12%";
  if (/Which story gets there/i.test(prompt)) return "$60bn of sales and a 12.5% margin";
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
  const response = await page.request.post("/api/dev-e2e", { data: { state: "spine-01-start" } });
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
  await chip.click();
  await expect(page.getByTestId("assistant-message")).toHaveCount(before + 1, { timeout: TURN_MS });
  await settled(page, TURN_MS);
  await landedAsWritten(page, name);
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
  await choices.filter({ hasText: new RegExp(`^${escape(tryPick(prompt))}$`) }).click();
  const result = page.getByTestId("quick-try-result").nth(answered);
  await expect(result, prompt).toHaveAttribute("data-verdict", "right");
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
    const prompt = plain(await question.locator("legend span").nth(1).innerText());
    const pick = quizPick(prompt);
    if (pick) await question.getByText(pick, { exact: true }).click();
    else await question.getByRole("radio").first().check();
  }
  await quiz.getByRole("button", { name: "Submit answers" }).click();
}

test("[Part C] Spine Topic 1 is played whole on the Test bed, and passed, in under 15 minutes", async ({ page }, info) => {
  test.skip(info.project.name !== "w1280", "one width is enough: the play is the behaviour");
  test.setTimeout(LIMIT_MS + 120_000);
  const started = Date.now();

  // Story: the page starts the Topic's opener on its empty Session.
  await seedSpineOne(page);
  await script(page, "spine1-story");
  await page.goto("/study");
  await replyLanded(page);
  await expect(page.getByTestId("topic-bar")).toContainText("What is a business worth?");
  await expect(currentStep(page)).toHaveText(/^Story — Step 1 of \d+$/);
  await landedAsWritten(page, "spine1-story");

  // Concept: code shows the quiz Check's Concept card; the Tutor names the four levers.
  await next(page, "Next: Concept", "spine1-concept");
  await expect(page.getByText("A price is paid; a value is argued").first()).toBeVisible();

  // Explore: the Tutor opens the Value levers Workbench; the Learner finds a story worth the $84 price.
  await next(page, "Next: Explore", "spine1-explore");
  await expect(currentStep(page)).toHaveText(/^Explore — /);
  const headline = page.getByTestId("value-levers-headline");
  await expect(headline).toHaveText("Your story is worth $35 a share", { timeout: TURN_MS });
  // One Value levers tab: code opens the Workbench as "Explore"; the Tutor's show_widget of the same recipe and Case is
  // pointed at it instead of adding "Amazon, February 2000: your story" beside it.
  await landedAsWritten(page, "spine1-explore");
  await expect(page.getByTestId("widget-chip").filter({ hasText: "your story" })).toHaveCount(0);
  await expect(headline).toHaveCount(1);
  await page.getByRole("slider", { name: "Revenue in year 10" }).fill("60");
  await page.getByRole("slider", { name: "Operating margin once mature" }).fill("12.5");
  await expect(headline).toHaveText("Your story is worth $84 a share");
  const tasks = page.locator('[data-testid="guided-tasks"] li');
  await expect(tasks.nth(1)).toContainText("Find a story worth the $84 price");
  await expect(tasks.nth(1)).toHaveAttribute("data-state", "done");
  // The Insight in the Learner's own typed words: the Tutor records it as found (record_insight_attempt).
  await say(page, "spine1-insight", SPINE_ONE_SAYS.insight, TURN_MS);
  await landedAsWritten(page, "spine1-insight");

  // Your turn: the Quick tries, tapped right until every Skill of the Check is fluent; then code moves on to the Check
  // and the page starts the Tutor's follow-up, which points to the quiz.
  await next(page, "Next: Your turn", "spine1-your-turn");
  await expect(currentStep(page)).toHaveText(/^Your turn — /);
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
  await expect(quiz).toBeVisible({ timeout: TURN_MS });
  await passQuiz(quiz);
  await expect(page.getByTestId("quiz-result")).toContainText("Passed.");

  // The conversation Check: its concept and Your turn are taught by Next, then its prompt, then the Learner's story,
  // which the Tutor passes with record_check_verdict.
  await next(page, "Next: Concept", "spine1-talk-concept");
  await next(page, "Next: Your turn", "spine1-talk-your-turn");
  await next(page, "Next: Check", "spine1-talk-prompt");
  await expect(currentStep(page)).toHaveText(/^Wrap up — /);
  await say(page, "spine1-talk-pass", SPINE_ONE_SAYS.talk, TURN_MS);
  await landedAsWritten(page, "spine1-talk-pass");

  // Reveal and Principle, then Complete this Topic.
  const chip = page.getByTestId("next-chip").last();
  await expect(chip).toBeVisible({ timeout: TURN_MS });
  const revealTaught = (await chip.innerText()).startsWith("Next: Reveal");
  if (revealTaught) await next(page, "Next: Reveal", "spine1-reveal");
  await next(page, "Next: Principle", "spine1-principle");
  await next(page, "Complete this Topic", "spine1-complete");
  await expect(page.getByTestId("topic-complete-card")).toBeVisible({ timeout: TURN_MS });

  const played = Date.now() - started;
  console.log(`[Part C] Spine Topic 1 played whole in ${(played / 1000).toFixed(1)} s (${tries} Quick tries${revealTaught ? ", Reveal taught by its own Next" : ""}).`);
  expect(played).toBeLessThan(LIMIT_MS);

  // The Course Map shows the Topic passed.
  await page.goto("/course");
  await expect(page.locator('li[data-topic="spine-01-worth"]')).toHaveAttribute("data-status", "passed");
});
