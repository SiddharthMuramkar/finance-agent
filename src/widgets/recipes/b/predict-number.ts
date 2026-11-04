import { z } from "zod";
import { caseDataRef, defineRecipe, num, program, str } from "../define";

const UNITS = ["percent", "pp", "bp", "years", "inr", "usd", "grams", "x"] as const;

/** A guess before the record: the Learner locks in a number, then sees the Case Data figure. */
export const predictNumber = defineRecipe({
  id: "predict_number",
  archetype: "Predict",
  summary:
    "A guess before the answer: the Learner drags a marker to a number, then sees the real figure, which is the first or last point of a Case Data series in the same unit. While that data is withheld (before the reveal), the guess waits.",
  params: {
    inputs: z
      .object({
        prompt: z.string().trim().min(5).max(120).describe("What to guess, in a question"),
        unit: z.enum(UNITS).describe("The unit of the series, so the guess and the record agree"),
        min: z.number(),
        max: z.number(),
        step: z.number().positive(),
        start: z.number().optional().describe("Where the marker starts. Default: the middle"),
        point: z.enum(["first", "last"]).default("last").describe("Which point of the series is the answer"),
        actualLabel: z.string().trim().max(40).optional().describe('Names the real figure, e.g. "The Sensex on 31 March 1992"'),
        revealsAt: z.string().trim().max(40).optional().describe('When the data is revealed, in words, e.g. "31 March 1992"'),
      })
      .superRefine((p, ctx) => {
        if (!(p.min < p.max)) ctx.addIssue({ code: "custom", message: "min must be below max" });
        else if (p.start !== undefined && (p.start < p.min || p.start > p.max)) ctx.addIssue({ code: "custom", message: "start must lie between min and max" });
        else if ((p.max - p.min) / p.step > 10_000) ctx.addIssue({ code: "custom", message: "the step is too small for the range" });
      }),
    refs: z.object({ dataset: caseDataRef }),
    facts: z.object({}),
  },
  budget: { controls: 0, numbers: 1, visuals: 0, words: 12 },
  examples: [
    { title: "How fast did the Sensex grow?", inputs: { prompt: "A steady yearly rate from 1979 to 1992: your guess?", unit: "percent", min: 0, max: 60, step: 1, start: 10, point: "last", revealsAt: "31 March 1992" }, refs: { dataset: "sensex-1992/sensex-close" }, facts: {} },
    { title: "Gold in rupees", inputs: { prompt: "What does 10 grams of gold cost?", unit: "inr", min: 0, max: 100_000, step: 1000, point: "first", actualLabel: "The record" }, refs: { dataset: "reference/gold-inr-10g" }, facts: {} },
  ],
  compile: ({ title, inputs: p, refs }) => {
    const start = p.start ?? (p.min + p.max) / 2;
    const query = `data = Query("case_data", {dataset: ${str(refs.dataset)}}, {rows: [], label: "", unit: "", source: "", sourceUrl: "", asOf: "", revealed: false, error: ""})`;
    const pick = p.point === "first" ? "@First" : "@Last";
    const tail = [p.actualLabel ?? (p.revealsAt ? "The record" : undefined), p.revealsAt].filter((x): x is string => x !== undefined).map(str);
    const guess = `guess = Predict(${str(p.prompt)}, $guess, ${num(p.min)}, ${num(p.max)}, ${num(p.step)}, ${str(p.unit)}, ${pick}(data.rows.value)${tail.length ? `, ${tail.join(", ")}` : ""})`;
    return program(title, ["guess"], [`$guess = ${num(start)}`, query, guess]);
  },
});
