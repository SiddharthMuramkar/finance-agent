import { z } from "zod";
import { NEW_RANGE, OLD_RANGE } from "@/widgets/primitives/signal-prototype/rate-sizes-model";
import { RATE_MOVE_LABELS, RATE_MOVE_MAX } from "@/widgets/primitives/wave2/rate-move-marking";
import { dragStep } from "@/widgets/slider-steps";
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

/**
 * PROTOTYPE (ticket #5, Prototype B): the Signal rates card (spec §6.5) as an OpenUI Lang program. The RateSizes part draws
 * the card; the two sliders are ordinary Slider parts in its slots, bound to $new and $old, so Reset, saved Widget state
 * and the Tutor's reading of the rates work unchanged. $called holds the Learner's taps (a bit per option) and saves as
 * Widget state. The pipeline forces what the spec does not have: percent sliders move in 0.01 steps (the spec: 0.05 and
 * 0.25), and every slider needs a Guided Task, so two tasks follow the card, hidden until the call.
 */
function callProgram(title: string, old: number, next: number): string {
  const step = 0.01;
  const newSlider: CompiledSlider = { name: "control", variable: RATE_MOVE_STATE.new, label: "New rate", range: { ...NEW_RANGE, step, start: next }, unit: "percent" };
  const oldSlider: CompiledSlider = { name: "oldControl", variable: RATE_MOVE_STATE.old, label: "Old rate", range: { ...OLD_RANGE, step, start: old }, unit: "percent" };
  // A low old rate shows the same move as a bigger percent; from 2% already, a high one shows it smaller.
  const low = old === 2 ? 6 : 2;
  const [declareOld, oldControl] = sliderStatements(oldSlider);
  return program(
    title,
    ["sizes", "tasks"],
    [
      declareOld,
      ...sliderStatements(newSlider),
      oldControl,
      "$called = 0",
      `sizes = RateSizes(${num(old)}, ${num(next)}, $${RATE_MOVE_STATE.old}, $${RATE_MOVE_STATE.new}, $called, [control], [oldControl])`,
      "tasks = GuidedTasks([task1, task2])",
      `task1 = GuidedTask(${str("Move the new rate to the old rate, {old}%, and watch all three sizes shrink to nothing")}, $new == $old, $called > 0 && $old >= ${num(NEW_RANGE.min)} && $old <= ${num(NEW_RANGE.max)}, {old: $old})`,
      `task2 = GuidedTask(${str(`Set the old rate to ${num(low)}% and read the percent size again`)}, $old == ${num(low)}, $called > 0)`,
    ],
  );
}

