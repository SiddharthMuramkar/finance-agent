import { z } from "zod";
import { rateChange, rateMoveLines } from "@/finance/rate-change";
import { defineRecipe, num, program, reachableTarget, sliderStatements, str, type CompiledSlider, type Recipe } from "./define";

/**
 * Recipe set of the tutor run (spec #229): the one rate Widget, rate_move. Kept apart from sets A and B so its lane
 * never edits theirs.
 */

/** The highest rate the Widget takes, in percent. */
const MAX_RATE = 20;

/** Practice mode marks whole basis points with StepThrough's check, which is exact below 200 bp (it allows 0.5%). */
export const PRACTICE_MAX_BP = 199;

/** The Widget state names of the two rates, for code that reads a shown rate_move (as Percent's `rateChange: { old, new }`). */
export const RATE_MOVE_STATE = { old: "old", new: "new" } as const;

/** The labels of the three worked lines, in order. */
export const RATE_MOVE_LABELS = ["Points: new minus old", "Basis points: points times 100", "Percent of the old rate"] as const;

const onStep = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
const rate = z.number().min(0).max(MAX_RATE).refine(onStep, "a rate in steps of 0.01");

// ——— The worked lines as OpenUI Lang expressions of $old and $new ———
// Step for step the arithmetic of rateMoveLines (src/finance/rate-change.ts): whole basis points first, then words.
// The tests evaluate these across the whole range and hold them to rateMoveLines' words.

const BP = "@Round(($new - $old) * 100, 0)";
const SIZE = `@Abs(${BP})`;
const POINTS = `(${SIZE} / 100)`;
const POINT_WORD = `(${SIZE} == 100 ? "point" : "points")`;
const FALL = `(${BP} < 0 ? "a fall of " : "")`;
const OLD_BP = "@Round($old * 100, 0)";
const rateText = (variable: "$old" | "$new") => `(@Round(${variable} * 100, 0) / 100)`;

const LIVE_LINES = [
  `${rateText("$new")} + "% minus " + ${rateText("$old")} + "% is " + ${FALL} + ${POINTS} + " " + ${POINT_WORD}`,
  `${POINTS} + " " + ${POINT_WORD} + " times 100 is " + ${FALL} + ${SIZE} + " bp"`,
  `(${OLD_BP} == 0 ? "The old rate is 0%, so the percent change has no value" : ${POINTS} + " divided by the old " + ${rateText("$old")} + "%, times 100, is " + ${FALL} + @Round(${SIZE} * 100 / ${OLD_BP}, 2) + "%")`,
];

/** The number line: the old rate and the new one, joined by the move, on an axis that starts at 0%. */
const chart = (from: string, to: string) =>
  `line = LineChart(["Old rate", "New rate"], [Series("Rate", [${from}, ${to}])], "linear", "Before and after the move", "Rate (%)", 160, "percent", 0)`;

export const rateMove = defineRecipe({
  id: "rate_move",
  archetype: "Convert",
  summary:
    "One rate moving from old to new (in percent, 0 to 20, steps of 0.01): the move drawn, with three worked lines code writes, points (new minus old), basis points (points times 100) and percent of the old rate. mode show (default) shows the lines and keeps sliders for play; mode practice asks the Learner to type the move in basis points, marks it, then reveals the lines (moves under 2 points only). The one rate Widget: use it for any rate change, never a free-form one.",
  params: {
    inputs: z
      .object({
        old: rate.describe("The old rate, in percent"),
        new: rate.describe("The new rate, in percent"),
        mode: z.enum(["show", "practice"]).default("show").describe("show: the three lines at once. practice: the Learner types the basis points first"),
      })
      .strict()
      .superRefine((p, ctx) => {
        if (p.mode === "practice" && Math.abs(rateChange(p.old, p.new).basisPoints) > PRACTICE_MAX_BP) {
          ctx.addIssue({ code: "custom", message: "practice mode takes a move under 2 points (200 bp), so it can mark whole basis points; use mode show for a bigger move" });
        }
      }),
    refs: z.object({}).strict(),
    facts: z.object({}).strict(),
  },
  budget: { controls: 2, numbers: 0, visuals: 1, words: 12 },
  examples: [
    { title: "A savings rate from 4% to 5%", inputs: { old: 4, new: 5 }, refs: {}, facts: {} },
    { title: "A loan rate cut from 7.5% to 7.2%", inputs: { old: 7.5, new: 7.2, mode: "show" }, refs: {}, facts: {} },
    { title: "Your turn: 3% to 3.25%", inputs: { old: 3, new: 3.25, mode: "practice" }, refs: {}, facts: {} },
  ],
  compile: ({ title, inputs: p }) => {
    if (p.mode === "practice") {
      const lines = rateMoveLines(p.old, p.new);
      const size = Math.abs(rateChange(p.old, p.new).basisPoints);
      const ask = `The rate moves from ${num(p.old)}% to ${num(p.new)}%. By how many basis points? Type a whole number.`;
      return program(
        title,
        ["line", "practice"],
        [
          chart(num(p.old), num(p.new)),
          "practice = StepThrough([ask, points, bps, change])",
          `ask = Step("Your answer first", ${str(ask)}, "neutral", ${size}, "bp")`,
          ...["points", "bps", "change"].map((name, i) => `${name} = Step(${str(RATE_MOVE_LABELS[i])}, ${str(lines[i])}, "neutral")`),
        ],
      );
    }
    const range = { min: 0, max: MAX_RATE, step: 0.01 };
    const newSlider: CompiledSlider = { name: "control", variable: RATE_MOVE_STATE.new, label: "New rate", range: { ...range, start: p.new }, unit: "percent" };
    const oldSlider: CompiledSlider = { name: "oldControl", variable: RATE_MOVE_STATE.old, label: "Old rate", range: { ...range, start: p.old }, unit: "percent" };
    // Optional play (spec #229): setting the new rate back to the old one, and the old rate to 0%.
    const backTo = p.new === p.old ? reachableTarget(newSlider.range) : p.old;
    const oldTo = p.old === 0 ? reachableTarget(oldSlider.range) : 0;
    return program(
      title,
      ["control", "line", "working", "more", "tasks"],
      [
        ...sliderStatements(oldSlider).slice(0, 1),
        ...sliderStatements(newSlider),
        chart("$old", "$new"),
        "working = Steps([points, bps, change])",
        ...["points", "bps", "change"].map((name, i) => `${name} = StepsItem(${str(RATE_MOVE_LABELS[i])}, ${LIVE_LINES[i]})`),
        'more = Accordion([AccordionItem("more", "More settings", [oldControl])])',
        sliderStatements(oldSlider)[1],
        "tasks = GuidedTasks([task1, task2])",
        `task1 = GuidedTask(${str(`Move the new rate to ${num(backTo)}% and read the lines again`)}, $new == ${num(backTo)})`,
        `task2 = GuidedTask(${str(`Set the old rate to ${num(oldTo)}% and read the last line`)}, $old == ${num(oldTo)})`,
      ],
    );
  },
});

/** The tutor run's recipes. */
export const SET_TUTOR: Recipe[] = [rateMove];
