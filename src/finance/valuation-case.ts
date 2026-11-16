import { z } from "zod";
import { FORECAST_YEARS, valueStory, type DcfInputs, type DcfResult } from "./dcf-engine.ts";
import { growthScaledTo, marginPath, matureRateScaled, riskScaled } from "./dcf-paths.ts";

// A Case's valuation inputs as a Topic file holds them (spec 2026-11-12, B1 and C2): a `valuation:` block on the
// Case, in git beside the story and its sources, not in the database. Rates are percents (5 means 5%), the house
// convention and what a person writes in YAML; `toEngineInputs` turns them into the engine's fractions. Money is in
// the block's `unit` (Amazon in millions of dollars), and shares are counted in that same unit.
//
// This module imports only packages (no "@/" paths), so `scripts/check-course.mjs` can run it with Node's type stripping.

/** How close the engine must come to the published value a share for a block to say `reproduces: true` (spec, Risks). */
export const REPRODUCE_TOLERANCE = 0.02;

const yearly = (what: string) => z.array(z.number()).length(FORECAST_YEARS, `${what} lists ${FORECAST_YEARS} years`);
const yearlyRates = (what: string) => yearly(what).refine((p) => p.every((v) => v > -100), `${what} cannot be -100% or lower`);

/** The margin as a path that closes half the gap to its target each year, starting from the base year's margin. */
const halvingMargin = z
  .object({
    startPercent: z.number(),
    targetPercent: z.number(),
    /** The margin after year 10; the target when left out. */
    afterPercent: z.number().optional(),
  })
  .strict();

/** The margin written out year by year, when the source gives each year's figure. */
const yearlyMargin = z.object({ marginPercent: yearly("marginPercent"), afterPercent: z.number() }).strict();

