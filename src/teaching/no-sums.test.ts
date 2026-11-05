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
    "What is the present value of $5,000 received in one year, discounted at 5%?",
    "On the ladder, BBB- is the last investment-grade notch. How many notches below BBB- is B?",
    "Using the same ladder, how many notches apart are BB+ and CCC+?",
    "A firm has revenue of $2,000 million and an operating loss of $3,200 million. What is its operating margin?",
    "The risk-free rate is 4% and the premium is 6%. What is its cost of equity?",
    "A bank reports gross NPAs of Rs 5,000 crore on loans of Rs 100,000 crore. What is its gross NPA ratio?",
    "Revenue was 900 for the year and 400 for H1. What was its revenue for the twelve months to June?",
    "A policy pays Rs 10,00,000 if an event happens, with 1% odds. What is the actuarially fair annual premium?",
    "They redo the arithmetic and get it right.",
    "They name correct notch counts.",
    "Say what you recomputed with the Case Data.",
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
    "What is the present value of a promise, in your own words?",
    "What is its business model?",
    "Why does a lower margin worry lenders?",
  ])("passes a story or lingo ask: %s", (text) => {
    expect(sumAsk(text)).toBeNull();
  });
});
