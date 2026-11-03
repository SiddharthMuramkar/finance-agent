import { z } from "zod";
import { formatInr, formatInrWords } from "./indian-format";
import { amortizationSchedule, emi } from "./loans";
import { COMPOUNDINGS, fixedDeposit, ppfMaturity, recurringDeposit, sipMaturity } from "./savings";
import {
  annuityFutureValue,
  annuityPresentValue,
  compoundAmount,
  effectiveAnnualRate,
  inflationAdjusted,
  internalRateOfReturn,
  netPresentValue,
  perpetuityValue,
  realRate,
  ruleOf72,
} from "./tvm";
import { annuitySchedule, presentValue } from "./present-value";
import { bondDuration, bondPrice, cagr, currentYield, dcfValuation, dividendYield, gordonGrowth, twoStageDdm, yieldToMaturity } from "./valuation";

// The registry of Finance Calculations. The Tutor's `calculate` tool and the Calculator widget
// both call `calculate`, so a number can never differ between the two. Rates are yearly
// percentages (5 means 5%).

export type Currency = "usd" | "inr";
type Kind = "money" | "percent" | "years" | "number";
type Raw = { label: string; value: number; kind: Kind };

export type CalculatorResult = { label: string; value: number; kind: Kind; text: string };
export type Calculation = { ok: true; id: string; title: string; results: CalculatorResult[] } | { ok: false; error: string };

type Calculator<S extends z.ZodType> = {
  id: string;
  title: string;
  description: string;
  /** Rupees unless the caller says otherwise: for the Indian savings products and loans. */
  defaultCurrency: Currency;
  inputs: S;
  /** A working set of inputs: the tests run it, and the Tutor's tool description shows it. */
  example: z.input<S>;
  run: (inputs: z.output<S>) => Raw[];
};

const rate = z.number().describe("yearly rate in percent, 5 means 5%");
const years = z.number().positive();
const money = (label: string, value: number): Raw => ({ label, value, kind: "money" });
const pct = (label: string, value: number): Raw => ({ label, value, kind: "percent" });
const yrs = (label: string, value: number): Raw => ({ label, value, kind: "years" });

function define<S extends z.ZodType>(c: Calculator<S>) {
  return c as unknown as Calculator<z.ZodType>;
}

