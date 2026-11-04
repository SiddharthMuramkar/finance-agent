import { z } from "zod";
import { defineRecipe, program, str } from "../define";

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

const item = z.object({
  name: z.string().trim().min(2).max(50).refine((t) => words(t) <= 6, "a name is at most 6 words"),
  reason: z.string().trim().min(5).max(160).refine((t) => words(t) <= 20, "a reason is at most 20 words"),
});

/**
 * The order the Learner sees: a fixed shuffle that is never already right (a stride coprime to n, else reversed),
 * so the same params always draw the same Widget.
 */
export function shuffled(n: number): number[] {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  for (let k = Math.floor(n / 2) + 1; k < n + n; k++) {
    if (gcd(k, n) !== 1) continue;
    const order = Array.from({ length: n }, (_, i) => (i * k) % n);
    if (order.some((v, i) => v !== i)) return order;
  }
  return Array.from({ length: n }, (_, i) => n - 1 - i);
}

/** Put things in order, then check. */
export const rank = defineRecipe({
  id: "rank",
  archetype: "Rank",
  summary:
    "Put 2 to 8 things in order between two ends (for example liquidity, risk or safety), then check. List them from the low end to the high end, each with the reason it sits there; code scrambles them for the Learner and checks the order.",
  params: {
    inputs: z.object({
      prompt: z.string().trim().min(5).max(120),
      lowLabel: z.string().trim().min(2).max(40).describe('The low end, e.g. "Hardest to turn into cash"'),
      highLabel: z.string().trim().min(2).max(40).describe('The high end, e.g. "Easiest to turn into cash"'),
      items: z.array(item).min(2).max(8).describe("From the low end to the high end"),
    }),
    refs: z.object({}),
    facts: z.object({}),
  },
  budget: { controls: 0, numbers: 0, visuals: 1, words: 12 },
  examples: [
    {
      title: "How fast can you turn each into cash?",
      inputs: {
        prompt: "Put these in order, hardest to turn into cash first",
        lowLabel: "Hardest to turn into cash",
        highLabel: "Easiest to turn into cash",
        items: [
          { name: "A house", reason: "A house takes months to sell." },
          { name: "A fixed deposit", reason: "A fixed deposit can be broken, with a penalty." },
          { name: "Money in your savings account", reason: "A savings account can be withdrawn the same day." },
          { name: "Cash in your wallet", reason: "Cash is already cash." },
        ],
      },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs: p }) => {
    const order = shuffled(p.items.length);
    // order[j] is the index (in p.items) of the j-th thing the Learner sees.
    const shown = order.map((i) => p.items[i]);
    const correct = p.items.map((_, i) => order.indexOf(i));
    const list = (xs: string[]) => `[${xs.map(str).join(", ")}]`;
    return program(title, ["order"], [`order = Rank(${str(p.prompt)}, ${list(shown.map((s) => s.name))}, [${correct.join(", ")}], ${list(shown.map((s) => s.reason))}, ${str(p.lowLabel)}, ${str(p.highLabel)})`]);
  },
});
