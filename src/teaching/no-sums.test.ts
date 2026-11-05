import { describe, expect, it } from "vitest";
import { sumAsk } from "./no-sums.ts";

describe("sumAsk", () => {
  it.each([
    "How many basis points did the rate move?",
    "Can you work out how much ₹2,000 grows to?",
    "Calculate the new EMI.",
    "What is 0.25% in basis points?",
    "So what's 3% of ₹10,000 worth?",
    "If you add 50 bp to 6.5%, what rate do you get?",
    "What would ₹1 lakh be worth after 10 years?",
    "1.2 points times 100 is how many bp?",
    "Compute the debt to equity ratio.",
    "Figure out the yearly growth.",
    "What's 6% minus 4%?",
    "Give it to two decimal places.",
  ])("flags a sum: %s", (text) => {
    expect(sumAsk(text)).not.toBeNull();
  });

  it.each([
    "What does a basis point mean to you?",
    "Which would you pick and why: 7% or 7.5%?",
    "Why did the Fed move in February 1994?",
    "What is the point of quoting moves in bps?",
    "How many people lined up outside the bank?",
    "WeWork said revenue was $1.8 billion. Sound like a lot?",
    "Say it in your own words: what is a percentage point?",
    "RBI cut by 0.25%. What do traders call that move?",
    "Which headline gets the 1994 move right?",
    "What happened to Satyam's cash, do you think?",
    "Its compute costs fell. Why might that matter?",
    "ETFs work out a NAV each day. What is a NAV?",
  ])("passes a story or lingo ask: %s", (text) => {
    expect(sumAsk(text)).toBeNull();
  });
});
