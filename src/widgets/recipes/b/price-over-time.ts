import { z } from "zod";
import { defineRecipe, num, program, rangeProblems, sliderShape, sliderStatements, str, taskStatements, type CompiledSlider } from "../define";

const slider = z.object({
  on: z.enum(["years", "ratePercent"]).describe("What the Learner moves: the years, or the yearly price rise"),
  label: z.string().trim().min(2).max(40),
  ...sliderShape,
});

/** What a price (or a printed note) becomes as the years pass, with one of years and the yearly rise on a slider. */
export const priceOverTime = defineRecipe({
  id: "price_over_time",
  archetype: "Grow",
  summary:
    'What a price becomes with the years (show "price": one thing\'s price rising, PriceTag) or what a printed note still buys ("note": ShrinkingNote). One of years and the yearly price rise is on a slider, the other held. The starting price is a fact, so the Widget is an Illustration.',
  params: {
    inputs: z
      .object({
        show: z.enum(["price", "note"]),
        item: z.string().trim().min(2).max(40).optional().describe('What is priced, e.g. "Vada pav" (needed for show "price")'),
        currency: z.enum(["inr", "usd"]).default("inr"),
        held: z.object({ years: z.number().min(0).max(100).optional(), ratePercent: z.number().min(0).max(100).optional() }).describe("The one of years and ratePercent that is not on the slider"),
        slider,
      })
      .superRefine((p, ctx) => {
        const issue = (message: string) => ctx.addIssue({ code: "custom", message });
        for (const message of rangeProblems(p.slider)) issue(`slider: ${message}`);
        const other = p.slider.on === "years" ? "ratePercent" : "years";
        if (p.held[p.slider.on] !== undefined) issue(`${p.slider.on} is both held and on the slider`);
        if (p.held[other] === undefined) issue(`held.${other} is needed: it is the one the slider does not move`);
        if (p.show === "price" && !p.item) issue('item is needed for show "price"');
      }),
    refs: z.object({}),
    facts: z.object({ amount: z.number().positive().describe("Today's price of the item, or the printed value of the note") }),
  },
  budget: { controls: 1, numbers: 1, visuals: 1, words: 12 },
  examples: [
    { title: "A vada pav and the years", inputs: { show: "price", item: "Vada pav", currency: "inr", held: { ratePercent: 6 }, slider: { on: "years", label: "Years from now", min: 0, max: 30, step: 1, start: 10 } }, refs: {}, facts: { amount: 20 } },
    { title: "What a ₹100 note buys later", inputs: { show: "note", currency: "inr", held: { years: 10 }, slider: { on: "ratePercent", label: "Yearly price rise", min: 1, max: 12, step: 0.5, start: 6 } }, refs: {}, facts: { amount: 100 } },
  ],
  compile: ({ title, inputs: p, facts }) => {
    const control: CompiledSlider = { name: "control", variable: p.slider.on, label: p.slider.label, range: p.slider, unit: p.slider.on === "years" ? "years" : "percent" };
    const years = p.slider.on === "years" ? "$years" : num(p.held.years!);
    const rate = p.slider.on === "ratePercent" ? "$ratePercent" : num(p.held.ratePercent!);
    const part =
      p.show === "price"
        ? `view = PriceTag(${str(p.item!)}, ${num(facts.amount)}, ${rate}, ${years}, ${str(p.currency)})`
        : `view = ShrinkingNote(${num(facts.amount)}, ${rate}, ${years}, ${str(p.currency)})`;
    const tasks = taskStatements([control])!;
    return program(title, ["control", "view", tasks.name], [...sliderStatements(control), part, ...tasks.statements]);
  },
});
