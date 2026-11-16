import { describe, expect, it } from "vitest";
import { calculate } from "@/finance/calculators";
import { splitMarkers } from "@/finance/formula-markers";
import { formulaById } from "@/finance/formulas";
import { formulaCheckErrors, NOT_YET_CONVERTED, typedFormulas } from "./formula-check";
import { convertedTopic } from "./lesson-fixture";
import { loadCourseMap, type Topic } from "./map";
import { topicTexts } from "./topic-texts";

const map = loadCourseMap();
const pv = map.topic("present-value")!;

/** A minimal Topic with the given concept text. */
const topicWith = (id: string, concept: string): Topic => ({ ...pv, id, concept, cases: [], questions: [], checks: [], connections: [], principle: "Plain words." });

describe("the typed-formula course check", () => {
  it("passes the real Course Map", () => {
    expect(formulaCheckErrors(map.topics)).toEqual([]);
  });

  it("present value types no formula anywhere a Learner or the Tutor reads", () => {
    expect(typedFormulas(pv)).toEqual([]);
    expect(topicTexts(pv).length).toBeGreaterThan(10);
  });

  it("fails on a typed formula in a Topic that is not on the list", () => {
    const errors = formulaCheckErrors([topicWith("fresh", "Then PV = amount / (1 + r)^n.")], []);
    expect(errors[0]).toContain("Topic fresh types a formula");
    expect(errors.join("\n")).toContain("concept");
  });

  it("lets a formula sit in Go deeper, while the same formula elsewhere still fails (spec #68: formulas only behind Go deeper)", () => {
    const behind = { ...topicWith("deeper", "Plain words only."), goDeeper: "For the curious: PV = amount / (1 + r)^n." };
    expect(formulaCheckErrors([behind], [])).toEqual([]);
    expect(typedFormulas(behind)).toEqual([]);
    const inPrinciple = { ...behind, principle: "Keep this: PV = amount / (1 + r)^n." };
    expect(formulaCheckErrors([inPrinciple], []).join("\n")).toContain("principle");
  });

  it("lets a listed Topic type formulas, but makes a converted one come off the list", () => {
    expect(formulaCheckErrors([topicWith("old", "PV = amount / (1 + r)^n.")], ["old"])).toEqual([]);
    expect(formulaCheckErrors([topicWith("old", "Worded steps only.")], ["old"])[0]).toContain("remove it from the not-yet-converted list");
  });

  it("scans a converted Topic's teaching: card lines, Skills, Quick tries, templates, choice fixes and the Running example", () => {
    const where = topicTexts(convertedTopic()).map((t) => t.where);
    for (const label of [
      'Check "pct-demo-check-1" card line 1',
      'Check "pct-demo-check-1" card write-down',
      'Skill "pts-to-bp" rule',
      'Skill "pts-to-bp" analogy',
      'Check "pct-demo-check-1" Quick try "pct-demo-try-pts-2" ask',
      'Check "pct-demo-check-1" Quick try "pct-demo-try-pts-2" fix 1',
      'template "bp-from-move" ask',
      'template "bp-from-move" half-done step',
      'template "bp-from-move" fix for stopped_at_points',
      'question "pct-demo-headline" choice "points" fix',
      "the Running example",
      'term "basis point"',
    ]) {
      expect(where).toContain(label);
    }
    expect(formulaCheckErrors([convertedTopic()], [])).toEqual([]);
  });

  it("fails a typed sum in a term's meaning", () => {
    const t = convertedTopic();
    t.terms[0].means = "Sum: 5 - 4 = 1 percentage point.";
    expect(formulaCheckErrors([t], ["pct-demo"]).join("\n")).toContain(`term "${t.terms[0].term}"`);
  });

  it("fails a typed sum in the new teaching texts even for a Topic on the not-yet-converted list", () => {
    const t = convertedTopic();
    t.checks[0].card!.lines[1] = "Points: 5 - 4 = 1 percentage point.";
    const errors = formulaCheckErrors([t], ["pct-demo"]);
    expect(errors[0]).toContain("Topic pct-demo types a formula in its teaching");
    expect(errors.join("\n")).toContain('Check "pct-demo-check-1" card line 2');
  });

  it("fails a typed sum in a Quick try's choice or its mix-up fix, even for a Topic on the not-yet-converted list", () => {
    const withChoices = (a: string, fix: string) => {
      const t = convertedTopic();
      const tap = { id: "pct-demo-try-tap", skill: "pts", kind: "choice", ask: "A rate goes from 4% to 5%. Which is the move?", answer: "b" };
      (t.checks[0].quickTries as unknown[]).push({ ...tap, choices: [{ id: "a", text: a, mistake: { tag: "slip", fix } }, { id: "b", text: "One percentage point" }] });
      return t;
    };
    const inChoice = formulaCheckErrors([withChoices("Points: 5 - 4 = 1", "That is the gap, not the move.")], []);
    expect(inChoice[0]).toContain("Topic pct-demo types a formula");
    expect(inChoice.join("\n")).toContain('Check "pct-demo-check-1" Quick try "pct-demo-try-tap" choice "a": ');
    const inFix = formulaCheckErrors([withChoices("Five points", "The move is 5 - 4 = 1 point.")], ["pct-demo"]);
    expect(inFix[0]).toContain("Topic pct-demo types a formula in its teaching");
    expect(inFix.join("\n")).toContain('Check "pct-demo-check-1" Quick try "pct-demo-try-tap" choice "a" fix: ');
    expect(formulaCheckErrors([withChoices("Five points", "That is the gap, not the move.")], [])).toEqual([]);
  });

  it("fails a typed sum in a scene or a term's Lingo card, even for a Topic on the not-yet-converted list", () => {
    const t = convertedTopic();
    t.scenes = [{ id: "pct-demo-scene", step: "story", recipe: "story_scene", inputs: { cast: [{ id: "asha", emoji: "woman", name: "Asha" }], beats: [{ who: "asha", says: "So 5 - 4 = 1 point." }] } }];
    t.terms[0].example = "From 4% to 5% is 5 - 4 = 1 point.";
    const errors = formulaCheckErrors([t], ["pct-demo"]).join("\n");
    expect(errors).toContain('Scene "pct-demo-scene" beats.0.says: ');
    expect(errors).toContain('term "percentage point" example: ');
  });

  it("Financial statements and Valuation Topics type no formula outside Go deeper, and are off the list (#98)", () => {
    const converted = ["fs-balance", "fs-ratios", "fs-tax", "cf-wacc", "cf-capital-structure", "val-dcf", "val-multiples", "val-young", "val-implied-erp", "val-india", "cf-venture"];
    for (const id of converted) {
      expect(typedFormulas(map.topic(id)!), id).toEqual([]);
      expect(NOT_YET_CONVERTED, id).not.toContain(id);
    }
  });

  it("makes a list entry for a Topic that does not exist come off", () => {
    expect(formulaCheckErrors([], ["gone"])[0]).toContain('"gone" is on the not-yet-converted list but is not a Topic');
  });

  it("only shrinks: it never holds present value, a duplicate or a Topic that is clean", () => {
    expect(NOT_YET_CONVERTED).not.toContain("present-value");
    expect(new Set(NOT_YET_CONVERTED).size).toBe(NOT_YET_CONVERTED.length);
    // The ceiling is the list's length when it was made (95 Topics, present value converted). Lower it as Topics are converted; never raise it.
    expect(NOT_YET_CONVERTED.length).toBeLessThanOrEqual(86);
  });
});

