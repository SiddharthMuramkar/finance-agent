import { z } from "zod";
import { RATE_MOVE_LABELS, RATE_MOVE_MAX } from "@/widgets/primitives/wave2/rate-move-marking";
import { defineRecipe, num, program, sliderStatements, str, type CompiledSlider, type Recipe } from "./define";

/**
 * Recipe set of the tutor run (spec #229): the one rate Widget, rate_move. Kept apart from sets A and B so its lane
 * never edits theirs. Both modes draw the RateMove part (src/widgets/primitives/wave2/rate-move.tsx), which writes the
 * three story lines with the tested rateMoveLines and, in practice mode, marks the tapped reading of the move (nothing is typed).
 */

/** The highest rate the Widget takes, in percent. */
const MAX_RATE = RATE_MOVE_MAX;

/**
 * The biggest move practice mode takes, in basis points: any move the Widget can draw (0% to 20%), since RateMove builds
 * the readings in whole basis points. Kept for importers; it no longer limits anything.
 */
export const PRACTICE_MAX_BP = MAX_RATE * 100;

/** The Widget state names of the two rates, for code that reads a shown rate_move (as Percent's `rateChange: { old, new }`). */
export const RATE_MOVE_STATE = { old: "old", new: "new" } as const;

/** The labels of the three story lines, in order. */
export { RATE_MOVE_LABELS };

const onStep = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
const rate = z.number().min(0).max(MAX_RATE).refine(onStep, "a rate in steps of 0.01");

/** A rate 5 points away that a 0-20 slider reaches and that is never 0%: down from 10% and above, up below it. */
const away = (r: number) => Math.round((r >= 10 ? r - 5 : r + 5) * 100) / 100;

export const rateMove = defineRecipe({
  id: "rate_move",
  archetype: "Convert",
  summary:
    "One rate moving from old to new (in percent, 0 to 20, steps of 0.01): an arrow on a number line, with three story lines code writes, a reporter's move in points, a trader's in basis points and a headline's percent of the old rate, said as quotes, never as sums. mode show (default) shows the lines and keeps sliders for play; mode practice hides the lines until the Learner taps the right reading of the move (the right one, the times-10 slip or the percent mix-up), marks the tap, then reveals them. The one rate Widget: use it for any rate change, never a free-form one.",
  params: {
    inputs: z
      .object({
        old: rate.describe("The old rate, in percent"),
        new: rate.describe("The new rate, in percent"),
        mode: z.enum(["show", "practice"]).default("show").describe("show: the three lines at once. practice: the Learner taps the right reading of the move first"),
      })
      .strict(),
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
    if (p.mode === "practice") return program(title, ["move"], [`move = RateMove(${num(p.old)}, ${num(p.new)}, "practice")`]);
    const range = { min: 0, max: MAX_RATE, step: 0.01 };
    const newSlider: CompiledSlider = { name: "control", variable: RATE_MOVE_STATE.new, label: "New rate", range: { ...range, start: p.new }, unit: "percent" };
    const oldSlider: CompiledSlider = { name: "oldControl", variable: RATE_MOVE_STATE.old, label: "Old rate", range: { ...range, start: p.old }, unit: "percent" };
    // Optional play (spec #229, #533): move the new rate back to the old one and watch the move shrink to nothing, then
    // set the old rate to the first new rate and see the same gap run the other way (same points and bp, a different
    // headline, since the base changed). When there is no move, or the mirror would start from 0% (which has no percent
    // change), each slider goes 5 points away instead, never to 0%.
    const moved = p.new !== p.old;
    const task1 = moved
      ? { to: p.old, text: `Move the new rate to ${num(p.old)}% and watch the move shrink to nothing` }
      : { to: away(p.new), text: `Move the new rate to ${num(away(p.new))}% and read the lines again` };
    const task2 =
      moved && p.new !== 0
        ? { to: p.new, text: `Now set the old rate to ${num(p.new)}% and see the same gap run the other way` }
        : { to: away(p.old), text: `Set the old rate to ${num(away(p.old))}% and read the lines again` };
    return program(
      title,
      ["control", "move", "more", "tasks"],
      [
        ...sliderStatements(oldSlider).slice(0, 1),
        ...sliderStatements(newSlider),
        `move = RateMove($${RATE_MOVE_STATE.old}, $${RATE_MOVE_STATE.new})`,
        'more = Accordion([AccordionItem("more", "More settings", [oldControl])])',
        sliderStatements(oldSlider)[1],
        "tasks = GuidedTasks([task1, task2])",
        `task1 = GuidedTask(${str(task1.text)}, $new == ${num(task1.to)})`,
        `task2 = GuidedTask(${str(task2.text)}, $old == ${num(task2.to)})`,
      ],
    );
  },
});

/** The tutor run's recipes. */
export const SET_TUTOR: Recipe[] = [rateMove];
