import { z } from "zod";
import { defineRecipe, program, str } from "../define";

const question = z
  .object({
    question: z.string().trim().min(5).max(140),
    options: z.array(z.string().trim().min(1).max(60)).min(2).max(4),
    answer: z.number().int().min(0).nullable().describe("The index of the right option, from 0; null makes it a poll with no right answer"),
    why: z.string().trim().min(5).max(160).describe("One sentence on why: shown after the pick"),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.answer !== null && q.answer >= q.options.length) ctx.addIssue({ code: "custom", message: `answer ${q.answer} is not one of the ${q.options.length} options (0 to ${q.options.length - 1})` });
  });

const texts = (q: z.output<typeof question>) => [q.question, ...q.options, q.why];

/** One to three quick questions with feedback after each pick, and a score when there are several. */
export const quickCheck = defineRecipe({
  id: "quick_check",
  archetype: "Check",
  summary:
    "A short quiz: one to three multiple-choice questions, each with the right answer and a one-sentence why shown after the pick (answer null makes a poll). With two or more graded questions it adds a score. If any question text uses a number, set facts.illustrative to true.",
  params: {
    inputs: z.object({ questions: z.array(question).min(1).max(3) }).strict(),
    refs: z.object({}).strict(),
    facts: z.object({ illustrative: z.literal(true).optional().describe("True when the questions use made-up numbers: the Widget becomes an Illustration") }).strict(),
  },
  budget: { controls: 0, numbers: 1, visuals: 0, words: 12 },
  examples: [
    {
      title: "Is the present value of money today or later bigger?",
      inputs: {
        questions: [
          { question: "Which is worth more today?", options: ["₹1,000 in 5 years", "₹1,000 in 10 years", "They're worth the same"], answer: 0, why: "The sooner money arrives, the fewer years it is discounted." },
          { question: "The discount rate goes up. A payment due in 10 years is now worth…", options: ["More today", "Less today", "The same"], answer: 1, why: "When money could earn more now, waiting costs more." },
        ],
      },
      refs: {},
      facts: { illustrative: true },
    },
    {
      title: "Do I understand what an EMI is?",
      inputs: {
        questions: [
          { question: "What does a longer loan do to your monthly EMI?", options: ["Raises it", "Lowers it", "Nothing"], answer: 1, why: "The same loan is spread over more months." },
          { question: "And to the total interest you pay?", options: ["Raises it", "Lowers it", "Nothing"], answer: 0, why: "You owe the bank for more months, so interest builds for longer." },
          { question: "Is a lower rate always the cheaper loan?", options: ["Yes", "Not if the fees are high"], answer: 1, why: "Fees add to the cost, so compare the total you repay." },
        ],
      },
      refs: {},
      facts: {},
    },
    {
      title: "Would you rather have money now or later?",
      inputs: { questions: [{ question: "Offered the same sum today or next year, which do you take?", options: ["Today", "Next year"], answer: null, why: "Most people take today: money in hand can earn something while waiting costs you." }] },
      refs: {},
      facts: {},
    },
  ],
  compile: ({ title, inputs: p, facts }) => {
    if (!facts.illustrative && p.questions.some((q) => texts(q).some((t) => /\d/.test(t)))) {
      throw new Error("The questions use numbers: set facts.illustrative to true, so the Widget is an Illustration (the numbers are made up, not sourced).");
    }
    const names = p.questions.map((_, i) => `q${i + 1}`);
    const statements = [
      ...names.map((n) => `$${n} = -1`),
      ...p.questions.map((q, i) => `${names[i]} = QuickCheck(${str(q.question)}, [${q.options.map(str).join(", ")}], ${q.answer ?? -1}, ${str(q.why)}, $${names[i]})`),
    ];
    const graded = p.questions.flatMap((q, i) => (q.answer === null ? [] : [`($${names[i]} == ${q.answer} ? 1 : 0)`]));
    const children = [...names];
    if (graded.length >= 2) {
      statements.push(`score = Stat("Your score", ${graded.join(" + ")}, "of ${graded.length}")`);
      children.push("score");
    }
    return program(title, children, statements);
  },
});
