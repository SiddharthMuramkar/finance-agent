// The one place formula.js is called from. Its functions return an Error value instead of
// throwing and use the spreadsheet sign convention (money paid out is negative); the
// Finance Calculations wrap them so callers see plain numbers and exceptions.

export function numberOrThrow(value: unknown): number {
  if (value instanceof Error) throw value;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("The formula did not give a number.");
  return value;
}

/** Yearly percentage to a fraction: 5 -> 0.05. */
export const fraction = (percent: number) => percent / 100;
export const percent = (fractionValue: number) => fractionValue * 100;
