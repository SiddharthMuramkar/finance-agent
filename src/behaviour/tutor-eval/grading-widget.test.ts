import { describe, expect, it } from "vitest";
import type { ReplyCheckContext } from "@/tutor/reply-checks";
import { buildGraderPrompt, codedFailures, modeOf, seen, type SeenWidget } from "./grading";

/**
 * Seam: the pass condition "widget" on a reply as the Learner sees it. A recipe keeps its mode under params.inputs, and
 * a Widget code stored itself (the Concept card's) is not one the Tutor showed.
 */
const ctx: ReplyCheckContext = { step: "concept", exampleCurrency: "INR", caseCurrencies: [], openItems: [], internalWords: [] };

/** A rate_move as the engine stores it: its params are { title, inputs, refs, facts }, and the mode is an input. */
const rateMove = (mode: "show" | "practice", opts: { byCode?: boolean; old?: number; new?: number } = {}): SeenWidget => ({
  kind: "recipe",
  id: "rate_move",
  params: { title: "Rate move", inputs: { old: opts.old ?? 3, new: opts.new ?? 3.25, mode }, refs: {}, facts: {} },
  labels: ["Rate move"],
  ...(opts.byCode ? { byCode: true } : {}),
});
const reply = (widgets: SeenWidget[]) => seen({ text: "Okay, try this one.\nHow many basis points did the rate move?", widgets });
const practice = [{ kind: "widget", mode: "practice" }] as const;

describe("the widget condition reads a recipe's mode where the recipe keeps it", () => {
  it("passes a rate_move set to practice (mode under params.inputs)", () => {
    expect(codedFailures([...practice], reply([rateMove("practice")]), ctx)).toEqual([]);
  });

  it("fails a rate_move in show mode, and says which mode it is in", () => {
    const failures = codedFailures([...practice], reply([rateMove("show")]), ctx);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/practice mode/);
    expect(failures[0]).toMatch(/mode show/);
  });

  it("still reads a flat params.mode, and says 'no mode' for a Widget that has none", () => {
    const flat: SeenWidget = { kind: "recipe", id: "x", params: { mode: "practice" }, labels: [] };
    expect(modeOf(flat)).toBe("practice");
    const written: SeenWidget = { kind: "written", id: "rate-change-three-ways", labels: [] };
    expect(modeOf(written)).toBeUndefined();
    expect(codedFailures([...practice], reply([written]), ctx)[0]).toMatch(/no mode/);
  });
});

describe("the widget condition grades the Widget the Tutor showed", () => {
  it("passes when any Widget the Tutor showed is in the mode, whatever its place in the list", () => {
    expect(codedFailures([...practice], reply([rateMove("show"), rateMove("practice")]), ctx)).toEqual([]);
    expect(codedFailures([...practice], reply([rateMove("practice"), rateMove("show")]), ctx)).toEqual([]);
  });

  it("leaves out the Widget code showed: the Concept card's Widget is on screen whatever the Tutor does", () => {
    const card = rateMove("show", { byCode: true });
    // The Tutor showed nothing: only code's Widget is on screen.
    const none = codedFailures([{ kind: "widget" }], reply([card]), ctx);
    expect(none).toHaveLength(1);
    expect(none[0]).toMatch(/Tutor showed no Widget.*code's/);
    // The Tutor's practice Widget comes after the card's: graded on its own, not on the first Widget.
    expect(codedFailures([...practice], reply([card, rateMove("practice")]), ctx)).toEqual([]);
    // A practice Widget that code showed does not stand in for one the Tutor showed.
    expect(codedFailures([...practice], reply([rateMove("practice", { byCode: true })]), ctx)).toHaveLength(1);
  });

  it("keeps the open quiz's numbers out of the Tutor's Widget only", () => {
    const quiz: ReplyCheckContext = { ...ctx, step: "check", openItems: [{ prompt: "How many basis points are there in 0.6 of a percentage point?", choices: ["6", "60", "600", "0.6"], answer: "60" }] };
    expect(codedFailures([{ kind: "widget" }], reply([rateMove("show", { old: 0.6, new: 1 })]), quiz)[0]).toMatch(/0\.6.*open quiz/);
    expect(codedFailures([{ kind: "widget" }], reply([rateMove("show", { old: 0.6, new: 1, byCode: true }), rateMove("show")]), quiz)).toEqual([]);
  });

  it("tells the grader which Widget code showed", () => {
    const prompt = buildGraderPrompt({ stateNote: "x", message: "m", reply: reply([rateMove("show", { byCode: true }), rateMove("practice")]), extra: [] });
    expect(prompt).toMatch(/"rate_move" \(code showed this one, not the Tutor\)/);
    expect(prompt).toMatch(/"rate_move" set to/);
  });
});
