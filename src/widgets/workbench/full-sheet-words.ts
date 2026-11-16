import type { DcfInputs } from "../../finance/dcf-engine.ts";

// The Full sheet's words (spec #68, "Valuation, Full sheet"): each row's name, and the Lingo card the row opens inline
// (glossary "Lingo card"; not a Companion Widget, so it costs no Tutor Turn). They sit in this module, apart from the
// rows' figures, so `scripts/check-course.mjs` can lint them under plain Node: relative `.ts` imports only, no "@/".
// "{money}" stands for the Case's currency sign ("$", "₹").

/** The words of a Lingo card, as `LingoCard` takes them: pro at most 14 words, means and example at most 20. */
export type LingoWords = { term: string; pro: string; means: string; example: string; emoji: string };

/** One Full sheet row's words: its name, its name beside a year-by-year path of the same figure, and its Lingo card. */
export type RowWords = { words: string; besidePath?: string; card: LingoWords };

export type FullSheetInput = keyof DcfInputs;

export const FULL_SHEET_WORDS: Record<FullSheetInput, RowWords> = {
  baseRevenue: {
    words: "Revenue in the year before year 1",
    card: {
      term: "Revenue",
      pro: "Revenue is the top line: everything customers paid in the year",
      means: "All the money customers paid the company for what it sold in a year, before any costs.",
      example: "A lemonade stand that sells a hundred cups at a dollar each takes in a hundred dollars.",
      emoji: "money-bag",
    },
  },
  growth: {
    words: "Revenue growth, year by year",
    card: {
      term: "Revenue growth",
      pro: "Growth is how much faster the top line grows each year",
      means: "How much bigger revenue gets each year, as a share of the year before.",
      example: "A bakery that sold a hundred loaves last year and sells a hundred and ten now grew a tenth.",
      emoji: "chart-increasing",
    },
  },
  margin: {
    words: "Operating margin, year by year",
    card: {
      term: "Operating margin",
      pro: "The operating margin is what each dollar of sales keeps after running costs",
      means: "The share of revenue left once the costs of running the business are paid, before tax.",
      example: "A shop that keeps ten cents of every dollar it sells, after rent and wages, has a tenth.",
      emoji: "receipt",
    },
  },
  marginAfter: {
    words: "Operating margin after year 10",
    card: {
      term: "Margin when grown up",
      pro: "The mature margin is what the business keeps once it stops racing",
      means: "The operating margin the business settles at for good, once its fast years are over.",
      example: "A new café runs thin while it finds customers, then settles at a steady share it keeps.",
      emoji: "balance-scale",
    },
  },
  taxRate: {
    words: "Tax rate",
    besidePath: "Tax rate after year 10",
    card: {
      term: "Tax rate",
      pro: "The tax rate is the share of operating profit the government takes",
      means: "The share of the business's operating profit paid to the government as tax.",
      example: "Earn a hundred, pay twenty-five in tax, and your tax rate is a quarter.",
      emoji: "classical-building",
    },
  },
  taxRateByYear: {
    words: "Tax rate, year by year",
    card: {
      term: "Tax rate, year by year",
      pro: "The tax rate can climb as tax breaks run out",
      means: "The tax rate for each year ahead, when it changes, say as old breaks run out.",
      example: "A new firm pays little tax while its breaks last, then the full rate later.",
      emoji: "spiral-calendar",
    },
  },
  lossesCarried: {
    words: "Past losses that cut future tax",
    card: {
      term: "Losses carried forward",
      pro: "Losses carried forward shield future profits from tax",
      means: "Money the business lost in past years that it may take off future profits before tax is worked out.",
      example: "A shop lost money last year, so this year's first profits are not taxed.",
      emoji: "ledger",
    },
  },
  salesToCapital: {
    words: "Sales for each {money} invested",
    besidePath: "Sales for each {money} invested, in a year that sets none",
    card: {
      term: "Sales to capital",
      pro: "Sales to capital says how much new revenue each dollar invested buys",
      means: "How much more the business sells for each dollar it puts into stores, machines and software.",
      example: "A new oven costing a dollar that lets a bakery sell three more dollars of bread.",
      emoji: "factory",
    },
  },
  salesToCapitalByYear: {
    words: "Sales for each {money} invested, year by year",
    card: {
      term: "Sales to capital, year by year",
      pro: "Sales to capital can change as the business builds, then uses what it built",
      means: "How much more the business sells for each dollar invested, set for each year ahead.",
      example: "A taxi firm buys many cars early, then sells far more rides from the same cars later.",
      emoji: "building-construction",
    },
  },
  costOfCapital: {
    words: "Cost of capital, year by year",
    card: {
      term: "Cost of capital",
      pro: "The cost of capital is the return investors demand for the risk",
      means: "The yearly return lenders and owners ask for to put money into this business; riskier asks more.",
      example: "A friend lends to a steady shop for a little, but asks a lot more from a risky startup.",
      emoji: "bank",
    },
  },
  growthAfter: {
    words: "Growth after year 10, for ever",
    card: {
      term: "Growth for ever",
      pro: "Stable growth is the pace the business can keep up for ever",
      means: "How fast revenue grows each year once the business is grown up, no faster than the economy.",
      example: "An old corner shop that grows about as fast as its town, year after year.",
      emoji: "seedling",
    },
  },
  returnOnCapitalAfter: {
    words: "Return on new investment after year 10",
    card: {
      term: "Return on new investment",
      pro: "Return on capital is what each dollar invested earns a year",
      means: "What each dollar the grown-up business invests earns back each year, after tax.",
      example: "A dollar spent on a second shop that earns ten cents a year earns a tenth.",
      emoji: "direct-hit",
    },
  },
  cash: {
    words: "Cash the company holds",
    card: {
      term: "Cash",
      pro: "Cash on the balance sheet belongs to the shareholders on top of the business",
      means: "Money the company has in the bank today; it adds to what the owners have.",
      example: "Buy a shop with a hundred dollars in the till and you get those dollars too.",
      emoji: "dollar-banknote",
    },
  },
  debt: {
    words: "Debt the company owes",
    card: {
      term: "Debt",
      pro: "Debt is paid before shareholders get anything",
      means: "Money the company has borrowed and must pay back; lenders are paid before the owners.",
      example: "A house with a mortgage: the owner keeps only what is left after the bank is paid.",
      emoji: "credit-card",
    },
  },
  options: {
    words: "Employee options, owed to their holders",
    card: {
      term: "Employee options",
      pro: "Employee options are a claim on the equity that comes before the shares",
      means: "Rights staff were given to buy shares cheaply later; what they are worth comes out of the owners' value.",
      example: "A cook promised a slice of the restaurant: the owners own a little less of it.",
      emoji: "identification-card",
    },
  },
  shares: {
    words: "Shares the value is split over",
    card: {
      term: "Shares",
      pro: "Value per share is the owners' value split over every share",
      means: "The number of equal pieces the company's ownership is cut into; the owners' value is split over them.",
      example: "A pizza cut into eight slices: each slice is an eighth of the pizza.",
      emoji: "puzzle-piece",
    },
  },
  failure: {
    words: "Chance the business fails",
    card: {
      term: "Chance of failure",
      pro: "The failure chance weighs the going concern against what is left if it fails",
      means: "How likely the business is to fail before it grows up, and what owners get back if it does.",
      example: "A new restaurant that may close in its first years, when only the ovens can be sold.",
      emoji: "warning",
    },
  },
};

/** A row's words with the Case's currency sign in place of "{money}". */
export const withMoney = (words: string, sign: string): string => words.replaceAll("{money}", sign);
