import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { navigate, TEACHING_STEPS, type Place, type Progress } from "@/course/navigator";
import { OWNER_LEARNER_ID } from "@/db/schema";
import { valuationCase } from "@/finance/valuation-cases";
import { ensureTopicStarted, loadProgress, saveJump } from "@/learner/memory";
import { startSkipAhead, submitSkipAhead } from "@/learner/skip-ahead";
import { testDb } from "@/test/pglite";
import { exploreWorkbenchParams } from "@/course/explore-widget";
import { recipeById } from "@/widgets/recipes";
import { figuresFromTutor, recipeInputsIn } from "@/widgets/recipes/set-workbench";
import { readWidget } from "@/widgets/widget-reading";
import { openWidgetsNote, SKIP_AHEAD_LINES, stepContext, valuationIdLine } from "./context";
import { ENGINE_INSTRUCTIONS } from "./instructions";
import { turnFacts, type TurnFacts } from "./turn-facts";

/**
 * Seam S6: the Course Navigator context before the reveal (issue #486). The Case title, story and terms go to the
 * Tutor at every step, so they must hold only what was known on the as-of date: no word of the fraud before the reveal.
 */

const OUTCOME_WORDS = /forg|phony|fraud|fak|cook|fictitious|falsif|bogus|confession|restat/i;
// fs-earnings-quality teaches fraud by name, so before its reveal only the Case's own outcome is checked (issue #500):
// no confession, no restatement, no word of Raju's letter of 7 January 2009.
const CASE_OUTCOME_WORDS = /confession|confess|restat|7 January 2009|resign/i;
const BEFORE_REVEAL = TEACHING_STEPS.slice(0, TEACHING_STEPS.indexOf("reveal"));

function placeAt(topicId: string, step: Place["step"], checkIndex: number): Place {
  const map = loadCourseMap();
  const topic = map.topics.find((t) => t.id === topicId);
  if (!topic) throw new Error(`no Topic ${topicId}`);
  const progress: Progress = {
    currentTopicId: topic.id,
    topics: { [topic.id]: { status: "in_progress", step, passedChecks: topic.checks.slice(0, checkIndex).map((c) => c.id), revealShown: false } },
  };
  const place = navigate(map, progress);
  if (!place) throw new Error("no place");
  return place;
}

