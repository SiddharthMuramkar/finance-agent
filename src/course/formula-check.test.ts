import { describe, expect, it } from "vitest";
import { calculate } from "@/finance/calculators";
import { splitMarkers } from "@/finance/formula-markers";
import { formulaById } from "@/finance/formulas";
import { formulaCheckErrors, NOT_YET_CONVERTED, topicTexts, typedFormulas } from "./formula-check";
import { loadCourseMap, type Topic } from "./map";

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

  it("lets a listed Topic type formulas, but makes a converted one come off the list", () => {
    expect(formulaCheckErrors([topicWith("old", "PV = amount / (1 + r)^n.")], ["old"])).toEqual([]);
    expect(formulaCheckErrors([topicWith("old", "Worded steps only.")], ["old"])[0]).toContain("remove it from the not-yet-converted list");
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

  it("the quiz markers agree with their answer keys, which stay as they were", () => {
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
      // The right choice is the number the calculator gives.
      const answer = Number(q.choices.find((c) => c.id === q.answer)!.text.replace(/[$,]/g, ""));
      expect(answer, id).toBe(Math.round(expected));
    }
  });
});
