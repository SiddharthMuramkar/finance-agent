// The five public examples (Signal spec §7.1 and Appendix A): one list, read by the proxy's public pages, the case
// pages' generateStaticParams, Home's Tutor demo and questions list, and Examples. Decision #7: in the code these are
// "examples", never "cases", because "Case" already means a course Case (one slug, mega-millions-2018, is also a
// course Case id). Copy is the spec's word for word; `**bold**` and `*italic*` are read by src/site/rich.tsx.
// Pure data: no React, no database, so the proxy can import it.

/** Which Signal widget draws an example (src/components/signal). */
export type ExampleWidget = "jackpot" | "levers" | "wework" | "rates" | "compound";

/** The Examples page's filter groups (§7.4). */
export type ExampleGroup = "everyday" | "news" | "companies";

export type Example = {
  slug: string;
  /** The stamp beside the question (§5.17). */
  stamp: string;
  /** The category beside the stamp, and the filter group it belongs to. */
  category: string;
  group: ExampleGroup;
  /** The course Topic it comes from: its id (course/outline.yaml) and its title as the site shows it. */
  topicId: string;
  topic: string;
  question: string;
  hook: string;
  story: string;
  facts: readonly { label: string; value: string }[];
  /** The learner's bubble on the case page. */
  ask: string;
  /** Home's Tutor demo: the chip's label and the learner's bubble there (§7.2.1). */
  chip: string;
  demoAsk: string;
  lead: string;
  answer: string;
  follow: { right: string; other: string };
  endingLabel: string;
  /** What the locked ending promises: what happened next, or the rule the Topic leaves you with (§7.5). */
  endingKind: "next" | "rule";
  ending: string;
  sources: string;
  widget: ExampleWidget;
};

