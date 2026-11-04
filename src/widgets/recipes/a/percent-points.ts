import { z } from "zod";
import { defineRecipe, num, program, rangeProblems, sliderStatements, str, taskStatements, type CompiledSlider } from "../define";
import { shortLabel, sliderBase } from "./shared";

/** How big a change in a percentage really is: a grid of 100 squares, the old value outlined, the change highlighted. */
export const percentPoints = defineRecipe({
  id: "percent_points",
  archetype: "Convert",
  summary:
    "Percent against percentage points: a 100-square Waffle for a rate on a slider, the starting rate outlined and the change highlighted, with 'Zoom into one square' for basis points. For 'what is a quarter-point rise' or 'percent vs percentage points'. The slider starts at the rate before the change; facts.before sets a different earlier rate (making it an Illustration).",
  params: {
    inputs: z
      .object({
        label: shortLabel.describe('What the rate is, such as "Policy rate"'),
        zoom: z.boolean().default(true),
        slider: sliderBase,
      })
      .strict()
      .superRefine((p, ctx) => {
        for (const message of rangeProblems(p.slider)) ctx.addIssue({ code: "custom", message: `slider: ${message}` });
        if (p.slider.unit !== "percent") ctx.addIssue({ code: "custom", message: "slider.unit must be percent" });
        if (p.slider.min < 0 || p.slider.max > 100) ctx.addIssue({ code: "custom", message: "slider must stay between 0 and 100 percent" });
      }),
    refs: z.object({}).strict(),
    facts: z.object({ before: z.number().min(0).max(100).optional().describe("The earlier rate, when it is not where the slider starts") }).strict(),
  },
  budget: { controls: 1, numbers: 0, visuals: 1, words: 12 },
  examples: [
    {
      title: "How big is a quarter-point rise in the repo rate?",
      inputs: { label: "Repo rate", slider: { label: "New rate", unit: "percent", min: 4, max: 8, step: 0.25, start: 6 } },
      refs: {},
      facts: {},
    },
    {
      title: "Percent or percentage points: what does a 2 point jump mean?",
      inputs: { label: "Savings rate", zoom: false, slider: { label: "Rate after the jump", unit: "percent", min: 2, max: 10, step: 0.5, start: 4 } },
      refs: {},
      facts: {},
    },
    {
      title: "How much more is a bank paying me now?",
      inputs: { label: "Fixed deposit rate", slider: { label: "Rate now", unit: "percent", min: 4, max: 9, step: 0.1, start: 7 } },
      refs: {},
      facts: { before: 6.5 },
    },
  ],
  compile: ({ title, inputs: p, facts }) => {
    const slider: CompiledSlider = { name: "control", variable: "rate", label: p.slider.label, range: p.slider, unit: "percent" };
    const tasks = taskStatements([slider])!;
    const before = facts.before ?? p.slider.start;
    const grid = `grid = Waffle(${str(`${p.label} before`)}, $rate, ${num(before)}, ${p.zoom ? "true" : "false"})`;
    return program(title, ["control", "grid", tasks.name], [...sliderStatements(slider), grid, ...tasks.statements]);
  },
});