export const valuationBlock = z
  .object({
    currency: z.enum(["USD", "INR"]),
    unit: z.enum(["millions", "crores", "billions"]),
    /** Revenue in the base year, the year before year 1. */
    baseRevenue: z.number().positive(),
    /**
     * What the base revenue is, when it is not the last full year's sales: shown in place of "Today" beside lever 1
     * (Webvan's $4.2m is its prospectus's sales from launch on 2 Jun to 30 Sep 1999: "Sales, Jun to Sep 1999").
     */
    baseRevenueLabel: z.string().trim().min(3).max(40).optional(),
    growthPercent: yearlyRates("growthPercent"),
    margin: z.union([halvingMargin, yearlyMargin]),
    /** The tax rate after year 10, and in every forecast year when `taxPercentByYear` is left out. */
    taxPercent: z.number().min(0).max(100),
    /** The tax rate in each of years 1 to 10, when the source changes it by year (Damodaran's Uber: 31% rising to 40%). */
    taxPercentByYear: yearly("taxPercentByYear").refine((p) => p.every((v) => v >= 0 && v <= 100), "taxPercentByYear lies between 0% and 100%").optional(),
    lossesCarried: z.number().min(0).default(0),
    /** Sales to capital in year 1, and in every forecast year when `salesToCapitalByYear` is left out; the lever's opening. */
    salesToCapital: z.number().positive(),
    /** Sales to capital in each of years 1 to 10, when the source changes it by year (Tesla: 3 for five years, then 2). */
    salesToCapitalByYear: yearly("salesToCapitalByYear").refine((p) => p.every((v) => v > 0), "salesToCapitalByYear is above zero").optional(),
    costOfCapitalPercent: yearlyRates("costOfCapitalPercent"),
    growthAfterPercent: z.number(),
    returnOnCapitalAfterPercent: z.number().positive(),
    cash: z.number().min(0),
    debt: z.number().min(0),
    options: z.number().min(0).default(0),
    /** Shares, counted in the block's unit (millions of shares for a Case in millions). */
    shares: z.number().positive(),
    /**
     * What a Workbench's headline values (spec B3): a share of a listed company (the default), or the whole company, for
     * a private one with no share price. A company valued whole counts one share, so the engine's value a share is the
     * company's value for its owners, and `price` is what the whole company last sold or raised money at, in the block's unit.
     */
    per: z.enum(["share", "company"]).default("share"),
    /**
     * A chance the business fails, and what is recovered if it does: a fixed amount, or a share of the going-concern value
     * (`recoveredPercentOfValue`, Tesla's and Zomato's 50%), which moves with the story when a lever moves it. The share
     * wins when both are given; `recovered` then records the amount at the Case's own story.
     */
    failure: z
      .object({
        chancePercent: z.number().min(0).max(100),
        recovered: z.number().min(0).default(0),
        recoveredPercentOfValue: z.number().min(0).max(100).optional(),
      })
      .strict()
      .optional(),
    /**
     * The price on the Case's date, for the marker on a Workbench's bar: a market price, or for a private company what it
     * last sold or raised money at. `placeholder` marks a figure the source only used to work something out (WeWork's
     * $30), which is never drawn as a price. `label` is the word shown in place of "price" when the figure is not one that
     * anyone paid, such as "talk" for the $40bn being talked about before Uber's December 2014 round closed.
     */
    price: z
      .object({
        value: z.number().positive(),
        date: z.iso.date(),
        note: z.string().trim().min(1).optional(),
        placeholder: z.boolean().optional(),
        label: z.string().trim().regex(/^[a-z][a-z ]{1,29}$/, "one or a few lower-case words, such as \"talk\"").optional(),
      })
      .strict(),
    /**
     * An illustration: a story built for teaching from the company's own figures, with no published valuation to check it
     * against (Coffee Day, Webvan). It never says it reproduces anything.
     */
    illustration: z.boolean().default(false),
    /** What the source published, which the engine is checked against. An illustration has no published value. */
    published: z
      .object({ valuePerShare: z.number().optional(), fcff: yearly("published.fcff").optional(), note: z.string().trim().min(1).optional() })
      .strict(),
    /** How the figures were built where the source's own sheet differs from the plain B1 reading (a margin path, a share count). */
    notes: z.array(z.string().trim().min(1)).optional(),
    sources: z.array(z.object({ title: z.string().trim().min(1), url: z.url() }).strict()).min(1),
    /** True when the engine comes within 2% of published.valuePerShare; the course check verifies it. */
    reproduces: z.boolean(),
  })
  .strict()
  .refine((b) => b.growthAfterPercent < b.costOfCapitalPercent[FORECAST_YEARS - 1], {
    message: "growthAfterPercent must be below the year-10 cost of capital, or the value is infinite",
    path: ["growthAfterPercent"],
  })
  .refine((b) => b.illustration || b.published.valuePerShare !== undefined, {
    message: "a Case that is not an illustration states the published value it is checked against",
    path: ["published", "valuePerShare"],
  })
  .refine((b) => !b.illustration || !b.reproduces, { message: "an illustration has no published value, so it cannot reproduce one", path: ["reproduces"] })
  .refine((b) => b.per === "share" || b.shares === 1, {
    message: 'a company valued whole (per: company) counts one share, so shares must be 1 and its value a share is the company\'s value',
    path: ["shares"],
  });

/** A `valuation:` block as written in YAML, before defaults are filled in. */
export type ValuationBlockInput = z.input<typeof valuationBlock>;
export type ValuationBlock = z.output<typeof valuationBlock>;

const fractions = (percents: readonly number[]) => percents.map((p) => p / 100);

/** The margin after year 10, as a percent. */
const marginAfterPercent = (block: ValuationBlock) =>
  "marginPercent" in block.margin ? block.margin.afterPercent : (block.margin.afterPercent ?? block.margin.targetPercent);