describe("present value's formula markers", () => {
  const markers = topicTexts(pv).flatMap(({ where, text }) => splitMarkers(text).flatMap((s) => (s.kind === "text" ? [] : [{ where, s }])));

  it("has markers in its Concept and in quiz explanations, all valid", () => {
    expect(markers.some((m) => m.where === "concept")).toBe(true);
    expect(markers.filter((m) => m.where.endsWith("explanation")).length).toBeGreaterThanOrEqual(3);
    for (const { where, s } of markers) expect(s.kind, where).toBe("formula");
  });

  it("every marker's result is worked out by the calculator", () => {
    for (const { where, s } of markers) {
      if (s.kind !== "formula") continue;
      const run = calculate(formulaById(s.formulaId)!.calculator, s.values, "usd");
      expect(run.ok, where).toBe(true);
    }
  });

  it("the quiz markers work out the figures the explanations quote (E6a asks about the idea, so no choice is a number)", () => {
    const keyed: [string, number][] = [
      ["pv-q-one-year", 1000],
      ["pv-q-two-years", 1000],
      ["pv-q-five-percent", 4535.15],
    ];
    for (const [id, expected] of keyed) {
      const q = map.question(id)!;
      const marker = splitMarkers(q.explanation).find((s) => s.kind === "formula");
      if (marker?.kind !== "formula") throw new Error(`${id} has no marker`);
      const run = calculate("present_value", marker.values, "usd");
      if (!run.ok) throw new Error(run.error);
      expect(run.results.find((r) => r.label === "Present value")!.value, id).toBeCloseTo(expected, 2);
    }
  });
});
