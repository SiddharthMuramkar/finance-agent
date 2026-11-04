import { moneyRecipe } from "./grow-money";

/** What a loan really costs: the monthly instalment, and a money pile that splits the loan from the interest on it. */
export const loanCost = moneyRecipe({
  id: "loan_cost",
  archetype: "Compare",
  summary: "EMI and what a loan really costs (the emi calculator: principal, ratePercent, years): the monthly instalment plus a money pile that splits what you borrowed from the interest you pay, one input on a slider.",
  calculators: ["emi"],
  stat: "Monthly instalment",
  examples: [
    {
      title: "What does a ₹10 lakh home loan really cost?",
      inputs: { calculator: "emi", currency: "inr", held: { principal: 1_000_000, years: 20 }, slider: { input: "ratePercent", label: "Yearly interest rate", unit: "percent", min: 6, max: 12, step: 0.25, start: 8.5 } },
      refs: {},
      facts: {},
    },
    {
      title: "How long should I take a car loan for?",
      inputs: { calculator: "emi", held: { principal: 800_000, ratePercent: 9 }, slider: { input: "years", label: "Years to repay", unit: "years", min: 1, max: 10, step: 1, start: 5 } },
      refs: {},
      facts: {},
    },
    {
      title: "How much interest will I pay on a personal loan?",
      inputs: { calculator: "emi", held: { ratePercent: 12, years: 3 }, slider: { input: "principal", label: "Amount you borrow", unit: "inr", min: 50_000, max: 500_000, step: 10_000, start: 200_000 }, caption: "A 3 year loan at 12%" },
      refs: {},
      facts: {},
    },
  ],
});