/** The block's percents as the engine's fractions, with the halving margin path worked out. */
export function toEngineInputs(block: ValuationBlock): DcfInputs {
  const margin =
    "marginPercent" in block.margin
      ? fractions(block.margin.marginPercent)
      : marginPath(block.margin.startPercent / 100, block.margin.targetPercent / 100);
  return {
    baseRevenue: block.baseRevenue,
    growth: fractions(block.growthPercent),
    margin,
    marginAfter: marginAfterPercent(block) / 100,
    taxRate: block.taxPercent / 100,
    ...(block.taxPercentByYear ? { taxRateByYear: fractions(block.taxPercentByYear) } : {}),
    lossesCarried: block.lossesCarried,
    salesToCapital: block.salesToCapital,
    ...(block.salesToCapitalByYear ? { salesToCapitalByYear: [...block.salesToCapitalByYear] } : {}),
    costOfCapital: fractions(block.costOfCapitalPercent),
    growthAfter: block.growthAfterPercent / 100,
    returnOnCapitalAfter: block.returnOnCapitalAfterPercent / 100,
    cash: block.cash,
    debt: block.debt,
    options: block.options,
    shares: block.shares,
    ...(block.failure ? { failure: engineFailure(block.failure, block.failure.chancePercent) } : {}),
  };
}

/** The block's failure as the engine takes it, at a given chance in percent: a share of the going concern when the block gives one. */
function engineFailure(failure: NonNullable<ValuationBlock["failure"]>, chancePercent: number): NonNullable<DcfInputs["failure"]> {
  return {
    chance: chancePercent / 100,
    recovered: failure.recovered,
    ...(failure.recoveredPercentOfValue !== undefined ? { recoveredShare: failure.recoveredPercentOfValue / 100 } : {}),
  };
}

/** The Case's own story, valued by the engine. */
export function valueCase(block: ValuationBlock): DcfResult {
  return valueStory(toEngineInputs(block));
}

/** Whether the engine's value a share is within REPRODUCE_TOLERANCE of the published one: what `reproduces` must say. */
/** The word a Case's price goes by: "price", or the block's own label when the figure is not a price anyone paid. */
export const priceWord = (block: Pick<ValuationBlock, "price">): string => block.price.label ?? "price";

export function matchesPublished(block: ValuationBlock): boolean {
  const published = block.published.valuePerShare;
  if (block.illustration || published === undefined) return false;
  const valued = valueCase(block);
  if (!valued.ok) return false;
  return Math.abs(valued.valuePerShare - published) <= REPRODUCE_TOLERANCE * Math.abs(published);
}

/**
 * The Value levers Widget's settings (spec B3). Each one left out keeps the Case's own figure, so no levers at all
 * values the Case exactly. Percents, like the block; revenue in the block's unit (60,000 for $60bn in millions).
 */
export type Levers = {
  /** "How big it gets": revenue in year 10. */
  revenueYear10?: number;
  /** "What it keeps": the operating margin once mature, in percent. */
  marginTarget?: number;
  /** "What growth costs": revenue for each unit invested. */
  salesToCapital?: number;
  /** "How risky": the cost of capital in year 1, in percent. */
  costOfCapitalGrowing?: number;
  /** "Chance it fails", in percent. */
  failureChance?: number;
  /** Growth after year 10, in percent (the Terminal seesaw, spec B4). */
  growthAfter?: number;
  /** The cost of capital after year 10, in percent: year 10's rate, the years between scaled with it (matureRateScaled). */
  costOfCapitalAfter?: number;
  /** Cash, in the block's unit (the Value bridge, spec B4). */
  cash?: number;
  /** Debt, with any leases counted as debt, in the block's unit. */
  debt?: number;
  /** The value of employee options, in the block's unit. */
  options?: number;
};

