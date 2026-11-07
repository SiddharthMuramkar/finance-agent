import { describe, expect, it } from "vitest";
import { checkResults, learnerState, OWNER_LEARNER_ID, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { fixLineFor } from "@/learner/known-mistakes";
import { loadProgress } from "@/learner/memory";
import { checkTabNow } from "@/learner/quiz";
import { recordAnswer } from "@/learner/skill-state";
import { testDb } from "@/test/pglite";
import { isConverted, loadCourseMap, testedSkills, type FixedQuickTry } from "./map";
import { sumAsk } from "@/teaching/no-sums";
import { choiceSet, drawTemplate } from "@/teaching";
import { indirectSumAsk } from "@/behaviour/tutor-eval/grading";
import { cardForFacts, ladderFacts, nextQuickTry } from "@/tutor/practice";
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
    // Round 9 (critic C1): the gap is said in basis points, so the right choice (in points) is no echo of the stem.
    expect(a1.ask).toContain("a rise traders call 50 basis points");
    expect(sumAsk(a1.ask)).toBeNull();
    expect(a1.halfDone).toBeDefined();
    expect(a1.halfDone).not.toMatch(/\d/);
    expect(a1.choices!.map((c) => c.text)).toEqual(["Rates rose half a percentage point", "Rates rose half a percent", "Rates rose 50 percent"]);
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
    ])("%s tells the move as a story fact (a person and the stakes, undated since round 11's H3/H4), with choices told apart by the word and a short fix on each slip", (id, stakes) => {
      const item = items.find((i) => i.id === id)!;
      expect(item.stem).not.toMatch(/\b(?:19|20)\d\d\b|\bNew York\b/);
      expect(item.stem).toMatch(/\b(?:reporter|radio host|editor|trader)\b/);
      expect(item.stem).toMatch(stakes);
      expect(item.stem).toMatch(STATES_MOVE);
      expect(sumAsk(item.stem)).toBeNull();
      // Round 9: two wrong choices may share a word ("0.4 percent", "40 percent"); the right one shares its words with none.
      const words = (text: string) => numberless(text).replace(/#/g, "").replace(/\s+/g, " ");
      const rightWords = words(item.choices.find((c) => !c.mistake)!.text);
      for (const c of item.choices.filter((c) => c.mistake)) expect(words(c.text)).not.toBe(rightWords);
      const wrong = item.choices.filter((c) => c.mistake);
      expect(wrong).toHaveLength(item.choices.length - 1);
      for (const c of wrong) {
        expect(c.mistake!.tag).toBeTruthy();
        expect(c.mistake!.fix.split(/\s+/).length).toBeLessThanOrEqual(20);
      }
    });
  });

  // Round 9 (critic C1, issue #496): "a rise traders call 50 basis points" had the right choice "Rate up 50 basis points",
  // and "a gap of half a point" had "half a percentage point": a Learner passed by matching words. And pb-t-points-from-move,
  // pb-t-bp-from-move, pb-t-points-from-bp, pb-try-a2, pb-try-a4 and pb-try-word-3 needed b - a, or had choices that
  // differed only by the scale of a number (50 / 5 / 0.5 bp). One rule for every question, Quick try and template draw.
  describe("every question, Quick try and template draw is told apart by the idea, never by matching words or a sum (C1, #496)", () => {
    const WORD_VALUE: Record<string, number> = {
      half: 0.5, quarter: 0.25, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      "twenty-five": 25, fifty: 50, sixty: 60, "seventy-five": 75, hundred: 100,
    };
    const NUMBER = `(?:\\d+(?:[.,]\\d+)?|\\b(?:${Object.keys(WORD_VALUE).join("|")})\\b)`;
    /** A size: a number, maybe "a" or "of a", maybe "tenths of a", then a unit ("half a point", "0.4 of a percentage point", "60 bp", "6%"). */
    const SIZE = new RegExp(`(${NUMBER})(?:\\s+(?:of\\s+)?an?\\b)?\\s*(?:(tenths?|hundredths?)\\s+of\\s+an?\\s+)?(percentage points?|points?|basis points?|bps?\\b|percent\\b|%)`, "gi");
    const valueOf = (word: string) => WORD_VALUE[word.toLowerCase()] ?? Number(word.replace(",", "."));
    /** Each size a text names, one spelling per size: "half a point" = "0.5 percentage points" = "0.5 of a point"; "60 bp" = "60 basis points". */
    const sizesIn = (text: string) =>
      [...text.matchAll(SIZE)].map(([, n, part, unit]) => {
        const value = valueOf(n) * (part ? (part.startsWith("tenth") ? 0.1 : 0.01) : 1);
        const u = /^(?:basis|bp)/i.test(unit) ? "bp" : /point/i.test(unit) ? "point" : "percent";
        return `${Number(value.toFixed(6))} ${u}`;
      });
    /** A choice with its numbers taken out, so two choices that differ only by a number read the same. */
    const ideaOf = (text: string) =>
      text
        .toLowerCase()
        .replace(/%/g, " percent")
        .replace(/[-–]/g, " ")
        .replace(/\bbps?\b/g, "basis point")
        .replace(new RegExp(`${NUMBER}(?:\\s+(?:of\\s+)?an?\\b)?`, "gi"), "#")
        .replace(/\b(point|percent)s\b/g, "$1")
        .replace(/[^a-z#]+/g, " ")
        .trim();
    /** The stem says the move in points or basis points, in digits ("a rise of 0.4 of a point", "half a percentage point", "120 bp"). */
    const STATES_MOVE = /\b\d+(?:\.\d+)?\s*(?:of a )?(?:percentage points?|points?|bp|basis points)\b|\bhalf a (?:percentage )?point\b/i;
    /** Two rates, "from 3% to 3.5%" or "6% to 9%": the move would be b - a unless the stem says it. */
    const TWO_RATES = /\d+(?:\.\d+)?%\s+to\s+\d+(?:\.\d+)?%/;

    type Item = { id: string; stem: string; choices: { text: string; right: boolean; mistake?: { tag?: string; fix: string } }[] };
    const fixedTries = percent.checks.flatMap((c) => c.quickTries.filter((q): q is FixedQuickTry => "id" in q));
    const DRAWS = 40;
    const items: Item[] = [
      ...fixedTries.map((q) => {
        const set = choiceSet(q)!;
        return { id: q.id, stem: `${q.ask} ${q.halfDone ?? ""}`, choices: set.choices.map((c) => ({ text: c.text, right: c.id === set.answer, mistake: c.mistake })) };
      }),
      ...percent.questions.map((q) => ({ id: q.id, stem: q.prompt, choices: q.choices.map((c) => ({ text: c.text, right: c.id === q.answer, mistake: c.mistake })) })),
      ...percent.templates.flatMap((t) =>
        [false, ...(t.halfDone ? [true] : [])].flatMap((halfDone) =>
          Array.from({ length: DRAWS }, (_, i) => {
            const drawn = drawTemplate(t, `round9-${i}`, { halfDone });
            const set = choiceSet(drawn)!;
            return { id: `${drawn.id} (${drawn.prompt})`, stem: drawn.prompt, choices: set.choices.map((c) => ({ text: c.text, right: c.id === set.answer, mistake: c.mistake })) };
          }),
        ),
      ),
    ];
    const right = (i: Item) => i.choices.find((c) => c.right)!;
    const wrong = (i: Item) => i.choices.filter((c) => !c.right);

    it("reads sizes and ideas the way the rule means", () => {
      expect(sizesIn("a gap of half a point")).toEqual(["0.5 point"]);
      expect(sizesIn("Rates rose half a percentage point")).toEqual(["0.5 point"]);
      expect(sizesIn("a rise of 0.4 of a point")).toEqual(sizesIn("Savings rates rose 0.4 of a percentage point"));
      expect(sizesIn("a rise traders call 50 basis points")).toEqual(sizesIn("Rate up 50 bp"));
      expect(sizesIn("Six tenths of a percentage point")).toEqual(["0.6 point"]);
      expect(ideaOf("50 bp")).toBe(ideaOf("0.5 bp"));
      expect(ideaOf("Up 1.2 points")).toBe(ideaOf("Up 12 points"));
      expect(ideaOf("Rates rose half a percentage point")).toBe(ideaOf("Rates rose 3.5 percentage points"));
      expect(ideaOf("30 bp: the fall counted in hundredths of a point")).not.toBe(ideaOf("3 bp: the fall counted in tenths of a point"));
      expect(ideaOf("Up 50 basis points")).not.toBe(ideaOf("Up 50 percent"));
    });

    it("covers every fixed Quick try, every question and both kinds of draw of every template", () => {
      const draws = percent.templates.reduce((n, t) => n + (t.halfDone ? 2 : 1) * DRAWS, 0);
      expect(items.length).toBe(fixedTries.length + percent.questions.length + draws);
      for (const i of items) expect({ id: i.id, rightChoices: i.choices.filter((c) => c.right).length }).toEqual({ id: i.id, rightChoices: 1 });
    });

    it("never echoes the right choice's size in the stem: the Learner uses the idea, not the words", () => {
      const echoes = items.flatMap((i) => {
        const [size] = sizesIn(right(i).text);
        return size && sizesIn(i.stem).includes(size) ? [`${i.id}: "${right(i).text}" echoes the stem`] : [];
      });
      expect(echoes).toEqual([]);
    });

    it("tells the right choice from every wrong one by an idea word, never by the scale of a number alone", () => {
      const byNumber = items.flatMap((i) => wrong(i).filter((w) => ideaOf(w.text) === ideaOf(right(i).text)).map((w) => `${i.id}: "${w.text}" vs "${right(i).text}"`));
      expect(byNumber).toEqual([]);
    });

    it("asks for no sum: no sum ask, and a stem with two rates says the move itself whenever the choices or the claim name points or basis points", () => {
      for (const i of items) expect({ id: i.id, sum: sumAsk(i.stem) ?? indirectSumAsk(i.stem) }).toEqual({ id: i.id, sum: null });
      const needsGap = items.filter((i) => {
        const facts = i.stem.split(/True or false/i)[0];
        const claim = i.stem.slice(facts.length);
        const namesPoints = [claim, ...i.choices.map((c) => c.text)].some((t) => /\b(?:points?|bp|basis points?)\b/i.test(t));
        return TWO_RATES.test(facts) && namesPoints && !STATES_MOVE.test(facts);
      });
      expect(needsGap.map((i) => i.id)).toEqual([]);
    });

    it("keeps a Known mistake with a short fix (20 words or fewer) on every wrong choice", () => {
      for (const i of items)
        for (const w of wrong(i)) {
          expect({ id: i.id, choice: w.text, tag: !!w.mistake?.tag }).toEqual({ id: i.id, choice: w.text, tag: true });
          expect({ id: i.id, choice: w.text, short: w.mistake!.fix.split(/\s+/).length <= 20 }).toEqual({ id: i.id, choice: w.text, short: true });
        }
    });
  });

  // Round 10 (historian H1, H2): pb-q-wrong-description dated "3 February 1994, New York" a central bank's rate of 8% to
  // 8.5%, while the Case gives the Fed funds rate at 3% that day; pb-try-a4 dated a loan rate "up 120 basis points" to that
  // day with no source. A dated item uses only the Case's figures; otherwise it carries no date and no central bank or Fed,
  // so it reads as plainly hypothetical.
  // Round 11 (historian H3, H4, H5; tests F3): the rule held for those two items only, and pb-try-pts-2 (a New York
  // savings rate of 9% to 9.4%), pb-try-pts-3 (a loan rate of 6.5% to 5.9%) and pb-try-word-3 (a loan rate of 7% to 8%)
  // still put unsourced rates on 3 February 1994 in New York. It now holds for every question, Quick try, template draw and
  // conversation prompt, in every Learner-facing word (stem, half-done line, choices, fixes, explanation).
  describe("dated items use only sourced figures (H1-H5, F3)", () => {
    const stems = {
      "pb-q-wrong-description": percent.questions.find((q) => q.id === "pb-q-wrong-description")!.prompt,
      "pb-try-a4": (() => {
        const q = percent.checks[0].quickTries.find((t) => "id" in t && t.id === "pb-try-a4") as FixedQuickTry;
        return `${q.ask} ${q.halfDone ?? ""}`;
      })(),
    };
    const fedCase = percent.cases.find((c) => c.id === "fed-hike-1994")!;
    const MONTH = "January|February|March|April|May|June|July|August|September|October|November|December";
    /** A year, a month name (capitalised, so "may" the verb is not one) or a day and month. */
    const DATES = new RegExp(`\\b(?:19|20)\\d\\d\\b|\\b(?:\\d{1,2} )?(?:${MONTH})\\b`, "g");
    const DATE = new RegExp(DATES.source);
    /** The Case's figures for each of its dates. 3 February (its as-of date): the funds rate at 3%, from the story. 4 February: 3% to 3.25%, a move of 25 basis points (its Case Data). */
    const storyFigures = [...new Set(fedCase.story.replace(DATES, "").match(/\d+(?:\.\d+)?/g) ?? [])];
    const FIGURES_FOR: Record<string, string[]> = { "3 February 1994": storyFigures, "4 February 1994": ["3", "3.25", "25", "0.25"] };
    /** The Case's outcome, which no what-if may name. */
    const OUTCOME = "3.25";
    /**
     * The one figure a dated item may add: the target of a what-if on the Case's own rate from its level that day
     * ("If the Fed took its 3% rate to 3.5%"), with that move's size in points and basis points. The Case leaves the size
     * open as of its date, so this claims no history; a what-if never names the real outcome.
     */
    const WHAT_IF = /\bIf the Fed took its (\d+(?:\.\d+)?)% rate to (\d+(?:\.\d+)?)%/;
    const num = (n: number) => String(Number(n.toFixed(4)));

    type Dated = { id: string; text: string };
    const fixedTries = percent.checks.flatMap((c) => c.quickTries.filter((q): q is FixedQuickTry => "id" in q));
    const all: Dated[] = [
      ...fixedTries.map((q) => {
        const set = choiceSet(q)!;
        return { id: q.id, text: [q.ask, q.halfDone ?? "", ...set.choices.flatMap((c) => [c.text, c.mistake?.fix ?? ""])].join("\n") };
      }),
      ...percent.questions.map((q) => ({ id: q.id, text: [q.prompt, ...q.choices.flatMap((c) => [c.text, c.mistake?.fix ?? ""]), q.explanation].join("\n") })),
      ...percent.templates.flatMap((t) =>
        [false, ...(t.halfDone ? [true] : [])].flatMap((halfDone) =>
          Array.from({ length: 40 }, (_, i) => {
            const drawn = drawTemplate(t, `round11-${i}`, { halfDone });
            const set = choiceSet(drawn)!;
            return { id: `${drawn.id} (${drawn.prompt})`, text: [drawn.prompt, ...set.choices.flatMap((c) => [c.text, c.mistake?.fix ?? ""])].join("\n") };
          }),
        ),
      ),
      ...percent.checks.filter((c) => c.kind === "conversation").map((c) => ({ id: c.id, text: c.prompt })),
    ];
    /** What is wrong with one item's dates and figures, if anything. */
    const problems = ({ id, text }: Dated): string[] => {
      const dates = text.match(DATES) ?? [];
      if (dates.length === 0) return /\bFed\b|\bFederal Reserve\b|\bNew York\b/.test(text) ? [`${id}: no date, yet it names the Case's Fed or New York`] : [];
      const caseDates = Object.keys(FIGURES_FOR).filter((d) => text.includes(d));
      const rest = caseDates.reduce((t, d) => t.split(d).join(" "), text);
      const stray = rest.match(DATES);
      if (stray) return [`${id}: names ${stray.join(", ")}, a date the Case gives no figures for`];
      const allowed = new Set(caseDates.flatMap((d) => FIGURES_FOR[d]));
      const whatIf = rest.match(WHAT_IF);
      if (whatIf && allowed.has(whatIf[1]) && whatIf[2] !== OUTCOME) {
        const move = Math.abs(Number(whatIf[2]) - Number(whatIf[1]));
        for (const f of [whatIf[2], num(move), num(move * 100)]) allowed.add(f);
      }
      return [...new Set(rest.match(/\d+(?:\.\d+)?/g) ?? [])].filter((f) => !allowed.has(f)).map((f) => `${id}: ${f} is not the Case's figure for ${caseDates.join(" or ")}`);
    };

    it("reads the Case's figures and the what-if the way the rule means", () => {
      expect(storyFigures).toEqual(["3"]);
      expect(fedCase.reveal).toContain("3% to 3.25%, which markets read as 25 basis points");
      expect(problems({ id: "x", text: "3 February 1994, New York. If a bank took its savings rate from 9% to 9.4%, a rise traders call 40 basis points" })).toEqual([
        "x: 9 is not the Case's figure for 3 February 1994",
        "x: 9.4 is not the Case's figure for 3 February 1994",
        "x: 40 is not the Case's figure for 3 February 1994",
      ]);
      expect(problems({ id: "x", text: "3 February 1994, New York. If the Fed took its 3% rate to 3.5%, a rise traders call 50 basis points" })).toEqual([]);
      expect(problems({ id: "x", text: "3 February 1994. If the Fed took its 3% rate to 3.25%, a rise of 25 basis points" })).toHaveLength(2);
      expect(problems({ id: "x", text: "9 May 1994. The 10-year yield stood at 7.49%." })).toEqual(["x: names 9 May, 1994, a date the Case gives no figures for"]);
      expect(problems({ id: "x", text: "A loan rate goes from 7% to 8%. The Fed would call it 100 basis points." })).toHaveLength(1);
      expect(problems({ id: "x", text: "A central bank takes its rate from 2% to 2.5%. Rates may rise." })).toEqual([]);
    });

    it("covers every question, fixed Quick try, both kinds of draw of every template, and the conversation prompt", () => {
      const draws = percent.templates.reduce((n, t) => n + (t.halfDone ? 2 : 1) * 40, 0);
      expect(all.length).toBe(fixedTries.length + percent.questions.length + draws + 1);
    });

    it("gives every item no date, or only the Case's own figures for the date it names", () => {
      expect(all.flatMap(problems)).toEqual([]);
    });

    // H3-H5: undated, so plainly hypothetical (as pb-try-a4 is), each still a person, the stakes and the move as a story fact.
    it.each([
      ["pb-try-pts-2", /\breporter\b/, /\bsavers\b/],
      ["pb-try-pts-3", /\bradio host\b/, /\bhome loans\b/],
      ["pb-try-word-3", /\bborrowers\b/, /\bpay more\b/],
    ])("%s carries no date and no city, and keeps its person, its stakes and its one lingo step (H3-H5)", (id, who, stakes) => {
      const q = fixedTries.find((t) => t.id === id)!;
      expect(q.ask).not.toMatch(DATE);
      expect(q.ask).not.toMatch(/\bNew York\b|\bFed\b/);
      expect(q.ask).toMatch(who);
      expect(q.ask).toMatch(stakes);
      expect(sumAsk(q.ask)).toBeNull();
    });

    it.each(Object.entries(stems))("%s carries no date and no central bank (H1, H2)", (_id, stem) => {
      expect(stem).not.toMatch(DATE);
      expect(stem).not.toMatch(/\bcentral bank\b|\bFed\b|\bFederal Reserve\b|\bNew York\b/);
    });

    it("keeps pb-q-wrong-description's story: an editor, readers with loans, the move said in points, the answer in basis points", () => {
      const stem = stems["pb-q-wrong-description"];
      expect(stem).toMatch(/\beditor\b/);
      expect(stem).toMatch(/\bloans\b/);
      expect(stem).toContain("a rise of half a percentage point");
      const q = percent.questions.find((x) => x.id === "pb-q-wrong-description")!;
      expect(q.answer).toBe("c");
      expect(q.choices.find((c) => c.id === "c")!.text).toBe("Rate up 50 basis points");
    });
  });

  // Round 10 (critic MP-R9-lows): three mix-up fixes said "keeps the 50" when the stem has no 50, and tagged a number
  // already converted to basis points but called points as forgot_to_convert. Each is now a wrong_unit, said plainly.
  describe("mix-up fixes name the real slip (MP-R9-lows)", () => {
    const fixed = [
      { id: "pb-try-a2", choice: "c", stem: (percent.checks[0].quickTries.find((t) => "id" in t && t.id === "pb-try-a2") as FixedQuickTry).ask, choices: (percent.checks[0].quickTries.find((t) => "id" in t && t.id === "pb-try-a2") as FixedQuickTry).choices! },
      { id: "pb-q-wrong-description", choice: "b", stem: percent.questions.find((q) => q.id === "pb-q-wrong-description")!.prompt, choices: percent.questions.find((q) => q.id === "pb-q-wrong-description")!.choices },
      { id: "pb-q-mortgage-rate", choice: "c", stem: percent.questions.find((q) => q.id === "pb-q-mortgage-rate")!.prompt, choices: percent.questions.find((q) => q.id === "pb-q-mortgage-rate")!.choices },
    ];

    it.each(fixed.map((f) => [f.id, f] as const))("%s: a points label on a basis-point number is a wrong_unit, and its fix names only numbers the Learner has seen", (_id, f) => {
      const c = f.choices.find((x) => x.id === f.choice)!;
      expect(c.mistake?.tag).toBe("wrong_unit");
      const kept = c.mistake!.fix.match(/keeps the (\d+(?:\.\d+)?)/);
      if (kept) expect(f.stem).toContain(kept[1]);
      expect(c.mistake!.fix.split(/\s+/).length).toBeLessThanOrEqual(20);
    });

    it("no fix in the Topic says it keeps a number its stem does not show", () => {
      const all = [
        ...percent.checks.flatMap((c) => c.quickTries.filter((q): q is FixedQuickTry => "id" in q).map((q) => ({ id: q.id, stem: `${q.ask} ${q.halfDone ?? ""}`, choices: q.choices ?? [] }))),
        ...percent.questions.map((q) => ({ id: q.id, stem: q.prompt, choices: q.choices })),
      ];
      const bad = all.flatMap((i) =>
        i.choices.flatMap((c) => {
          const kept = c.mistake?.fix.match(/keeps the (\d+(?:\.\d+)?)/);
          return kept && !i.stem.includes(kept[1]) ? [`${i.id} ${c.id}: "${c.mistake!.fix}"`] : [];
        }),
      );
      expect(bad).toEqual([]);
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

  // Round 12 (premerge F1): Check 1's tries tagged "half a percent" for a gap in points `mixed_percent_points`, the tag
  // the percent-change template owns for the reverse slip, and the skill line took the first fix with that tag
  // (templates first): a Learner who picked "Rates rose half a percent" was told "That is the move in points. Divide it
  // by the old rate, then times 100." Check 1's percent mix-up has its own tag now, and the line reads the answered
  // item's own fix.
  describe("a Quick try's mix-up names its own slip in the Tutor's skill line (round 12, F1)", () => {
    const check1 = percent.checks[0];
    const tries = check1.quickTries.filter((q): q is FixedQuickTry => "id" in q);
    const picks = tries.flatMap((q) => (q.choices ?? []).filter((c) => c.mistake).map((c) => ({ q, c, mistake: c.mistake! })));

    it("tags Check 1's percent mix-ups percent_for_points, a tag no template uses, never the percent-change template's mixed_percent_points", () => {
      // The gap said as a share of the old rate ("half a percent" for half a point); "50 percent" for 50 bp stays bp_as_percent.
      const percentForPoints = [
        ["pb-try-a1", "Rates rose half a percent"],
        ["pb-try-a2", "Up 50 percent"],
        ["pb-try-a4", "1.2 percent"],
        ["pb-try-pts-2", "Savings rates rose 0.4 percent"],
        ["pb-try-pts-3", "Loan rates fell 0.6 percent"],
      ];
      for (const [id, text] of percentForPoints) expect({ id, text, tag: picks.find((p) => p.q.id === id && p.c.text === text)?.mistake.tag }).toEqual({ id, text, tag: "percent_for_points" });
      for (const { mistake } of picks) expect(mistake.tag).not.toBe("mixed_percent_points");
      expect(percent.templates.flatMap((t) => t.mistakes.map((m) => m.tag))).not.toContain("percent_for_points");
    });

    it.each(picks.map((p) => [`${p.q.id} "${p.c.text}"`, p] as const))("the skill line after %s names that pick's own fix", async (_name, { q, c, mistake }) => {
      const db = await testDb();
      await saved(db, inPercent("your_turn", []));
      await recordAnswer(db, { learnerId, topicId: PERCENT, skillId: q.skill, itemKey: `qt:1:${q.id}`, itemId: q.id, input: c.text, verdict: "known_mistake", mistakeTag: mistake.tag, source: "quick_try" });
      const place = navigate(map, await loadProgress(db, learnerId))!;
      expect(place).toMatchObject({ step: "your_turn", check: { id: check1.id } });
      const { skillLines } = await ladderFacts(db, map, learnerId, place);
      const rule = percent.skills.find((s) => s.id === q.skill)!.rule.replace(/\.$/, "");
      const line = skillLines.find((l) => l.startsWith(`- ${rule}:`))!;
      expect(line).toContain(`last Known mistake: ${mistake.fix}`);
      expect(line).not.toContain("Divide it by the old rate");
    });
  });

  // The same lookup, for every Topic: a Known mistake's fix line is the answered item's own, and without the item it is
  // one written for the same Skill, so a tag two Skills share never borrows the other Skill's fix.
  describe("every Known mistake reads its own fix line (round 12, F1)", () => {
    type Slip = { topic: string; skill?: string; itemId?: string; templateId?: string; tag: string; fix: string };
    const slips: Slip[] = map.topics.flatMap((t) => [
      ...t.templates.flatMap((x) => x.mistakes.map((m) => ({ topic: t.id, skill: x.skill, templateId: x.id, tag: m.tag, fix: m.fix }))),
      ...t.checks.flatMap((ch) =>
        ch.quickTries
          .filter((q): q is FixedQuickTry => "id" in q)
          .flatMap((q) => [
            ...(q.mistakes ?? []).flatMap((m) => (m.tag ? [{ topic: t.id, skill: q.skill, itemId: q.id, tag: m.tag, fix: m.fix }] : [])),
            ...(q.choices ?? []).flatMap((c) => (c.mistake ? [{ topic: t.id, skill: q.skill, itemId: q.id, tag: c.mistake.tag, fix: c.mistake.fix }] : [])),
          ]),
      ),
      ...t.questions.flatMap((q) => q.choices.flatMap((c) => (c.mistake?.tag ? [{ topic: t.id, skill: q.skill, itemId: q.id, tag: c.mistake.tag, fix: c.mistake.fix }] : []))),
    ]);

    it("finds the answered item's own fix for every Known mistake in the Course Map", () => {
      expect(slips.length).toBeGreaterThan(100);
      const wrong = slips.filter((s) => {
        const own = slips.filter((o) => o.topic === s.topic && o.tag === s.tag && o.itemId === s.itemId && o.templateId === s.templateId).map((o) => o.fix);
        return !own.includes(fixLineFor(map.topic(s.topic)!, s.tag, { skillId: s.skill, itemId: s.itemId, templateId: s.templateId }) ?? "");
      });
      expect(wrong.map((s) => `${s.topic} ${s.itemId ?? s.templateId} ${s.tag}`)).toEqual([]);
    });

    it("without the item, gives a fix written for the same Skill whenever that Skill has one", () => {
      const borrowed = slips.filter((s) => {
        if (!s.skill) return false;
        const sameSkill = slips.filter((o) => o.topic === s.topic && o.tag === s.tag && o.skill === s.skill).map((o) => o.fix);
        return !sameSkill.includes(fixLineFor(map.topic(s.topic)!, s.tag, { skillId: s.skill }) ?? "");
      });
      expect(borrowed.map((s) => `${s.topic} ${s.skill} ${s.tag}`)).toEqual([]);
    });
  });
});
