import { trim, share } from "@/finance/signal/formatters";
import { LEVERS, leverBand, PRICE, REFERENCE, type Lever, type LeverKey } from "@/finance/signal/levers";

// Home's levers scroll story (Signal spec 7.2.3): the four lever steps' story and power sentences. The power sentences
// are worked out from the levers model, never hard-coded, so they follow the engine (#18). Read on the server; the
// client story gets strings only, so the valuation engine never ships to the browser for it.

/** The story sentence for each lever, as the spec writes it. */
const STORY: Record<LeverKey, string> = {
  rev: "Revenue in year 10: **$39bn**, against $1.1bn today.",
  margin: "Operating margin once mature: **10%**. Today it is −36.7%.",
  s2c: "**$3.00** of sales for each dollar it invests to grow.",
  wacc: "Cost of capital while it grows: **12.84%** a year.",
};

/** A lever setting in the slider's own unit. */
export function setting(lever: Lever, value: number): string {
  if (lever.key === "rev") return `$${trim(value, 0)}bn`;
  if (lever.key === "s2c") return `$${value.toFixed(2)}`;
  return `${trim(value, 2)}%`;
}

export type LeverStep = { key: LeverKey; name: string; story: string; power: string };

/** The four lever steps, in display order, each with its power sentence from the model. */
export function leverSteps(): LeverStep[] {
  const bands = LEVERS.map((lever) => ({ lever, band: leverBand(lever.key, REFERENCE) }));
  const reachers = bands.filter(({ band }) => band.atMax >= band.atMin && band.reach !== null).length;
  return bands.map(({ lever, band }) => {
    let power: string;
    if (band.atMax < band.atMin) {
      power = `This lever runs backwards. More risk means less value: from **${share(band.atMin)}** at the safest setting down to **${share(band.atMax)}** at the riskiest.`;
    } else {
      const range = `On its own it can move his value anywhere from **${share(band.lo)}** to **${share(band.hi)}** a share.`;
      if (band.reach === null) power = `${range} It cannot reach the $${PRICE} price by itself.`;
      else if (reachers === 1) power = `${range} It is the only lever that reaches the $${PRICE} price by itself, at ${setting(lever, band.reach)}.`;
      else power = `${range} It reaches the $${PRICE} price by itself, at ${setting(lever, band.reach)}.`;
    }
    return { key: lever.key, name: lever.name, story: STORY[lever.key], power };
  });
}
