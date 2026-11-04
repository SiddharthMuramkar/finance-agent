import { describe, expect, it } from "vitest";
import { drawTemplate, formatExact, markAnswer, plainExact, templateProblems, type QuestionTemplate } from ".";
import { BP_FALL, BP_FROM_MOVE, FIXTURE_TEMPLATES, PCT_CHANGE, POINTS_FROM_BP, RUNNING_EXAMPLE } from "./fixtures";

/** Pins a template's ranges to one value each, so a draw is the worked example a test names. */
const pinned = (t: QuestionTemplate, values: Record<string, number>): QuestionTemplate => ({
  ...t,
  params: Object.fromEntries(Object.entries(t.params).map(([name, range]) => [name, { ...range, min: values[name], max: values[name] }])),
  avoid: [],
});

describe("the Session's own numbers", () => {
  it("marks 7.5 minus 7.2 as exactly 0.3 points and 30 basis points", () => {
    const fall = drawTemplate(pinned(BP_FALL, { a: 7.5, d: -0.3 }), "s");
    expect(fall.prompt).toBe("A rate falls from 7.5% to 7.2%. How many basis points did it fall?");
    for (const input of ["30", "30bp", "30 bp", "-30"]) expect(markAnswer(fall, input).verdict, input).toBe("right");
    const points = drawTemplate({ ...pinned(BP_FALL, { a: 7.5, d: -0.3 }), answer: "points_between", unit: "points", decimals: 2, mistakes: [] }, "s");
    expect(markAnswer(points, "0.3")).toEqual({ verdict: "right", expected: "0.3 points (a fall)" });
  });

  it("gives 0.3 for a fall of 30 basis points the stopped-at-points Known mistake and its fix", () => {
    const fall = drawTemplate(pinned(BP_FALL, { a: 7.5, d: -0.3 }), "s");
    expect(markAnswer(fall, "0.3")).toEqual({
      verdict: "known_mistake",
      tag: "stopped_at_points",
      fix: "That is the fall in points. Times 100 gives basis points.",
      expected: "30 bp (a fall)",
    });
  });

  it("maps 6 for 60 to used ×10", () => {
    const move = drawTemplate(pinned(BP_FROM_MOVE, { a: 3, d: 0.6 }), "s");
    expect(move.prompt).toBe("A rate moves from 3% to 3.6%. How many basis points?");
    expect(markAnswer(move, "60").verdict).toBe("right");
    const fallingMove = drawTemplate(pinned(BP_FROM_MOVE, { a: 3, d: -0.6 }), "s");
    expect(fallingMove.answer).toEqual({ scaled: 60n, scale: 0 });
    expect(markAnswer(fallingMove, "-60").verdict).toBe("right");
    expect(markAnswer(move, "6")).toMatchObject({ verdict: "known_mistake", tag: "used_x10" });
  });

  it("maps 12 and 0.12 for 1.2 to divided by 10 and divided by 1,000", () => {
    const toPoints = drawTemplate(pinned(POINTS_FROM_BP, { bp: 120 }), "s");
    expect(markAnswer(toPoints, "1.2")).toEqual({ verdict: "right", expected: "1.2 points" });
    expect(markAnswer(toPoints, "12")).toMatchObject({ verdict: "known_mistake", tag: "divided_by_10" });
    expect(markAnswer(toPoints, "0.12")).toMatchObject({ verdict: "known_mistake", tag: "divided_by_1000" });
    expect(markAnswer(toPoints, "120")).toMatchObject({ verdict: "known_mistake", tag: "forgot_to_convert" });
    expect(markAnswer(toPoints, "1.3").verdict).toBe("wrong");
  });

  it("gives the move in points for a percent-change ask the mixed-percent-points Known mistake", () => {
    const pct = drawTemplate(pinned(PCT_CHANGE, { a: 3, d: 0.25 }), "s");
    expect(pct.answer).toEqual({ scaled: 83n, scale: 1 });
    expect(markAnswer(pct, "8.3%").verdict).toBe("right");
    expect(markAnswer(pct, "8.33").verdict).toBe("right");
    expect(markAnswer(pct, "0.25")).toMatchObject({ verdict: "known_mistake", tag: "mixed_percent_points" });
  });
});