export const rateMove = defineRecipe({
  id: "rate_move",
  archetype: "Convert",
  summary:
    "One rate moving from old to new (in percent, 0 to 20, steps of 0.01): an arrow on a number line, with three story lines code writes, a reporter's move in points, a trader's in basis points and a headline's percent of the old rate, said as quotes, never as sums. mode show (default) shows the lines and keeps sliders for play; mode practice hides the lines until the Learner taps the right reading of the move (the right one, the times-10 slip or the percent mix-up), marks the tap, then reveals them. mode call (prototype, old 1 to 8, new 2 to 7, a real move): the Learner taps each reading they believe (up 1%, up 1 point, up 25%) before the rulers, sizes and sliders unlock. The one rate Widget: use it for any rate change, never a free-form one.",
  params: {
    inputs: z
      .object({
        old: rate.describe("The old rate, in percent"),
        new: rate.describe("The new rate, in percent"),
        mode: z
          .enum(["show", "practice", "call"])
          .default("show")
          .describe("show: the three lines at once. practice: the Learner taps the right reading of the move first. call: the Signal card (prototype): the Learner taps every reading they believe before anything unlocks"),
      })
      .strict()
      // PROTOTYPE (ticket #5, Prototype B): the Signal card's ranges (spec §6.5.1, §8.2). The spec clamps a state out of
      // range; the recipe pipeline refuses it with a reason, so the Tutor calls again. A call needs a move to ask about.
      .superRefine((p, ctx) => {
        if (p.mode !== "call") return;
        if (p.old < OLD_RANGE.min || p.old > OLD_RANGE.max) ctx.addIssue({ code: "custom", path: ["old"], message: `in mode call the old rate is ${OLD_RANGE.min} to ${OLD_RANGE.max}` });
        if (p.new < NEW_RANGE.min || p.new > NEW_RANGE.max) ctx.addIssue({ code: "custom", path: ["new"], message: `in mode call the new rate is ${NEW_RANGE.min} to ${NEW_RANGE.max}` });
        if (p.old === p.new) ctx.addIssue({ code: "custom", path: ["new"], message: "in mode call the rates must differ: the call asks about a move" });
      }),
    refs: z.object({}).strict(),
    facts: z.object({}).strict(),
  },
  budget: { controls: 2, numbers: 0, visuals: 1, words: 12 },
  examples: [
    { title: "A savings rate from 4% to 5%", inputs: { old: 4, new: 5 }, refs: {}, facts: {} },
    { title: "A loan rate cut from 7.5% to 7.2%", inputs: { old: 7.5, new: 7.2, mode: "show" }, refs: {}, facts: {} },
    { title: "Your turn: 3% to 3.25%", inputs: { old: 3, new: 3.25, mode: "practice" }, refs: {}, facts: {} },
    { title: "One move, three sizes", inputs: { old: 4, new: 5, mode: "call" }, refs: {}, facts: {} },
    { title: "A rate cut from 8% to 7%", inputs: { old: 8, new: 7, mode: "call" }, refs: {}, facts: {} },
  ],
  compile: ({ title, inputs: p }) => {
    if (p.mode === "practice") return program(title, ["move"], [`move = RateMove(${num(p.old)}, ${num(p.new)}, "practice")`]);
    if (p.mode === "call") return callProgram(title, p.old, p.new);
    const range = { min: 0, max: MAX_RATE, step: 0.01 };
    const newSlider: CompiledSlider = { name: "control", variable: RATE_MOVE_STATE.new, label: "New rate", range: { ...range, start: p.new }, unit: "percent" };
    const oldSlider: CompiledSlider = { name: "oldControl", variable: RATE_MOVE_STATE.old, label: "Old rate", range: { ...range, start: p.old }, unit: "percent" };
    // Optional play (spec #229, #533): move the new rate back to the old one and watch the move shrink to nothing, then
    // set the old rate to the first new rate and see the same gap run the other way (same points and bp, a different
    // headline, since the base changed). When there is no move, or the mirror would start from 0% (which has no percent
    // change), each slider goes 5 points away instead, never to 0%.
    // B7: the tasks are written from the Widget as it stands. The first names the old rate as it is now (restored play
    // may have moved it to 4.31%), and ticks when the new rate reaches it. The second names the old rate that makes the
    // same gap run the other way from the new rate as it is now (the new rate plus the first gap), so its claim holds at
    // any settings; it is hidden only when that rate falls outside 0% to 20% (or at 0%, which has no percent change), and
    // ticks within one drag step of it.
    const moved = p.new !== p.old;
    const gap = Number((p.new - p.old).toFixed(10));
    const to = gap >= 0 ? `$new + ${num(gap)}` : `$new - ${num(-gap)}`;
    const near = num(dragStep({ ...range, unit: "percent" }));
    const task1 = moved
      ? { text: "Move the new rate to the old rate, {old}%, and watch the move shrink to nothing", done: "$new == $old", extra: ", true, {old: $old}" }
      : { text: `Move the new rate to ${num(away(p.new))}% and read the lines again`, done: `$new == ${num(away(p.new))}`, extra: "" };
    const task2 = moved
      ? {
          text: "Now set the old rate to {to}% and see the same gap run the other way",
          done: `$old != null && $new != null && $old >= ${to} - ${near} && $old <= ${to} + ${near}`,
          extra: `, ${to} > 0 && ${to} <= ${num(MAX_RATE)}, {to: ${to}}`,
        }
      : { text: `Set the old rate to ${num(away(p.old))}% and read the lines again`, done: `$old == ${num(away(p.old))}`, extra: "" };
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
        `task1 = GuidedTask(${str(task1.text)}, ${task1.done}${task1.extra})`,
        `task2 = GuidedTask(${str(task2.text)}, ${task2.done}${task2.extra})`,
      ],
    );
  },
});

/** The tutor run's recipes. */
export const SET_TUTOR: Recipe[] = [rateMove];
