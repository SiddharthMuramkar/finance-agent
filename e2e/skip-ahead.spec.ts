import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { parse } from "yaml";
import { hydrated, replyLanded, seed } from "./support/app";

/**
 * Skip ahead (spec 2026-11-12 A8, its "Done when"): a Learner who presses "I know this: quiz me" on the Topic Start card
 * and misses at most one question sees the Topic marked passed on the Course Map. Present value has no Skills, so its
 * quiz draws from its quiz Check's written questions; the right answers are read from its Topic file here.
 */

type Written = { prompt: string; choices: { id: string; text: string }[]; answer: string };
const plain = (text: string) => text.replace(/\s+/g, " ").trim();
const file = parse(readFileSync("course/topics/present-value.yaml", "utf8")) as { questions: Written[] };
const rightFor = new Map(file.questions.map((q) => [plain(q.prompt), q.choices.find((c) => c.id === q.answer)!.text]));
const wrongFor = new Map(file.questions.map((q) => [plain(q.prompt), q.choices.find((c) => c.id !== q.answer)!.text]));

/** The answer to the next POST /api/skip-ahead, which opens the quiz and then marks it. */
const quizAnswer = (page: Page) => page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/skip-ahead");

test("I know this: quiz me, one miss, and the Topic is passed on the Course Map", async ({ page }) => {
  test.setTimeout(180_000); // the dev server compiles /study and /course on first visit
  await seed(page, "fresh");
  const chose = await page.request.post("/api/jump", { data: { topicId: "present-value" } });
  expect(chose.status()).toBe(200);
  await page.goto("/study");
  await hydrated(page);
  await replyLanded(page);

  const start = page.getByTestId("topic-start");
  // The quiz is drawn from POST /api/skip-ahead's answer, so wait for that answer, not for a fixed few seconds: the first
  // call on a test server compiles the route first (4.9 s on CI, main run 43571023872, past the 5 s an expect waits).
  const opened = quizAnswer(page);
  await start.getByRole("button", { name: "I know this: quiz me" }).click();
  expect((await opened).status(), "POST /api/skip-ahead (open)").toBe(200);
  const quiz = start.getByTestId("skip-ahead-quiz");
  await expect(quiz).toBeVisible();
  const questions = quiz.locator("fieldset");
  const count = await questions.count();
  expect(count).toBeGreaterThanOrEqual(4);
  expect(count).toBeLessThanOrEqual(8);
  for (let i = 0; i < count; i++) {
    const question = questions.nth(i);
    const prompt = plain(await question.locator("legend span").nth(1).innerText());
    const pick = (i === 0 ? wrongFor : rightFor).get(prompt);
    expect(pick, prompt).toBeTruthy();
    await question.getByText(pick!, { exact: true }).click();
  }
  const marked = quizAnswer(page);
  await quiz.getByRole("button", { name: "Submit answers" }).click();
  expect((await marked).status(), "POST /api/skip-ahead (answers)").toBe(200);
  await expect(start.getByTestId("skip-ahead-result")).toContainText(`${count - 1} of ${count} right. Topic passed.`);

  await page.goto("/course");
  await expect(page.locator('li[data-topic="present-value"]')).toHaveAttribute("data-status", "passed");
});
