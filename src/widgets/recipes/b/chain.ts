import { z } from "zod";
import { defineRecipe, program, str } from "../define";

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

const step = z.object({
  title: z.string().trim().min(2).max(60).refine((t) => words(t) <= 8, "a step title is at most 8 words"),
  body: z.string().trim().min(5).max(200).refine((t) => words(t) <= 25, "a step body is at most 25 words, with no formulas in symbols (use a Formula Card)"),
  highlight: z.enum(["you", "src", "neutral"]).optional().describe("you = the Learner's assumption, src = sourced, neutral = worked out"),
});

/** Cause and effect, one step at a time. */
export const chain = defineRecipe({
  id: "chain",
  archetype: "Chain",
  summary:
    "A chain of cause and effect or a worked story, one step at a time with Back and Next (2 to 6 steps, a few plain words each). No numbers in the words unless you set facts.numbers, which makes the Widget an Illustration; no formulas with symbols.",
  params: {
    inputs: z.object({ steps: z.array(step).min(2).max(6) }),
    refs: z.object({}),
    facts: z.object({ numbers: z.literal(true).optional().describe("Set only when the steps quote numbers you worked out yourself") }),
  },
  budget: { controls: 0, numbers: 0, visuals: 1, words: 12 },
  examples: [
    {
      title: "Why prices rise when money is printed",
      inputs: {
        steps: [
          { title: "More money appears", body: "The central bank creates more money than the economy grew.", highlight: "neutral" },
          { title: "People spend it", body: "Buyers have more to spend on the same goods.", highlight: "neutral" },
          { title: "Prices rise", body: "Sellers ask more, so each note buys less than before.", highlight: "neutral" },
        ],
      },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs: p, facts }) => {
    if (!facts.numbers) {
      const typed = p.steps.find((s) => /\d/.test(`${s.title} ${s.body}`));
      if (typed) throw new Error(`the step "${typed.title}" has a number in it; numbers you type are facts. Take them out, or set facts.numbers to true`);
    }
    if (p.steps.some((s) => /[\^=]/.test(s.body))) throw new Error("a step body has a formula in symbols; show a named formula with the formula recipe instead");
    const steps = p.steps.map((s) => `Step(${[str(s.title), str(s.body), str(s.highlight ?? "neutral")].join(", ")})`);
    return program(title, ["steps"], [`steps = StepThrough([${steps.join(", ")}])`]);
  },
});
