import { CURRENCY_STYLE } from "@/finance/money";
import { dateText, priceText, type Money } from "@/widgets/workbench/value-levers-model";

// The Own Case's own sentences, shared by the form (src/app/assignment/own-case-form.tsx) and the Notebook note
// (src/learner/own-cases.ts), so the screen and the note always say the same thing.

/**
 * The engine's value beside the price. A value at or below zero is no price a share can have: it shows as 0 with the words
 * Value levers uses (value-levers-model.ts, nothingLeft), so no Own Case ever reads "-₹52 a share".
 */
export function ownCaseValueLine(valuePerShare: number, price: number, reportDate: string, money: Money): string {
  const beside = `beside a price of ${priceText(price, money)} on ${dateText(reportDate)}`;
  if (!(valuePerShare > 0)) return `The engine's value: ${CURRENCY_STYLE[money.currency].symbol}0 a share, ${beside}. Lenders take everything: nothing is left for shareholders.`;
  return `The engine's value: ${priceText(valuePerShare, money)} a share, ${beside}.`;
}

/** The Own Case has no field for employee stock options, so the engine counts none: said on screen and in the note. */
export const OPTIONS_NOT_ENTERED = "Employee stock options are not entered: the engine counts none.";