describe("half-done tries", () => {
  it("shows the points and asks for the basis points", () => {
    const half = drawTemplate(pinned(BP_FALL, { a: 7.5, d: -0.3 }), "s", { halfDone: true });
    expect(half.prompt).toBe(
      "A rate falls from 7.5% to 7.2%. How many basis points did it fall? First step, done for you: 7.5 minus 7.2 is 0.3 points.",
    );
    expect(half.id).not.toBe(drawTemplate(pinned(BP_FALL, { a: 7.5, d: -0.3 }), "s").id);
    expect(markAnswer(half, "30").verdict).toBe("right");
    expect(markAnswer(half, "3")).toMatchObject({ verdict: "known_mistake", tag: "used_x10" });
  });

  it("refuses a half-done draw from a template that has none", () => {
    expect(() => drawTemplate(POINTS_FROM_BP, "s", { halfDone: true })).toThrow(/half-done/);
  });
});

describe("seeded draws", () => {
  it("gives the same draw for the same seed and mostly different draws for different seeds", () => {
    expect(drawTemplate(BP_FROM_MOVE, "attempt-1")).toEqual(drawTemplate(BP_FROM_MOVE, "attempt-1"));
    const prompts = new Set(Array.from({ length: 50 }, (_, i) => drawTemplate(BP_FROM_MOVE, `seed-${i}`).prompt));
    expect(prompts.size).toBeGreaterThan(40);
  });

  it("names the Skill and template of every draw", () => {
    const item = drawTemplate(POINTS_FROM_BP, "x");
    expect(item).toMatchObject({ templateId: "points_from_bp", skill: "bp_to_pts", kind: "number", unit: "points", decimals: 2 });
    expect(Object.keys(item.params)).toEqual(["bp"]);
  });

  for (const template of FIXTURE_TEMPLATES) {
    for (const halfDone of template.halfDone ? [false, true] : [false]) {
      it(`${template.id}${halfDone ? " (half-done)" : ""}: 1,000 draws mark their own answer right and their mistakes as Known mistakes`, () => {
        for (let i = 0; i < 1000; i++) {
          const item = drawTemplate(template, `property-${i}`, { halfDone });
          const label = `${item.id}: ${item.prompt}`;
          expect(item.answer.scaled, label).not.toBe(0n);
          expect(item.prompt, label).not.toMatch(/[{}]|-\d/);
          expect(markAnswer(item, plainExact(item.answer)).verdict, label).toBe("right");
          expect(markAnswer(item, formatExact(item.answer, item.unit)).verdict, label).toBe("right");
          for (const value of Object.values(item.params)) {
            expect(RUNNING_EXAMPLE.map(String), label).not.toContain(value.replace(/^-/, ""));
          }
          for (const mistake of item.mistakes) {
            const marked = markAnswer(item, plainExact(mistake.value));
            expect(marked.verdict, `${label} / ${mistake.tag}`).toBe("known_mistake");
            const first = item.mistakes.find((m) => markAnswer({ ...item, mistakes: [m] }, plainExact(mistake.value)).verdict === "known_mistake");
            expect(marked, label).toMatchObject({ tag: first?.tag });
          }
        }
      });
    }
  }
});

describe("checking a template", () => {
  it("finds nothing wrong with the fixtures", () => {
    for (const template of FIXTURE_TEMPLATES) expect(templateProblems(template), template.id).toEqual([]);
  });

  it("names each problem a Topic file could have", () => {
    const bad = {
      ...BP_FROM_MOVE,
      ask: "From {a}% to {c}%?",
      derived: { b: "eval(a + d)" },
      answer: "bp_from_nowhere",
      mistakes: [{ tag: "guessed", fix: "x" }],
      params: { ...BP_FROM_MOVE.params, d: { min: 1, max: 0, step: 0.05 } },
    } as unknown as QuestionTemplate;
    const problems = templateProblems(bad).join("\n");
    expect(problems).toMatch(/answer function "bp_from_nowhere"/);
    expect(problems).toMatch(/mistake "guessed"/);
    expect(problems).toMatch(/derived b/);
    expect(problems).toMatch(/slot \{c\}/);
    expect(problems).toMatch(/range d/);
  });

  it("refuses a template whose decimals cannot hold its exact answer", () => {
    const tooFew = { ...POINTS_FROM_BP, decimals: 0 };
    expect(templateProblems(tooFew).join("\n")).toMatch(/decimals/);
  });

  it("refuses a template that can never draw, rather than loop", () => {
    const stuck = pinned(BP_FROM_MOVE, { a: 3, d: 0 });
    expect(() => drawTemplate(stuck, "s")).toThrow(/no valid draw/);
  });
});
