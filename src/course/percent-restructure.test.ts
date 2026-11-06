import { describe, expect, it } from "vitest";
import { checkResults, learnerState, OWNER_LEARNER_ID, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { checkTabNow } from "@/learner/quiz";
import { testDb } from "@/test/pglite";
import { isConverted, loadCourseMap, testedSkills, type FixedQuickTry } from "./map";
import { sumAsk } from "@/teaching/no-sums";
import { cardForFacts, nextQuickTry } from "@/tutor/practice";
import { courseOverview, finishStep, navigate, practiceStep, type Progress, type TeachingStep } from "./navigator";

// Percent's conversion is a content-only restructure (spec #229, "Restructured Topics"): the old Checks keep their ids,
// a new quiz Check 2 sits between them, no Check is required, and every Learner keeps their saved step. These tests
// read a Learner's saved place before the conversion through the Course Navigator, on the real Course Map.

const map = loadCourseMap();
const PERCENT = "num-percent-bps";
const percent = map.topic(PERCENT)!;
const learnerId = OWNER_LEARNER_ID;

/** A Learner saved inside Percent before it was converted: at `step`, with these old Checks passed. */
const inPercent = (step: TeachingStep, passed: string[], status: "in_progress" | "passed" = "in_progress"): Progress => ({
  currentTopicId: status === "passed" ? null : PERCENT,
  topics: { [PERCENT]: { step, passedChecks: passed, revealShown: step === "reveal" || step === "principle", status } },
});

/** The same saved place, written to the database as the app saved it. */
async function saved(db: Db, progress: Progress) {
  const record = progress.topics[PERCENT];
  await db.insert(learnerState).values({ id: learnerId, learnerId, currentTopicId: progress.currentTopicId });
  await db.insert(topicProgress).values({ learnerId, topicId: PERCENT, step: record.step, status: record.status, revealShown: record.revealShown });
  for (const checkId of record.passedChecks) await db.insert(checkResults).values({ learnerId, topicId: PERCENT, checkId, passed: true });
}

describe("Percent's content-only restructure", () => {
  it("keeps the old Check ids, adds Checks 2 and 3 between them, and requires none", () => {
    expect(isConverted(percent)).toBe(true);
    expect(percent.restructure).toBe("content-only");
    expect(percent.checks.map((c) => [c.id, c.kind])).toEqual([
      ["pb-quiz-language", "quiz"],
      ["pb-quiz-change", "quiz"],
      ["pb-quiz-wording", "quiz"],
      ["pb-fed-language", "conversation"],
    ]);
    expect(percent.checks.some((c) => c.required)).toBe(false);
  });

  it("leaves a Learner who passed Percent passed, with no Due Check, and does not pull them back", () => {
    const progress = inPercent("principle", ["pb-quiz-language", "pb-fed-language"], "passed");
    const place = navigate(map, progress)!;
    expect(place.topic.id).not.toBe(PERCENT);
    expect(place.dueChecks).toEqual([]);
    expect(courseOverview(map, progress).find((t) => t.id === PERCENT)).toMatchObject({ status: "passed" });
  });

  it("takes a Learner who passed Check 1 and stood at the old Check 2's concept to the new Check 2's concept and card", () => {
    const place = navigate(map, inPercent("concept", ["pb-quiz-language"]))!;
    expect(place).toMatchObject({ step: "concept", check: { id: "pb-quiz-change" } });
    expect(place.check!.card!.title).toBe("Compared with the start");
  });

  it("keeps a Learner at Check 1's Your turn there, with Quick tries to practise", () => {
    const place = navigate(map, inPercent("your_turn", []))!;
    expect(place).toMatchObject({ step: "your_turn", check: { id: "pb-quiz-language" } });
    expect(place.check!.quickTries.length).toBeGreaterThanOrEqual(3);
  });

  it("tests points at Check 1, so Your turn opens on points with its half-done try and every pts Quick try can be shown", () => {
    const check = percent.checks[0];
    expect(testedSkills(percent, check)).toContain("pts");
    expect(nextQuickTry(percent, check, {}, [])).toMatchObject({ skillId: "pts", key: expect.stringMatching(/:pb-try-a1$/) });
  });

  // Run 16 (critics MP-3, BP-3): "A reporter sees a rate go from 3% to 3.5%. What gap would the story report?" needed
  // 3.5 minus 3 to tell its choices apart. The gap is now a story fact, and the choices differ by the word: points, percent, level.
  it("opens Your turn on a Quick try the words tell apart: a person, a date and the stakes, no figure to work out, a short fix on each slip", () => {
    const a1 = percent.checks[0].quickTries.find((q) => "id" in q && q.id === "pb-try-a1") as FixedQuickTry;
    expect(a1.ask).toContain("3 February 1994");
    expect(a1.ask).toMatch(/\breporter\b/);
    expect(a1.ask).toMatch(/loans cost more/);
    expect(a1.ask).toContain("a gap of half a point");
    expect(sumAsk(a1.ask)).toBeNull();
    expect(a1.halfDone).toBeDefined();
    expect(a1.halfDone).not.toMatch(/\d/);
    expect(a1.choices!.map((c) => c.text)).toEqual(["Rates rose half a percentage point", "Rates rose half a percent", "Rates rose 3.5 percentage points"]);
    for (const c of a1.choices!.filter((c) => c.id !== a1.answer)) {
      expect(c.mistake?.tag).toBeTruthy();
      expect(c.mistake!.fix.split(/\s+/).length).toBeLessThanOrEqual(20);
    }
  });

  // Round 7 (critics MP-R6-2/3/5): pb-try-pts-2, pb-try-pts-3 and pb-q-wrong-description had choices told apart only by
  // a number ("0.4 points", "40 points", "9.4 points"), with the move left for the Learner to work out (9.4 minus 9, 6.5
  // minus 5.9, 8.50 minus 8.00 then times 100). Where two choices differ only by a number, the stem says the move itself.
  describe("choices told apart by words, never by a number the Learner works out", () => {
    const numberless = (text: string) => text.toLowerCase().replace(/\d+(?:[.,]\d+)?/g, "#").trim();
    /** The stem says the move in points or basis points ("a rise of 0.4 of a point", "a gap of half a point", "120 bp"). */
    const STATES_MOVE = /\b\d+(?:\.\d+)?\s*(?:of a )?(?:percentage points?|points?|bp|basis points)\b|\bhalf a (?:percentage )?point\b/i;
    const items = [
      ...percent.checks.flatMap((c) =>
        c.quickTries.filter((q): q is FixedQuickTry => "id" in q).map((q) => ({ id: q.id, stem: `${q.ask} ${q.halfDone ?? ""}`, choices: q.choices ?? [] })),
      ),
      ...percent.questions.map((q) => ({ id: q.id, stem: q.prompt, choices: q.choices })),
    ];
    const toldApartByANumber = (choices: { text: string }[]) =>
      choices.some((a, i) => choices.some((b, j) => i !== j && a.text !== b.text && numberless(a.text) === numberless(b.text)));

    it("states the move as a fact in every Quick try and Check question whose choices differ only by a number", () => {
      expect(items.filter((i) => toldApartByANumber(i.choices) && !STATES_MOVE.test(i.stem)).map((i) => i.id)).toEqual([]);
    });

    it.each([
      ["pb-try-pts-2", /\bsavers\b/],
      ["pb-try-pts-3", /\bhome loans\b/],
      ["pb-q-wrong-description", /\bloans\b/],
    ])("%s tells the move as a story fact (a person, a date, the stakes), with choices told apart by the word and a short fix on each slip", (id, stakes) => {
      const item = items.find((i) => i.id === id)!;
      expect(item.stem).toContain("3 February 1994");
      expect(item.stem).toMatch(/\b(?:reporter|radio host|editor|trader)\b/);
      expect(item.stem).toMatch(stakes);
      expect(item.stem).toMatch(STATES_MOVE);
      expect(sumAsk(item.stem)).toBeNull();
      expect(new Set(item.choices.map((c) => numberless(c.text).replace(/#/g, "").replace(/\s+/g, " "))).size).toBe(item.choices.length);
      const wrong = item.choices.filter((c) => c.mistake);
      expect(wrong).toHaveLength(item.choices.length - 1);
      for (const c of wrong) {
        expect(c.mistake!.tag).toBeTruthy();
        expect(c.mistake!.fix.split(/\s+/).length).toBeLessThanOrEqual(20);
      }
    });
  });

  it("keeps a Learner at the reveal with both old Checks passed at the reveal, though the new Check 2 is not passed", () => {
    const place = navigate(map, inPercent("reveal", ["pb-quiz-language", "pb-fed-language"]))!;
    expect(place).toMatchObject({ step: "reveal", check: null, next: "principle" });
  });

  it("keeps a Learner at the old Check 2's check step (the Fed conversation) at the check step, which is now Check 2's quiz", async () => {
    const progress = inPercent("check", ["pb-quiz-language"]);
    expect(navigate(map, progress)).toMatchObject({ step: "check", check: { id: "pb-quiz-change", kind: "quiz" } });
    const db = await testDb();
    await saved(db, progress);
    expect(await loadProgress(db, learnerId)).toEqual(progress);
    const tab = await checkTabNow(db, map, new Date(), learnerId);
    expect(tab.quiz).toMatchObject({ checkId: "pb-quiz-change", checkNumber: 2, checkCount: 4 });
    // The Tutor's context at that quiz carries Check 2's card, so it can teach the card while the quiz is open.
    expect(cardForFacts(navigate(map, progress))).toContain("Compared with the start");
  });

  it("gives each of Checks 2 and 3 one idea: percent change alone, then how a move is worded", () => {
    const [, change, wording] = percent.checks;
    expect(change.card!.skills).toEqual(["pct-change"]);
    expect(wording.card!.skills).toEqual(["wording"]);
    expect(testedSkills(percent, change)).toEqual(["pct-change"]);
    expect(testedSkills(percent, wording)).toEqual(["wording"]);
    expect(wording.quickTries.length).toBeGreaterThanOrEqual(3);
  });

  it("sends a Learner who passed Checks 1 and 2 to the wording Check before the conversation Check", () => {
    const place = navigate(map, inPercent("concept", ["pb-quiz-language", "pb-quiz-change"]))!;
    expect(place).toMatchObject({ step: "concept", check: { id: "pb-quiz-wording" } });
  });

  it("lets the Tutor finish Your turn at the conversation Check, which has no Quick tries to practise", () => {
    const progress = inPercent("your_turn", ["pb-quiz-language", "pb-quiz-change", "pb-quiz-wording"]);
    const place = navigate(map, progress)!;
    expect(place).toMatchObject({ step: "your_turn", check: { id: "pb-fed-language" } });
    expect(practiceStep(place.topic, place.step, place.check)).toBe(false);
    expect(finishStep(map, progress, "your_turn")).toMatchObject({ ok: true });
  });
});