export const CALCULATORS = [
  define({
    id: "future_value",
    title: "Future value of a lump sum",
    description: "What one amount grows to. perYear is how often interest compounds a year (1, 4, 12).",
    defaultCurrency: "usd",
    inputs: z.object({ amount: z.number(), ratePercent: rate, years, perYear: z.number().int().positive().default(1) }),
    example: { amount: 100_000, ratePercent: 10, years: 5 },
    run: ({ amount, ratePercent, years: y, perYear }) => [money("Future value", compoundAmount(amount, ratePercent, y, perYear))],
  }),
  define({
    id: "present_value",
    title: "Present value of a lump sum",
    description: "Today's value of one amount received in `years` years.",
    defaultCurrency: "usd",
    inputs: z.object({ amount: z.number(), ratePercent: rate, years }),
    example: { amount: 1000, ratePercent: 10, years: 5 },
    run: ({ amount, ratePercent, years: y }) => [money("Present value", presentValue(amount, ratePercent, y))],
  }),
  define({
    id: "annuity_future_value",
    title: "Future value of equal payments",
    description: "Equal payments, perYear times a year for `years`. timing is when in each period they are paid.",
    defaultCurrency: "usd",
    inputs: z.object({ payment: z.number(), ratePercent: rate, years, perYear: z.number().int().positive().default(12), timing: z.enum(["end", "start"]).default("end") }),
    example: { payment: 10_000, ratePercent: 12, years: 10, perYear: 12 },
    run: ({ payment, ratePercent, years: y, perYear, timing }) => [
      money("Future value", annuityFutureValue(payment, ratePercent, y * perYear, perYear, timing)),
      money("Total paid in", payment * y * perYear),
    ],
  }),
  define({
    id: "annuity_present_value",
    title: "Present value of equal payments",
    description: "What equal payments, perYear times a year for `years`, are worth today.",
    defaultCurrency: "usd",
    inputs: z.object({ payment: z.number(), ratePercent: rate, years, perYear: z.number().int().positive().default(1), timing: z.enum(["end", "start"]).default("end") }),
    example: { payment: 1000, ratePercent: 8, years: 10 },
    run: ({ payment, ratePercent, years: y, perYear, timing }) => [
      money("Present value", annuityPresentValue(payment, ratePercent, y * perYear, perYear, timing)),
      money("Sum of payments", payment * y * perYear),
    ],
  }),
  define({
    id: "growing_annuity_present_value",
    title: "Present value of growing yearly payments",
    description:
      "An advertised total paid as `payments` yearly payments, the first now, each `growthPercent` larger than the one before (the jackpot annuity). Gives the first payment and what all of them are worth today.",
    defaultCurrency: "usd",
    inputs: z.object({ total: z.number().positive(), payments: z.number().int().min(1).max(60), growthPercent: z.number().default(0), ratePercent: rate }),
    example: { total: 3310, payments: 3, growthPercent: 10, ratePercent: 10 },
    run: ({ total, payments, growthPercent, ratePercent }) => {
      const schedule = annuitySchedule({ total, payments, growthPercent, ratePercent });
      return [money("Present value", schedule.presentValue), money("First payment", schedule.rows[0].payment), money("Sum of payments", total)];
    },
  }),
  define({
    id: "perpetuity",
    title: "Perpetuity value",
    description: "A payment every year forever, optionally growing. Growth must be below the discount rate.",
    defaultCurrency: "usd",
    inputs: z.object({ payment: z.number(), ratePercent: rate, growthPercent: z.number().default(0) }),
    example: { payment: 10_000, ratePercent: 10, growthPercent: 3 },
    run: ({ payment, ratePercent, growthPercent }) => [money("Present value", perpetuityValue(payment, ratePercent, growthPercent))],
  }),
  define({
    id: "effective_annual_rate",
    title: "Effective annual rate",
    description: "The yearly rate a nominal rate really earns when compounded perYear times.",
    defaultCurrency: "usd",
    inputs: z.object({ nominalPercent: rate, perYear: z.number().int().positive() }),
    example: { nominalPercent: 12, perYear: 12 },
    run: ({ nominalPercent, perYear }) => [pct("Effective annual rate", effectiveAnnualRate(nominalPercent, perYear))],
  }),
  define({
    id: "real_return",
    title: "Real return and inflation",
    description: "The return after inflation, and what an amount costs after `years` of inflation.",
    defaultCurrency: "usd",
    inputs: z.object({ nominalPercent: rate, inflationPercent: rate, years, amount: z.number().default(100_000) }),
    example: { nominalPercent: 12, inflationPercent: 6, years: 10 },
    run: ({ nominalPercent, inflationPercent, years: y, amount }) => [
      pct("Real return", realRate(nominalPercent, inflationPercent)),
      money("Cost of the amount after inflation", inflationAdjusted(amount, inflationPercent, y)),
    ],
  }),
  define({
    id: "rule_of_72",
    title: "Rule of 72",
    description: "A quick estimate of the years to double at a yearly rate.",
    defaultCurrency: "usd",
    inputs: z.object({ ratePercent: rate }),
    example: { ratePercent: 8 },
    run: ({ ratePercent }) => [yrs("Years to double (approximate)", ruleOf72(ratePercent))],
  }),
  define({
    id: "cagr",
    title: "Compound annual growth rate",
    description: "The steady yearly growth that takes a start value to an end value.",
    defaultCurrency: "usd",
    inputs: z.object({ start: z.number().positive(), end: z.number().positive(), years }),
    example: { start: 100, end: 200, years: 5 },
    run: ({ start, end, years: y }) => [pct("CAGR", cagr(start, end, y))],
  }),
  define({
    id: "npv",
    title: "Net present value",
    description: "cashFlows[0] happens today (usually negative), the rest one year apart.",
    defaultCurrency: "usd",
    inputs: z.object({ ratePercent: rate, cashFlows: z.array(z.number()).min(2) }),
    example: { ratePercent: 10, cashFlows: [-1000, 500, 400, 300, 200] },
    run: ({ ratePercent, cashFlows }) => [money("Net present value", netPresentValue(ratePercent, cashFlows))],
  }),
  define({
    id: "irr",
    title: "Internal rate of return",
    description: "The rate that makes the net present value of the cash flows zero. cashFlows[0] is today.",
    defaultCurrency: "usd",
    inputs: z.object({ cashFlows: z.array(z.number()).min(2) }),
    example: { cashFlows: [-1000, 500, 400, 300, 200] },
    run: ({ cashFlows }) => [pct("Internal rate of return", internalRateOfReturn(cashFlows))],
  }),
  define({
    id: "emi",
    title: "Loan EMI",
    description: "The monthly instalment on a loan, with the total interest paid.",
    defaultCurrency: "inr",
    inputs: z.object({ principal: z.number().positive(), ratePercent: rate, years }),
    example: { principal: 5_000_000, ratePercent: 8.5, years: 20 },
    run: ({ principal, ratePercent, years: y }) => {
      const schedule = amortizationSchedule(principal, ratePercent, y);
      return [money("Monthly instalment", emi(principal, ratePercent, y)), money("Total interest", schedule.totalInterest), money("Total repaid", principal + schedule.totalInterest)];
    },
  }),
  define({
    id: "sip",
    title: "SIP (monthly investment plan)",
    description: "A fixed sum each month, invested at the start of the month, at a yearly return.",
    defaultCurrency: "inr",
    inputs: z.object({ monthly: z.number().positive(), ratePercent: rate, years }),
    example: { monthly: 10_000, ratePercent: 12, years: 10 },
    run: ({ monthly, ratePercent, years: y }) => {
      const r = sipMaturity(monthly, ratePercent, y);
      return [money("Maturity value", r.maturity), money("Total invested", r.invested), money("Gain", r.gain)];
    },
  }),
  define({
    id: "ppf",
    title: "PPF maturity",
    description: "A yearly deposit at the start of each year, interest compounded yearly (the PPF term is 15 years).",
    defaultCurrency: "inr",
    inputs: z.object({ yearlyDeposit: z.number().positive(), ratePercent: rate, years: years.default(15) }),
    example: { yearlyDeposit: 150_000, ratePercent: 7.1, years: 15 },
    run: ({ yearlyDeposit, ratePercent, years: y }) => {
      const r = ppfMaturity(yearlyDeposit, ratePercent, y);
      return [money("Maturity value", r.maturity), money("Total deposited", r.invested), money("Interest earned", r.interest)];
    },
  }),
  define({
    id: "fixed_deposit",
    title: "Fixed deposit maturity",
    description: `One sum for a term, interest compounded ${COMPOUNDINGS.join(", ")}.`,
    defaultCurrency: "inr",
    inputs: z.object({ principal: z.number().positive(), ratePercent: rate, years, compounding: z.enum(COMPOUNDINGS as [string, ...string[]]).default("quarterly") }),
    example: { principal: 100_000, ratePercent: 7, years: 5 },
    run: ({ principal, ratePercent, years: y, compounding }) => {
      const r = fixedDeposit(principal, ratePercent, y, compounding as (typeof COMPOUNDINGS)[number]);
      return [money("Maturity value", r.maturity), money("Interest earned", r.gain)];
    },
  }),
  define({
    id: "recurring_deposit",
    title: "Recurring deposit maturity",
    description: "A sum each month for `months`, interest compounded quarterly.",
    defaultCurrency: "inr",
    inputs: z.object({ monthly: z.number().positive(), ratePercent: rate, months: z.number().int().positive() }),
    example: { monthly: 5000, ratePercent: 7, months: 12 },
    run: ({ monthly, ratePercent, months }) => {
      const r = recurringDeposit(monthly, ratePercent, months);
      return [money("Maturity value", r.maturity), money("Total deposited", r.invested), money("Interest earned", r.gain)];
    },
  }),
  define({
    id: "bond_price",
    title: "Bond price",
    description: "The price of a bond at a given yield. perYear is coupons a year (2 is semi-annual).",
    defaultCurrency: "usd",
    inputs: z.object({ face: z.number().positive(), couponPercent: rate, yieldPercent: rate, years, perYear: z.number().int().positive().default(2) }),
    example: { face: 1000, couponPercent: 8, yieldPercent: 10, years: 5, perYear: 2 },
    run: (i) => [money("Price", bondPrice(i.face, i.couponPercent, i.yieldPercent, i.years, i.perYear)), pct("Current yield", currentYield((i.face * i.couponPercent) / 100, bondPrice(i.face, i.couponPercent, i.yieldPercent, i.years, i.perYear)))],
  }),
  define({
    id: "yield_to_maturity",
    title: "Yield to maturity",
    description: "The yearly yield that makes a bond's payments worth its price.",
    defaultCurrency: "usd",
    inputs: z.object({ face: z.number().positive(), couponPercent: rate, price: z.number().positive(), years, perYear: z.number().int().positive().default(2) }),
    example: { face: 1000, couponPercent: 8, price: 922.78, years: 5, perYear: 2 },
    run: (i) => [pct("Yield to maturity", yieldToMaturity(i.face, i.couponPercent, i.price, i.years, i.perYear))],
  }),
  define({
    id: "bond_duration",
    title: "Bond duration",
    description: "Macaulay duration (the average wait for the bond's money, in years) and modified duration (price sensitivity to yield).",
    defaultCurrency: "usd",
    inputs: z.object({ face: z.number().positive(), couponPercent: rate, yieldPercent: rate, years, perYear: z.number().int().positive().default(2) }),
    example: { face: 1000, couponPercent: 8, yieldPercent: 8, years: 5, perYear: 2 },
    run: (i) => {
      const d = bondDuration(i.face, i.couponPercent, i.yieldPercent, i.years, i.perYear);
      return [yrs("Macaulay duration", d.macaulay), yrs("Modified duration", d.modified)];
    },
  }),
  define({
    id: "gordon_growth",
    title: "Dividend discount model (constant growth)",
    description: "Value of a share whose dividend grows steadily forever. lastDividend is the dividend just paid.",
    defaultCurrency: "usd",
    inputs: z.object({ lastDividend: z.number().positive(), growthPercent: rate, requiredPercent: rate }),
    example: { lastDividend: 5, growthPercent: 8, requiredPercent: 15 },
    run: (i) => [money("Value per share", gordonGrowth(i.lastDividend, i.growthPercent, i.requiredPercent))],
  }),
  define({
    id: "two_stage_ddm",
    title: "Dividend discount model (two stages)",
    description: "A high-growth stage for some years, then stable growth forever.",
    defaultCurrency: "usd",
    inputs: z.object({ lastDividend: z.number().positive(), highGrowthPercent: rate, highGrowthYears: z.number().int().positive(), stableGrowthPercent: rate, requiredPercent: rate }),
    example: { lastDividend: 1, highGrowthPercent: 10, highGrowthYears: 2, stableGrowthPercent: 5, requiredPercent: 15 },
    run: (i) => [money("Value per share", twoStageDdm(i.lastDividend, i.highGrowthPercent, i.highGrowthYears, i.stableGrowthPercent, i.requiredPercent))],
  }),
  define({
    id: "dcf",
    title: "Discounted cash flow",
    description: "Free cash flows for the coming years (the first a year away) plus a terminal value. netDebt and shares are optional.",
    defaultCurrency: "usd",
    inputs: z.object({ cashFlows: z.array(z.number()).min(1), ratePercent: rate, terminalGrowthPercent: rate, netDebt: z.number().default(0), shares: z.number().positive().optional() }),
    example: { cashFlows: [100, 120], ratePercent: 10, terminalGrowthPercent: 2 },
    run: (i) => {
      const v = dcfValuation(i);
      return [money("Enterprise value", v.enterpriseValue), money("Equity value", v.equityValue), ...(v.perShare === undefined ? [] : [money("Value per share", v.perShare)])];
    },
  }),
  define({
    id: "dividend_yield",
    title: "Dividend yield",
    description: "Yearly dividend over the share price.",
    defaultCurrency: "usd",
    inputs: z.object({ dividend: z.number(), price: z.number().positive() }),
    example: { dividend: 10, price: 200 },
    run: (i) => [pct("Dividend yield", dividendYield(i.dividend, i.price))],
  }),
];

