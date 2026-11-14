import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { parseComputedInstanceId } from "@/course/quiz";
import { spineData, spineMap } from "@/course/spine-fixture";
import { OWNER_LEARNER_ID, reviewCards, reviewLog } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { ensureTopicStarted, saveFinishedStep } from "./memory";
import { openQuiz, submitQuiz } from "./quiz";
import { answerReview, reviewState } from "./review";

// Computed judgement questions in a quiz Check and in spaced review (spec 2026-11-12, D2, D5): a Check shows the Topic
// file's own set and marks it from the Case; once passed, each question becomes a Review card whose Reviews draw their
// shown changes from the file's pool with a seed, so a Review does not repeat the Check's four choices.

const day = 86_400_000;
// The Spine fixture with its explore step and Quick tries taken out, so the test walks straight to the Check.
const map = spineMap(
  spineData((d) => {
    delete (d as { insight?: unknown }).insight;
    delete (d as { explore?: unknown }).explore;
    d.checks[0].quickTries = [];
  }),
);

async function passedCheck(passAt: Date) {
  const db = await testDb();
  await ensureTopicStarted(db, map, passAt, OWNER_LEARNER_ID);
  for (const step of ["story", "concept", "your_turn"] as const) await saveFinishedStep(db, map, step, passAt, OWNER_LEARNER_ID);
  const quiz = (await openQuiz(db, map, passAt, OWNER_LEARNER_ID))!;
  return { db, quiz };
}

describe("a quiz Check with computed questions", () => {
  it("shows the file's own set, and marks the taps code worked out from the Case", async () => {
    const passAt = new Date("2026-03-01T10:00:00Z");
    const { db, quiz } = await passedCheck(passAt);
    expect(quiz.questions.map((q) => q.id)).toEqual(["worth-q-lever", "worth-q-price", "worth-q-predict", "worth-q-direction"]);
    expect(quiz.questions[0].choices.map((c) => c.id).sort()).toEqual(["margin", "reinvest", "revenue", "risk"]);
    const result = await submitQuiz(db, map, quiz.attemptId, { "worth-q-lever": "risk", "worth-q-price": "bigger-richer", "worth-q-predict": "fifth", "worth-q-direction": "size-up" }, passAt, OWNER_LEARNER_ID);
    if (!result.ok) throw new Error(result.reason);
    // The predict tap is never wrong; the cost-of-capital tap is, with a fix quoting both figures.
    expect(result).toMatchObject({ correctCount: 3, passed: true });
    const lever = result.questions.find((q) => q.id === "worth-q-lever")!;
    expect(lever.mistake?.fix).toBe("Cost of capital 12.84% to 11.84% gives $38.34, about $3 a share more. Margin 10% to 12% gives $48.51, about $13 more.");
    expect(result.questions.find((q) => q.id === "worth-q-predict")!.predict).toEqual({ said: "About a fifth", landed: "Nothing left", figure: "$0" });
  });
});

describe("a computed question in spaced review (D5)", () => {
  it("enrols under its own id and reviews a fresh set drawn with a seed, marked against what it showed", async () => {
    const passAt = new Date("2026-03-01T10:00:00Z");
    const { db, quiz } = await passedCheck(passAt);
    await submitQuiz(db, map, quiz.attemptId, { "worth-q-lever": "margin", "worth-q-price": "bigger-richer", "worth-q-predict": "none", "worth-q-direction": "size-up" }, passAt, OWNER_LEARNER_ID);
    const later = new Date(passAt.getTime() + 90 * day);
    const first = await reviewState(db, map, later, OWNER_LEARNER_ID);
    expect((await db.select().from(reviewCards)).map((c) => c.questionId).sort()).toEqual(["worth-q-direction", "worth-q-lever", "worth-q-predict", "worth-q-price"]);

    // The written question comes first (ties go by id); answer it to reach the which-lever question.
    expect(first.question?.id).toBe("worth-q-direction");
    await answerReview(db, map, "worth-q-direction", "size-up", later, OWNER_LEARNER_ID);
    const review = (await reviewState(db, map, later, OWNER_LEARNER_ID)).question!;
    expect(parseComputedInstanceId(review.id)).toEqual({ questionId: "worth-q-lever", seed: `${OWNER_LEARNER_ID}.r1` });
    const shown = review.choices.map((c) => c.id);
    expect(shown).toHaveLength(4);
    expect([...shown].sort()).not.toEqual(["margin", "reinvest", "revenue", "risk"]);
    // No figure ("$48.51") reaches the browser before the tap.
    expect(JSON.stringify(review)).not.toMatch(/\$\d+\.\d\d/);

    const wrong = shown.find((id) => id !== "margin" && id !== "leaner")!;
    const marked = await answerReview(db, map, review.id, wrong, later, OWNER_LEARNER_ID);
    if (!marked.ok) throw new Error(marked.reason);
    expect(marked.correct).toBe(false);
    expect(marked.mistake?.fix).toMatch(/gives \$\d+\.\d\d, about \$\d+ a share more\. .* gives \$\d+\.\d\d, about \$\d+ more\./);
    expect(marked.choices.every((c) => c.figure?.startsWith("$"))).toBe(true);
    // The card and the log are the question's own, not the seeded instance's.
    const [card] = await db.select().from(reviewCards).where(eq(reviewCards.questionId, "worth-q-lever"));
    expect(card.lapses).toBe(1);
    expect((await db.select().from(reviewLog)).some((l) => l.questionId.includes("@"))).toBe(false);
  });
});
