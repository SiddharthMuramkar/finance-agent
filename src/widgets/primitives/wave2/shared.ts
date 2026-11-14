import { formatAmount } from "../wave1/format";

// What the wave 2 parts share: how an amount in a currency reads, and the arrow keys.

export type Currency = "inr" | "usd";

/** An amount in its currency: rupees with lakh and crore, dollars short. Rupees is the default. */
export function money(value: number, currency: Currency | undefined): string {
  return formatAmount(value, currency ?? "inr");
}

/** The step an arrow key asks for: left and down are back, right and up are forward; null for any other key. */
export function arrowStep(key: string): -1 | 1 | null {
  if (key === "ArrowLeft" || key === "ArrowDown") return -1;
  if (key === "ArrowRight" || key === "ArrowUp") return 1;
  return null;
}