export const CALCULATOR_IDS = CALCULATORS.map((c) => c.id);

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Money in the chosen currency; rupees also get a lakh or crore reading from one lakh up. */
export function formatMoney(value: number, currency: Currency): string {
  if (currency === "usd") return USD.format(value);
  return Math.abs(value) >= 100_000 ? `${formatInr(value)} (${formatInrWords(value)})` : formatInr(value);
}

function show(raw: Raw, currency: Currency): CalculatorResult {
  const text =
    raw.kind === "money" ? formatMoney(raw.value, currency) : raw.kind === "percent" ? `${raw.value.toFixed(2)}%` : raw.kind === "years" ? `${raw.value.toFixed(2)} years` : String(raw.value);
  return { ...raw, text };
}

/** Runs one calculator. Bad input or an impossible case comes back as an error message, never an exception. */
export function calculate(id: string, inputs: unknown, currency?: Currency): Calculation {
  const calculator = CALCULATORS.find((c) => c.id === id);
  if (!calculator) return { ok: false, error: `Unknown calculator "${id}". Available: ${CALCULATOR_IDS.join(", ")}.` };
  const parsed = calculator.inputs.safeParse(inputs);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "inputs"}: ${i.message}`).join("; ");
    return { ok: false, error: `Check the inputs for ${id}: ${problems}.` };
  }
  try {
    const results = calculator.run(parsed.data).map((r) => show(r, currency ?? calculator.defaultCurrency));
    return { ok: true, id, title: calculator.title, results };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The calculation failed." };
  }
}
