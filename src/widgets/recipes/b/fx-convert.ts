import { z } from "zod";
import { caseDataRef, defineRecipe, num, program, rangeProblems, sliderShape, sliderStatements, str, taskStatements, type CompiledSlider } from "../define";
import { ICON_NAMES } from "../../primitives/wave1/icons";

const QUERY = `{rows: [], label: "", unit: "", source: "", sourceUrl: "", asOf: "", revealed: false, error: ""}`;

/** What rupees buy of a thing priced in dollars, as the exchange rate moves. */
export const fxConvert = defineRecipe({
  id: "fx_convert",
  archetype: "Convert",
  summary:
    "What an amount in rupees buys of a thing priced in dollars as the rupee-per-dollar rate moves (the rate is the Learner's slider), drawn as the thing itself. refs.rate (reference/usd-inr) outlines what it bought at the real rate. Give the dollar price of one unit from a series (refs.unitPrice) or as a fact (an Illustration).",
  params: {
    inputs: z
      .object({
        amountInr: z.number().positive().describe("The rupees held fixed"),
        object: z.enum(ICON_NAMES as [string, ...string[]]),
        thing: z.string().trim().min(2).max(40).describe('What the icons count, e.g. "Gold bars ₹1 lakh buys"'),
        perIcon: z.string().trim().max(40).optional().describe('What one icon stands for, e.g. "1 bar = 1 g"'),
        slider: z.object({ label: z.string().trim().min(2).max(40), ...sliderShape }).describe("Rupees for 1 dollar"),
      })
      .superRefine((p, ctx) => {
        for (const message of rangeProblems(p.slider)) ctx.addIssue({ code: "custom", message: `slider: ${message}` });
        if (p.slider.min <= 0) ctx.addIssue({ code: "custom", message: "slider: the rate must stay above 0" });
      }),
    refs: z.object({
      rate: z.literal("reference/usd-inr").optional().describe("The real rupees-per-dollar rate, drawn as outlines for comparison"),
      unitPrice: caseDataRef.optional().describe("A series that gives the dollar price of one unit"),
    }),
    facts: z.object({ unitPriceUsd: z.number().positive().optional().describe("The dollar price of one unit, when no series gives it") }),
  },
  budget: { controls: 1, numbers: 0, visuals: 1, words: 12 },
  examples: [
    {
      title: "What the rupee's fall does to your gold",
      inputs: { amountInr: 100_000, object: "gold-bar", thing: "Gold bars ₹1 lakh buys", perIcon: "1 bar = 1 g", slider: { label: "Rupees for 1 dollar", min: 60, max: 110, step: 5, start: 80 } },
      refs: { rate: "reference/usd-inr" },
      facts: { unitPriceUsd: 50 },
    },
    {
      title: "Dollars and the rupee",
      inputs: { amountInr: 50_000, object: "coin", thing: "Dollars ₹50,000 is worth", slider: { label: "Rupees for 1 dollar", min: 60, max: 110, step: 5, start: 80 } },
      refs: { rate: "reference/usd-inr" },
      facts: { unitPriceUsd: 1 },
    },
  ],
  compile: ({ title, inputs: p, refs, facts }) => {
    if ((refs.unitPrice === undefined) === (facts.unitPriceUsd === undefined)) throw new Error("give the dollar price of one unit exactly once: refs.unitPrice (a series) or facts.unitPriceUsd");
    const control: CompiledSlider = { name: "control", variable: "rate", label: p.slider.label, range: p.slider, unit: "inr" };
    const statements = [...sliderStatements(control)];
    let price: string;
    if (refs.unitPrice) {
      statements.push(`price = Query("case_data", {dataset: ${str(refs.unitPrice)}}, ${QUERY})`);
      price = "@Last(price.rows.value)";
    } else price = num(facts.unitPriceUsd!);
    const count = `${num(p.amountInr)} / ($rate * ${price})`;
    let compare = "";
    if (refs.rate) {
      statements.push(`fx = Query("case_data", {dataset: ${str(refs.rate)}}, ${QUERY})`);
      compare = `, ${num(p.amountInr)} / (@Last(fx.rows.value) * ${price}), "neutral"`;
    }
    statements.push(`view = Pictogram(${str(p.object)}, ${count}, ${str(p.thing)}, ${str(p.perIcon ?? "")}${compare})`);
    const tasks = taskStatements([control])!;
    return program(title, ["control", "view", tasks.name], [...statements, ...tasks.statements]);
  },
});