// Round 10 (critics BP-2, MP-1; run 23 T13 turns 5 and 15): asked "just tell me the answer pls", the Tutor said it could not
// see the Quick try's numbers although the try sat on the Learner's screen, then taught the /100 and x100 steps for the
// Learner to do. Code now gives the Tutor the open try's words and choices, and its answer only when the Learner asks for it.
describe("the Quick try open on the Learner's screen (BP-2, MP-1)", () => {
  const facts: TurnFacts = { step: "your_turn", cap: 80, exampleCurrency: "INR", caseCurrencies: ["USD"], quizOpen: false, openItems: [], blockedNumbers: [], internalWords: [] };
  const openTry = {
    ask: "If the Fed took its 3% rate to 3.5%, a rise traders call 50 basis points, her story would say: First step, done for you: a reporter writes the gap in points.",
    choices: ["Rates rose half a percentage point", "Rates rose half a percent", "Rates rose 50 percent"],
  };
  const at = () => placeAt("num-percent-bps", "your_turn", 0);

  it("gives the Tutor the open, unanswered try's words and choices, says it can see them, and never its answer", () => {
    const text = stepContext(at(), [], undefined, false, undefined, { ...facts, openTry });
    expect(text).toContain(`Quick try on the Learner's screen, not answered yet (code posts no new one this turn): "${openTry.ask}" Its choices: "Rates rose half a percentage point"; "Rates rose half a percent"; "Rates rose 50 percent".`);
    expect(text).toContain("You see this try as the Learner does: never say you cannot see it.");
    expect(text).not.toMatch(/its answer/i);
  });

  it("gives its answer only when the Learner asked for it, to say in words and stop", () => {
    const text = stepContext(at(), [], undefined, false, undefined, { ...facts, replyKind: "hint", openTry: { ...openTry, answer: "Rates rose half a percentage point" } });
    expect(text).toContain('The Learner asked for its answer: "Rates rose half a percentage point". Say it in words as a story fact and stop: no steps for the Learner to do, no ask of your own.');
  });

  it("says code posts the next try with this reply when none is open, and that try is the reply's one ask", () => {
    const text = stepContext(at(), [], undefined, false, undefined, { ...facts, tryPosted: true });
    expect(text).toContain("Code posts the next Quick try with this reply: it is the reply's one ask, so write no ask of your own.");
    expect(text).not.toContain("Quick try on the Learner's screen");
  });

  it("says neither away from Your turn", () => {
    const text = stepContext(placeAt("num-percent-bps", "concept", 0), [], undefined, false, undefined, { ...facts, step: "concept" });
    expect(text).not.toMatch(/Quick try on the Learner's screen|Code posts the next Quick try/);
  });
});

describe("the Satyam Topics' context before the reveal", () => {
  for (const topicId of ["fs-links", "fs-balance"]) {
    for (const step of BEFORE_REVEAL) {
      for (const checkIndex of [0, 1]) {
        it(`${topicId} at ${step} (Check ${checkIndex + 1}) carries no outcome word`, () => {
          const text = stepContext(placeAt(topicId, step, checkIndex));
          expect(text).not.toContain("Reveal (what happened)");
          expect(text.split("\n").filter((l) => OUTCOME_WORDS.test(l))).toEqual([]);
        });
      }
    }
  }

  for (const step of BEFORE_REVEAL) {
    for (const checkIndex of [0, 1]) {
      it(`fs-earnings-quality at ${step} (Check ${checkIndex + 1}) carries no word of the confession`, () => {
        const text = stepContext(placeAt("fs-earnings-quality", step, checkIndex));
        expect(text).not.toContain("Reveal (what happened)");
        expect(text.split("\n").filter((l) => CASE_OUTCOME_WORDS.test(l))).toEqual([]);
      });
    }
  }

  it("fs-links sends the Reveal from the reveal step on", () => {
    expect(stepContext(placeAt("fs-links", "reveal", 2))).toMatch(/Reveal \(what happened\): .*phony invoices/);
  });
});

// Merge review LI-1: the recipes' descriptions give at most one example Case id, so before this the Tutor could not see
// Spine Topic 15's Coffee Day and Zomato ids and had to guess (and be refused) to open Value levers on them. The Case line
// now names each valued Case's id, the one a Workbench takes.
describe("a valued Case's id on its Case line (LI-1)", () => {
  it("names each of Spine Topic 15's Cases by the id Value levers opens on", () => {
    const map = loadCourseMap();
    const text = stepContext(placeAt("spine-15-value-yourself", "explore", 0));
    // The Topic file's own Workbench inputs, its mode with the Case chips included, as the Tutor's signature says to copy them.
    const { params } = exploreWorkbenchParams(map.topic("spine-15-value-yourself")!)!;
    for (const id of ["amazon-yourself-2000", "coffee-day-yourself-2015", "zomato-yourself-2021"]) {
      expect(text).toContain(valuationIdLine(id));
      const inputs = { ...params.inputs, case: id };
      expect(recipeById("value_levers")!.build({ ...params, inputs })).toMatchObject({ ok: true });
      // The Topic file gives these figures, so show_widget does not mark the Widget an Illustration.
      expect(figuresFromTutor("value_levers", inputs, recipeInputsIn(map.topics, "value_levers"))).toBe(false);
    }
  });

  it("opens Value levers on the Case named, among the Topic's Case chips: Zomato reads in rupees, not Amazon's $84", () => {
    const { params } = exploreWorkbenchParams(loadCourseMap().topic("spine-15-value-yourself")!)!;
    const built = recipeById("value_levers")!.build({ ...params, inputs: { ...params.inputs, case: "zomato-yourself-2021" } });
    if (!built.ok) throw new Error(built.error);
    expect(built.code).toContain("$case = 2");
    const read = readWidget(built.code, undefined, () => undefined)!;
    expect(read.readouts[0]).toMatch(/^Value: ₹/);
    expect(read.readouts[1]).toBe("Price on 19 Jul 2021: ₹76");
    expect(read.readouts.join(" ")).not.toContain("$84");
    expect(read.tasks.map((t) => t.text)).toContain("Find a story worth the ₹76 price");
  });

  it("names every Spine Topic's valued Cases, borrowed blocks included, by an id in the valuation registry", () => {
    for (const topic of loadCourseMap().topics.filter((t) => t.spine !== undefined)) {
      const text = stepContext(placeAt(topic.id, "concept", 0));
      for (const c of topic.cases.filter((x) => x.valuation)) {
        expect(text).toContain(`Case: ${c.title}, as of ${c.asOf}. ${valuationIdLine(c.id)}`);
        expect(valuationCase(c.id)).not.toBeNull();
      }
    }
  });

  it("gives a Case with no valuation block no id", () => {
    const text = stepContext(placeAt("fs-links", "concept", 0));
    expect(text).toMatch(/^Case: .+, as of \d{4}-\d{2}-\d{2}\.$/m);
    expect(text).not.toContain("Its Valuation Case id");
  });
});

// Review F4: Spine Topic 15's Value levers names the price of the Case chosen with its Case chip in its second Guided Task,
// so the step context words the explore Widget's tasks at its settings as they stand, as the Widget on screen does.
describe("the explore Widget's Guided Tasks in the step context (F4)", () => {
  it("words the explore Widget's Guided Tasks at its settings: the price of the Case the Learner chose with the chip", () => {
    const place = placeAt("spine-15-value-yourself", "explore", 0);
    const guided = (text: string) => text.split("\n").find((line) => line.startsWith("Guided Tasks under the Explore Widget")) ?? "";
    expect(guided(stepContext(place))).toContain("2. Find a story worth the $84 price");
    const onZomato = guided(stepContext(place, [], undefined, false, undefined, undefined, { $case: 2 }));
    expect(onZomato).toContain("2. Find a story worth the ₹76 price");
    expect(onZomato).not.toContain("$84");
  });
});

// Spec 2026-11-12 A6: asked "why am I learning this?", the Tutor says the Topic's why line in its own words, so the line
// rides in every Course Navigator message of the Topic; a Topic without one sends none.
describe("the Topic's why line (A6)", () => {
  it("is in the Course Navigator message when the Topic has one, and absent when it has none", () => {
    const place = placeAt("num-percent-bps", "your_turn", 0);
    const why = "Rates and growth in a valuation are read in percentages and basis points.";
    const withWhy = stepContext({ ...place, topic: { ...place.topic, why } });
    expect(withWhy).toContain(`Why it matters (say it in your own words when the Learner asks why they are learning this): ${why}`);
    const without = stepContext({ ...place, topic: { ...place.topic, why: undefined } });
    expect(without).not.toContain("Why it matters");
  });
});

// Review finding a8-skip-choice-named-where-card-has-none: asked to skip, the Tutor always sent the Learner to "I know
// this: quiz me", which the Topic Start card draws only when skipAheadState says "offer". Spine Topic 15 (it ends on the
// Learner's own work) and three Topics with too few questions have none, and once today's quiz is used the card shows a
// line instead. Each turn's context now says which, worked out as the Study page works it out.
describe("what the Topic Start card offers, in each turn's context (A8)", () => {
  const map = loadCourseMap();
  const now = new Date("2026-11-13T09:00:00Z");
  const me = OWNER_LEARNER_ID;

  async function contextAt(topicId: string, before?: (db: Awaited<ReturnType<typeof testDb>>) => Promise<void>) {
    const db = await testDb();
    await saveJump(db, map, topicId, now, me);
    await ensureTopicStarted(db, map, now, me);
    await before?.(db);
    const place = navigate(map, await loadProgress(db, me));
    expect(place?.topic.id).toBe(topicId);
    const facts = await turnFacts(db, map, me, place, { now });
    return { facts, text: stepContext(place, [], undefined, false, undefined, facts) };
  }

  it("says Spine Topic 15 has no quick quiz: it ends on the Learner's own work", async () => {
    const { facts, text } = await contextAt("spine-15-value-yourself");
    expect(facts.skipAhead).toBe("none");
    expect(text).toContain(SKIP_AHEAD_LINES.none);
    expect(text).not.toContain(SKIP_AHEAD_LINES.offer);
  });

  it("says the card offers it on a Topic that has one, before today's quiz is taken", async () => {
    const { facts, text } = await contextAt("spine-01-worth");
    expect(facts.skipAhead).toBe("offer");
    expect(text).toContain(SKIP_AHEAD_LINES.offer);
  });

  it("is left out of the facts a tool works out inside its transaction (no turn given), where a failed read would abort it", async () => {
    const db = await testDb();
    await saveJump(db, map, "spine-01-worth", now, me);
    await ensureTopicStarted(db, map, now, me);
    const place = navigate(map, await loadProgress(db, me));
    const facts = await turnFacts(db, map, me, place);
    expect(facts.skipAhead).toBeUndefined();
    const text = stepContext(place, [], undefined, false, undefined, facts);
    for (const line of Object.values(SKIP_AHEAD_LINES)) expect(text).not.toContain(line);
  });

  it("says today's quiz is used once the Learner has submitted it, as the card's line does", async () => {
    const { facts, text } = await contextAt("spine-01-worth", async (db) => {
      const started = await startSkipAhead(db, map, "spine-01-worth", now, me);
      if (!started.ok) throw new Error(started.reason);
      // Every question left unanswered: a miss, so the Topic carries on and only today's attempt is used.
      const marked = await submitSkipAhead(db, map, started.quiz.attemptId, {}, now, me);
      expect(marked).toMatchObject({ ok: true, passed: false });
    });
    expect(facts.skipAhead).toBe("tried_today");
    expect(text).toContain(SKIP_AHEAD_LINES.tried_today);
    expect(text).not.toContain(SKIP_AHEAD_LINES.offer);
  });

  it("is what the instructions' skip rule waits for before naming the Choice", () => {
    expect(ENGINE_INSTRUCTIONS).toContain('"I know this: quiz me" on the Topic Start card, but only when the Course Navigator message says the card offers it');
    for (const line of Object.values(SKIP_AHEAD_LINES)) expect(line.startsWith("Topic Start card: ")).toBe(true);
  });
});

// The widget engine is the only Widget lane (#19): the Tutor never writes Widget code, so the open Widgets line points to
// update_widget, which takes an open Widget's title as its key.
describe("the open Widgets line", () => {
  it("names each open Widget by title and moves one with update_widget, never by writing it again", () => {
    const note = openWidgetsNote(["Long-term interest rates", "PV"]);
    expect(note).toContain('Open Widgets (tabs in the Widget panel): "Long-term interest rates", "PV".');
    expect(note).toContain("call update_widget with its title");
    expect(note).not.toMatch(/write it again|openui-lang/);
  });

  it("is left out when no Widget is open", () => {
    expect(openWidgetsNote([])).toBeNull();
  });
});