/**
 * Values the Case with the levers moved, as Appendix B.2 sets them out:
 * - revenue in year 10 scales every year's growth rate by one factor (growthScaledTo), keeping the Case's shape;
 * - the margin becomes the target of the halving path and the margin after year 10. A Case written year by year
 *   moves each year by the same share of the change the halving path would give (half in year 1, three quarters in
 *   year 2, and so on), so the lever does the same on both forms;
 * - the cost of capital moves year 1 to the lever and scales the years between, keeping year 10 (riskScaled);
 * - sales to capital replaces year 1's figure; a Case whose figure changes by year scales every year by the same factor;
 * - the chance of failure weights the business with what the Case says is recovered (a fixed amount, or its share of the
 *   going concern worked out afresh at the moved story), nothing when it says nothing;
 * - growth and the cost of capital after year 10 (spec B4, Terminal seesaw) replace the Case's; the cost of capital moves
 *   year 10 and scales the years between, keeping year 1 (matureRateScaled), after the risk lever has had its say;
 * - cash, debt and options (spec B4, Value bridge) replace the Case's, so the bridge to a share is the engine's rule 9.
 */
export function applyLevers(block: ValuationBlock, levers: Levers): DcfResult {
  const inputs = toEngineInputs(block);
  let { growth, margin, marginAfter, costOfCapital, salesToCapital, salesToCapitalByYear, failure, growthAfter, cash, debt, options } = inputs;

  if (levers.revenueYear10 !== undefined) {
    const scaled = growthScaledTo(inputs.baseRevenue, growth, levers.revenueYear10);
    if (!scaled) return { ok: false, error: `No growth path of this Case's shape reaches ${levers.revenueYear10} in year 10.` };
    growth = scaled;
  }
  if (levers.marginTarget !== undefined) {
    const target = levers.marginTarget / 100;
    if ("marginPercent" in block.margin) {
      const change = target - marginAfter;
      margin = margin.map((m, i) => m + change * (1 - 0.5 ** (i + 1)));
    } else margin = marginPath(block.margin.startPercent / 100, target);
    marginAfter = target;
  }
  if (levers.salesToCapital !== undefined) {
    // A path that changes by year keeps its shape: every year scales by the lever over the Case's year-1 figure.
    const scale = levers.salesToCapital / salesToCapital;
    salesToCapitalByYear = salesToCapitalByYear?.map((v) => v * scale);
    salesToCapital = levers.salesToCapital;
  }
  if (levers.costOfCapitalGrowing !== undefined) costOfCapital = riskScaled(costOfCapital, levers.costOfCapitalGrowing / 100);
  if (levers.failureChance !== undefined) {
    failure = block.failure ? engineFailure(block.failure, levers.failureChance) : { chance: levers.failureChance / 100, recovered: 0 };
  }
  if (levers.growthAfter !== undefined) growthAfter = levers.growthAfter / 100;
  if (levers.costOfCapitalAfter !== undefined) costOfCapital = matureRateScaled(costOfCapital, levers.costOfCapitalAfter / 100);
  if (levers.cash !== undefined) cash = levers.cash;
  if (levers.debt !== undefined) debt = levers.debt;
  if (levers.options !== undefined) options = levers.options;

  return valueStory({
    ...inputs,
    growth,
    margin,
    marginAfter,
    costOfCapital,
    salesToCapital,
    ...(salesToCapitalByYear ? { salesToCapitalByYear } : {}),
    growthAfter,
    cash,
    debt,
    options,
    ...(failure ? { failure } : {}),
  });
}

/**
 * The return a dollar of new capital earns once the business is mature (spec C4, Spine Topic 6), in percent: each dollar
 * invested adds `salesToCapital` dollars of revenue, of which the margin is operating income, taxed at the tax rate. Growth
 * adds value only when this is above the cost of capital. Amazon's story, 10% kept and $3 of sales for each $1 at 35% tax,
 * earns 19.5%.
 */
export function returnOnNewCapital(marginPercent: number, salesToCapital: number, taxPercent: number): number {
  return marginPercent * salesToCapital * (1 - taxPercent / 100);
}