export const EXAMPLES: readonly Example[] = [
  {
    slug: "mega-millions-2018",
    stamp: "Oct 2018",
    category: "Everyday money",
    group: "everyday",
    topicId: "spine-02-money-later",
    topic: "Why is money later worth less?",
    question: "Is a $1.537B jackpot really worth $1.537B?",
    hook: "Thirty yearly payments, or $877.8M in cash today. Which is worth more?",
    story:
      "**October 2018.** One ticket sold in South Carolina wins the Mega Millions jackpot, advertised at **$1.537 billion**. The winner can take it as 30 yearly payments that rise 5% a year, or take **$877.8 million** in cash now.",
    facts: [
      { label: "Advertised jackpot, 30 payments", value: "$1.537B" },
      { label: "Cash option, paid now", value: "$877.8M" },
      { label: "Drawing", value: "23 Oct 2018" },
    ],
    ask: "Thirty payments add up to $1.537 billion. Isn’t that obviously more than $877.8 million?",
    chip: "A $1.5B jackpot",
    demoAsk: "Is a $1.537B jackpot really worth $1.537B?",
    lead: "The winner had two choices that day: 30 yearly payments that add up to **$1.537 billion**, or **$877.8 million** in cash at once. Make your call in the widget, then test it.",
    answer:
      "**Only if a dollar later is worth as much as a dollar now. It isn’t.** A payment in 2047 can’t be spent or invested until 2047. Put the cash in a bond at 5% instead, and each far-off payment is worth much less today. Add the 30 payments up in today’s money, then compare.",
    follow: {
      right: "Right. Now drag the rate. Somewhere between 3% and 4% the two are worth the same. Find it.",
      other: "Most people start there. Watch what a 5% rate does to the far-off payments, then look for the rate where the two match.",
    },
    endingLabel: "What the winner did",
    endingKind: "next",
    ending:
      "The winner, who stayed anonymous, claimed the prize in 2019 and **took the cash: $877,784,124** before tax. At any rate above about 3.4% a year, the cash was worth more than the 30 payments. *A bigger total paid later can be worth less than a smaller sum today.*",
    sources: "Mega Millions, 2019; CNBC, 24 Oct 2018. The 3.4% crossover is worked out from the payment schedule.",
    widget: "jackpot",
  },
  {
    slug: "amazon-2000",
    stamp: "Feb 2000",
    category: "Real companies",
    group: "companies",
    topicId: "spine-01-worth",
    topic: "What is a business worth? Price against value, and the four levers",
    question: "Is $84 a fair price for Amazon?",
    hook: "Amazon sells books online, loses money, and its shares cost $84. Set four levers and see what one story is worth.",
    story:
      "**February 2000.** Amazon sells books and music online. In the twelve months to September 1999 it sold **$1,117 million** and lost **$410 million** on its operations. Its shares cost $84. A professor in New York, Aswath Damodaran, writes down what he thinks its future looks like: how big it gets, what it keeps of each sale, what its growth costs and how risky it is.",
    facts: [
      { label: "Sales, 12 months to Sep 1999", value: "$1,117M" },
      { label: "Operating loss, same period", value: "$410M" },
      { label: "Share price, 3 Feb 2000", value: "$84" },
    ],
    ask: "If Amazon loses money, how can it be worth anything at all?",
    chip: "Amazon at $84",
    demoAsk: "How can a loss-making Amazon be worth $84 a share?",
    lead: "Start with what people knew that day. Buyers paid **$84** a share. One professor’s story about Amazon’s future came to **$35**. Four levers explain the gap. Move one and watch.",
    answer:
      "**Because value comes from the cash it makes later, not the loss it makes now.** A valuation is a story told in four numbers: how big the business gets, what it keeps of each sale, what that growth costs, and how risky the ride is. Set those four levers and the cash flows, and the value, follow.",
    // The spec gives Amazon one follow-up for every call.
    follow: {
      right: "That is your story now. Green adds value to his $35. Red takes it away. Can you find a story worth $84?",
      other: "That is your story now. Green adds value to his $35. Red takes it away. Can you find a story worth $84?",
    },
    endingLabel: "What really happened",
    endingKind: "next",
    ending:
      "Damodaran’s story came to **$35.08 a share** against the $84 price. The $84 was already below the year’s high: in early January 2000 the shares had traded as high as $91.50. The price fell through 2000, and by the fourth quarter the shares had been as low as **$14.88**. *A price is what buyers paid that day. A value is what one story about the business is worth.* Neither number proves the other wrong.",
    sources: "Damodaran’s published valuation of Amazon, 2000. The widget here is a simplified prototype model calibrated to his $35.08.",
    widget: "levers",
  },
  {
    slug: "wework-2019",
    stamp: "Aug 2019",
    category: "Real companies",
    group: "companies",
    topicId: "fs-revenue-runrate",
    topic: "Revenue recognition, run rates, gross vs net",
    question: "WeWork boasted of $3 billion of run-rate revenue. Is that what it earned?",
    hook: "A share-sale filing, a dazzling pace, and the revenue actually recorded.",
    story:
      "**14 August 2019.** WeWork, which rents desks to members, publishes its plan to sell shares to the public. In January 2019 private investors had valued it at **$47 billion**. The filing boasts of revenue racing ahead at a **$3 billion run rate**.",
    facts: [
      { label: "Run rate claimed", value: "$3bn a year" },
      { label: "Revenue recorded, Jan–Jun 2019", value: "$1.54bn" },
      { label: "Net loss, Jan–Jun 2019", value: "about $905M" },
    ],
    ask: "WeWork boasted of $3 billion of run-rate revenue. Is that what it earned?",
    chip: "WeWork’s $3bn",
    demoAsk: "WeWork claimed a $3bn run rate. Did it earn that?",
    lead: "Good instinct to check. Step through what the filing said and what Asha found in it. Then make the call.",
    answer:
      "**Not quite.** A run rate takes a recent period and scales it to a year: WeWork’s filing took the revenue of the last month and multiplied it by 12. That is a pace, not revenue already recorded, and it is only as good as the guess that the pace repeats. The revenue it recorded in the first six months of 2019 was $1.54 billion, with a net loss of about $905 million.",
    follow: {
      right: "Right. A run rate is a pace. Revenue is what was recorded.",
      other: "Look at the bars again. The $3bn is one month times 12. The $1.54bn is what was recorded.",
    },
    endingLabel: "What really happened",
    endingKind: "next",
    ending:
      "Six weeks later, on **30 September 2019**, WeWork withdrew its share sale. In November 2023 it filed for bankruptcy. *A run rate is a pace. Revenue is what was recorded.*",
    sources: "WeWork S-1, 14 Aug 2019; CNBC, 30 Sep 2019; Forbes, 7 Nov 2023.",
    widget: "wework",
  },
  {
    slug: "rates-up-1",
    stamp: "The news",
    category: "The news",
    group: "news",
    topicId: "num-percent-bps",
    topic: "Percent, percentage points and basis points",
    question: "A headline says rates are up 1%. How big a move is that?",
    hook: "Points, basis points and percent: three true answers of different sizes.",
    story:
      "**Any morning.** A headline says rates are **up 1%**. Your loan, your deposit and the bond market all move on that number, but the headline doesn’t say which 1% it means.",
    facts: [
      { label: "Old rate", value: "4%" },
      { label: "New rate", value: "5%" },
      { label: "What the headline says", value: "up 1%" },
    ],
    ask: "A headline says rates are up 1%. How big a move is that?",
    chip: "Rates up 1%",
    demoAsk: "Rates are up 1%. How big a move is that?",
    lead: "Take a rate that goes from **4% to 5%**. Three ways of describing that move are in the widget. Tap each one you think is correct.",
    answer:
      "**It depends which size the writer means.** Take a rate going from 4% to 5%: that is 1 point, 100 basis points, and 25% of the old rate. All three are true, but they are different sizes. Up 1% could mean 1 point, or 1% of the old 4%, which is only 0.04 points. So say up 1 point, or up 100 bp.",
    // The spec gives Rates one follow-up for every call.
    follow: {
      right: "Tap the other two as well. Two are right, and one is the trap headlines fall into.",
      other: "Tap the other two as well. Two are right, and one is the trap headlines fall into.",
    },
    endingLabel: "The rule to keep",
    endingKind: "rule",
    ending:
      "*Name the base of every change.* A move from 4% to 5% is up 1 percentage point, up 100 basis points, and up 25% on the old rate. Traders quote basis points so nobody has to ask which one you meant.",
    sources: "Worked example from the Topic. No outside figures.",
    widget: "rates",
  },
  {
    slug: "compounding-1000",
    stamp: "Everyday",
    category: "Everyday money",
    group: "everyday",
    topicId: "num-compounding",
    topic: "Growth and compounding",
    question: "My deposit earns 10% a year. Does it grow by the same amount every year?",
    hook: "₹1,000 at 10% a year, left alone for 30 years.",
    story:
      "**Your deposit.** You put **₹1,000** in a deposit that pays **10% a year** and leave everything in. The statement shows the balance once a year.",
    facts: [
      { label: "You put in", value: "₹1,000" },
      { label: "It pays", value: "10% a year" },
      { label: "You take out", value: "nothing" },
    ],
    ask: "My deposit earns 10% a year. Does it grow by the same amount every year?",
    chip: "10% a year",
    demoAsk: "Does 10% a year grow by the same amount every year?",
    lead: "Say you put **₹1,000** in a deposit that pays **10% a year** and leave it alone. Make your call, then drag the years.",
    answer:
      "**No, a little more each year.** ₹1,000 at 10% a year is ₹1,100 after one year. Year two adds 10% of ₹1,100, which is ₹110, so it reaches ₹1,210. Each year’s gain is earned on a bigger total. That is compounding: each year grows on the new total, not on the start.",
    follow: {
      right: "Right. Now look at 30 years: the last few bars outgrow the first ten put together.",
      other: "Look at 30 years and watch what the last few years add.",
    },
    endingLabel: "The rule to keep",
    endingKind: "rule",
    ending:
      "*Each year grows on the new total, not on the start.* After 30 years, ₹1,000 at 10% becomes about **₹17,449**, and the last year alone adds about ₹1,586. At 10% a year, money doubles roughly every 7 years (72 ÷ 10).",
    sources: "Worked example from the Topic. No outside figures.",
    widget: "compound",
  },
];

