import { trim, share } from "@/finance/signal/formatters";
import { LEVERS, leverBand, PRICE, REFERENCE, type Lever, type LeverKey } from "@/finance/signal/levers";

// Home's levers scroll story (Signal spec 7.2.3): the four lever steps' story and power sentences. The power sentences
// are worked out from the levers model, never hard-coded, so they follow the engine (#18). Read on the server; the
// client story gets strings only, so the valuation engine never ships to the browser for it.

/** The story sentence for each lever, in plain words and round numbers (#74, spec §7.2.3). */
const STORY: Record<LeverKey, string> = {
  rev: "Sales in year 10: **$39 billion**, against $1.1 billion today.",
  margin: "Once grown, it **keeps 10¢ of each $1** of sales. Today it loses 37¢.",
  s2c: "Each **$1 it invests** to grow brings **$3** of new sales.",
  wacc: "While it grows, **investors want 13% a year** for the risk.",
};

/** A lever setting in the slider's own unit. */
export function setting(lever: Lever, value: number): string {
  if (lever.key === "rev") return `$${trim(value, 0)} billion`;
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
      const range = `On its own it can move the value anywhere from **${share(band.lo)}** to **${share(band.hi)}** a share.`;
      if (band.reach === null) power = `${range} It cannot reach the $${PRICE} price by itself.`;
      else if (reachers === 1) power = `${range} It is the only lever that reaches the $${PRICE} price by itself, at ${setting(lever, band.reach)}.`;
      else power = `${range} It reaches the $${PRICE} price by itself, at ${setting(lever, band.reach)}.`;
    }
    return { key: lever.key, name: lever.name, story: STORY[lever.key], power };
  });
}
