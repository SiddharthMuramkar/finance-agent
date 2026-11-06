import { describe, expect, it } from "vitest";
import { choicesFor } from "./choices.ts";
import { exactFrom } from "./answers.ts";
import type { FixedItem } from "./mark.ts";
import type { DrawnItem } from "./templates.ts";

/** Quick try pb-try-a1 of the Percent Topic: 3% to 3.5% is 0.5 points; 50 is the unit mix-up. */
const a1: FixedItem = {
  id: "pb-try-a1",
  skill: "pts",
  ask: "A rate goes from 3% to 3.5%. How many points did it move?",
  kind: "number",
  answer: 0.5,
  unit: "points",
  mistakes: [{ answer: 50, fix: "That is basis points. Points are the new rate minus the old rate.", tag: "forgot_to_convert" }],
};

/** One hand-built draw of pb-t-bp-from-move with a = 3 and b = 3.5. */
const drawn = (over: Partial<DrawnItem> = {}): DrawnItem => ({
  id: "pb-t-bp-from-move:s1",
  templateId: "pb-t-bp-from-move",
  skill: "pts-to-bp",
  prompt: "A rate moves from 3% to 3.5%. How many basis points?",
  kind: "number",
  answer: exactFrom(50),
  unit: "bp",
  decimals: 0,
  sign: "magnitude",
  params: { a: "3", b: "3.5" },
  mistakes: [
    { value: exactFrom(0.5), tag: "stopped_at_points", fix: "That is the move in points. Times 100 gives basis points." },
    { value: exactFrom(5), tag: "used_x10", fix: "One point is 100 basis points, so multiply by 100, not 10." },
  ],
  ...over,
});

describe("choicesFor", () => {
  it("makes a fixed number item into its answer plus its Known-mistake values, the wrong one carrying its fix", () => {
    const set = choicesFor(a1, "s")!;
    expect(set.choices.map((c) => c.text).sort()).toEqual(["0.5 points", "50 points"]);
    const wrong = set.choices.find((c) => c.text === "50 points")!;
    expect(wrong.mistake).toEqual({ tag: "forgot_to_convert", fix: "That is basis points. Points are the new rate minus the old rate." });
    const right = set.choices.find((c) => c.id === set.answer)!;
    expect(right.text).toBe("0.5 points");
    expect(right.mistake).toBeUndefined();
  });

  it("makes 3 choices from a template draw's mistake functions, in the same order for the same seed", () => {
    const set = choicesFor(drawn(), "seed-1")!;
    const by = Object.fromEntries(set.choices.map((c) => [c.text, c]));
    expect(Object.keys(by).sort()).toEqual(["0.5 bp", "5 bp", "50 bp"]);
    expect(by["50 bp"].id).toBe(set.answer);
    expect(by["0.5 bp"].mistake?.tag).toBe("stopped_at_points");
    expect(by["5 bp"].mistake?.tag).toBe("used_x10");
    expect(choicesFor(drawn(), "seed-1")!.choices.map((c) => c.id)).toEqual(set.choices.map((c) => c.id));
  });

  it("does not leak the answer through the order for every seed", () => {
    const firsts = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((s) => choicesFor(drawn(), s)!.choices[0].id));
    expect(firsts.size).toBeGreaterThan(1);
  });

  it("drops a mistake equal to the answer, keeps one of two equal mistakes, and gives null under 2 distinct choices", () => {
    const same = drawn({ mistakes: [{ value: exactFrom(50), tag: "used_x10", fix: "x" }, { value: exactFrom(5), tag: "divided_by_10", fix: "y" }] });
    expect(choicesFor(same, "s")!.choices.map((c) => c.text).sort()).toEqual(["5 bp", "50 bp"]);
    const twins = drawn({ mistakes: [{ value: exactFrom(5), tag: "used_x10", fix: "x" }, { value: exactFrom(5), tag: "divided_by_10", fix: "y" }] });
    expect(choicesFor(twins, "s")!.choices).toHaveLength(2);
    expect(choicesFor(drawn({ mistakes: [] }), "s")).toBeNull();
    expect(choicesFor({ ...a1, mistakes: undefined }, "s")).toBeNull();
  });

  it("uses a label pattern when the item has one", () => {
    const set = choicesFor({ ...a1, label: "Up {value}" }, "s")!;
    expect(set.choices.map((c) => c.text).sort()).toEqual(["Up 0.5 points", "Up 50 points"]);
  });

  it("labels a template mistake with its own idea pattern, so the idea and not the sum tells the choices apart", () => {
    const set = choicesFor(
      drawn({
        label: "{value}: the move times 100",
        mistakes: [{ value: exactFrom(0.5), tag: "stopped_at_points", fix: "x", label: "{value}: the move left in points" }, { value: exactFrom(5), tag: "used_x10", fix: "y" }],
      }),
      "s",
    )!;
    expect(set.choices.map((c) => c.text).sort()).toEqual(["0.5 bp: the move left in points", "5 bp: the move times 100", "50 bp: the move times 100"]);
  });

  it("serves a kind: choice item as written, and a truth item as True and False", () => {
    const written: FixedItem = {
      id: "c1",
      skill: "s",
      ask: "RBI cut by 0.25%. What do traders call that move?",
      kind: "choice",
      answer: "bp25",
      choices: [
        { id: "bp25", text: "25 bps" },
        { id: "pct", text: "0.25 bps", mistake: { tag: "stopped_at_points", fix: "A quarter of a point is 25 basis points." } },
      ],
    };
    const set = choicesFor(written, "s")!;
    expect(set.answer).toBe("bp25");
    expect(set.choices.map((c) => c.id).sort()).toEqual(["bp25", "pct"]);
    const truth = choicesFor({ id: "t", skill: "s", ask: "A point is 100 bp.", kind: "truth", answer: true }, "s")!;
    expect(truth.choices.map((c) => c.text)).toEqual(["True", "False"]);
    expect(truth.answer).toBe("true");
  });
});