/** The five slugs, in the spec's order (§7.1). */
export const EXAMPLE_SLUGS: readonly string[] = EXAMPLES.map((e) => e.slug);

/** The example at this slug, or undefined. */
export function exampleBySlug(slug: string): Example | undefined {
  return EXAMPLES.find((e) => e.slug === slug);
}

/** The case page's address for an example. */
export const examplePath = (slug: string) => `/examples/${slug}`;

/** The example before and after this one, wrapping around the list (§7.5 foot). */
export function neighbours(slug: string): { previous: Example; next: Example } {
  const i = EXAMPLES.findIndex((e) => e.slug === slug);
  const n = EXAMPLES.length;
  return { previous: EXAMPLES[(i - 1 + n) % n], next: EXAMPLES[(i + 1) % n] };
}

/** Home's Tutor demo order (§7.2.1): jackpot, Amazon, rates, compounding, WeWork. */
export const DEMO_ORDER: readonly string[] = ["mega-millions-2018", "amazon-2000", "rates-up-1", "compounding-1000", "wework-2019"];

/** The Examples filter (§7.4): its chips in order, with the label each shows. */
export const EXAMPLE_FILTERS: readonly { id: ExampleGroup | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "everyday", label: "Everyday money" },
  { id: "news", label: "The news" },
  { id: "companies", label: "Real companies" },
];
