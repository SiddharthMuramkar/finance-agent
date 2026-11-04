import { z } from "zod";
import { ICON_NAMES } from "../../primitives/wave1/icons";
import { caseDataRef, defineRecipe, num, program, rangeProblems, sliderStatements, str, taskStatements, type CompiledSlider } from "../define";
import { sliderBase } from "./shared";

const objects = ICON_NAMES as [string, ...string[]];

/** What an amount of money buys: pictures of the thing, from a sourced price or a made-up one, against what it bought earlier. */
export const buyingPower = defineRecipe({
  id: "buying_power",
  archetype: "Convert",
  summary:
    "What money buys: pictures of a thing (gold-bar, house, vada-pav, chai, phone, car, ...) for an amount on a slider. The price is either sourced (refs.price, a series such as reference/gold-inr-10g, newest point against the oldest) or a made-up price in facts (an Illustration). The amount is in the same currency as the price.",
  params: {
    inputs: z
      .object({
        object: z.enum(objects),
        perIcon: z.string().trim().min(3).max(30).describe('What one picture stands for, such as "1 bar = 10 g"'),
        label: z.string().trim().min(3).max(50).describe('What the pictures show, such as "What your money buys"'),
        slider: sliderBase.refine((s) => s.unit === "inr" || s.unit === "usd", "the amount's unit must be inr or usd"),
      })
      .strict()
      .superRefine((p, ctx) => {
        for (const message of rangeProblems(p.slider)) ctx.addIssue({ code: "custom", message: `slider: ${message}` });
      }),
    refs: z.object({ price: caseDataRef.optional().describe("A price series, such as reference/gold-inr-10g: what one picture costs, newest point against the oldest") }).strict(),
    facts: z
      .object({
        price: z.number().positive().optional().describe("A made-up price of one picture, when no series is given"),
        earlierPrice: z.number().positive().optional().describe("The made-up earlier price, to show what the same money bought before"),
      })
      .strict(),
  },
  budget: { controls: 1, numbers: 0, visuals: 1, words: 12 },
  examples: [
    {
      title: "How much gold could ₹1 lakh buy then and now?",
      inputs: { object: "gold-bar", perIcon: "1 bar = 10 g", label: "What your money buys in gold", slider: { label: "Money you have", unit: "inr", min: 10_000, max: 500_000, step: 10_000, start: 100_000 } },
      refs: { price: "reference/gold-inr-10g" },
      facts: {},
    },
    {
      title: "How many vada pavs can ₹200 buy?",
      inputs: { object: "vada-pav", perIcon: "1 vada pav", label: "What your money buys", slider: { label: "Money you have", unit: "inr", min: 20, max: 500, step: 20, start: 200 } },
      refs: {},
      facts: { price: 20 },
    },
    {
      title: "What did ₹100 buy in chai, then and now?",
      inputs: { object: "chai", perIcon: "1 cup of chai", label: "Cups of chai", slider: { label: "Money you have", unit: "inr", min: 20, max: 300, step: 10, start: 100 } },
      refs: {},
      facts: { price: 15, earlierPrice: 5 },
    },
  ],
  compile: ({ title, inputs: p, refs, facts }) => {
    if ((refs.price === undefined) === (facts.price === undefined)) throw new Error("Give the price either in refs.price (a sourced series) or in facts.price (a made-up price), not both and not neither.");
    if (refs.price && facts.earlierPrice !== undefined) throw new Error("facts.earlierPrice goes with facts.price; a sourced series already has its own earlier price.");
    const slider: CompiledSlider = { name: "control", variable: "amount", label: p.slider.label, range: p.slider, unit: p.slider.unit };
    const tasks = taskStatements([slider])!;
    const tone = refs.price ? "src" : "neutral";
    if (refs.price) {
      const statements = [
        ...sliderStatements(slider),
        `price = Query("case_data", {dataset: ${str(refs.price)}}, {rows: [], label: "", unit: "", source: "", sourceUrl: "", asOf: "", revealed: false})`,
        `newest = @Sort(price.rows, "date", "desc")`,
        `bars = Pictogram(${str(p.object)}, $amount / @First(newest.value), ${str(p.label)}, ${str(p.perIcon)}, $amount / @First(price.rows.value), ${str(tone)})`,
      ];
      return program(title, ["control", "bars", tasks.name], [...statements, ...tasks.statements]);
    }
    const earlier = facts.earlierPrice !== undefined ? `$amount / ${num(facts.earlierPrice)}` : "null";
    const bars = `bars = Pictogram(${str(p.object)}, $amount / ${num(facts.price!)}, ${str(p.label)}, ${str(p.perIcon)}, ${earlier}, ${str(tone)})`;
    return program(title, ["control", "bars", tasks.name], [...sliderStatements(slider), bars, ...tasks.statements]);
  },
});
