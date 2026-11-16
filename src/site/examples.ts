// The five public examples (Signal spec §7.1 and Appendix A): one list, read by the proxy's public pages, the case
// pages' generateStaticParams, Home's Tutor demo and questions list, and Examples. Decision #7: in the code these are
// "examples", never "cases", because "Case" already means a course Case. The jackpot Example is the Kerala lottery of
// 2024 (kerala-bumper-2024); the course's own lottery Case, mega-millions-2018, is a different thing and stays. Copy is
// the spec's word for word; `**bold**` and `*italic*` are read by src/site/rich.tsx.
// Pure data: no React, no database, so the proxy can import it.

/** Which Signal widget draws an example (src/components/signal). */
export type ExampleWidget = "jackpot" | "levers" | "wework" | "rates" | "compound";

/** The Examples page's filter groups (§7.4). */
export type ExampleGroup = "everyday" | "news" | "companies";

/** One named Source behind an Example's figures, always with its link, or a note on how a figure was worked out (no Source, no link). */
export type ExampleSource = { label: string; url: string } | { note: string };

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
  /** The Moment's As-of date (ISO), for an Example about a dated event: its Case Data stand as of that day. */
  asOf?: string;
  /** Where the Case Data come from: each Source named and linked, and any notes on how a figure was worked out. */
  sources: readonly ExampleSource[];
  widget: ExampleWidget;
};

export const EXAMPLES: readonly Example[] = [
  {
    slug: "kerala-bumper-2024",
    stamp: "Oct 2024",
    category: "Everyday money",
    group: "everyday",
    topicId: "spine-02-money-later",
    topic: "Why is money later worth less?",
    question: "Is ₹25 crore over 30 years worth ₹25 crore?",
    hook: "Kerala paid its ₹25 crore jackpot at once. American lotteries pay theirs over 30 years. Is that the same prize?",
    story:
      "**9 October 2024.** Kerala’s Thiruvonam Bumper lottery draws its first prize of **₹25 crore**, on ticket TG 434222, sold in Wayanad for ₹500. Kerala pays a prize at once. American lotteries advertise theirs as the sum of **30 yearly payments** that rise 5% a year. Paid that way, would the same ₹25 crore be worth as much?",
    facts: [
      { label: "First prize, paid at once", value: "₹25 crore" },
      { label: "Ticket price", value: "₹500" },
      { label: "Drawing", value: "9 Oct 2024" },
    ],
    ask: "₹25 crore is ₹25 crore. Why would it matter when it’s paid?",
    chip: "A ₹25 crore jackpot",
    demoAsk: "Is ₹25 crore over 30 years worth ₹25 crore?",
    lead: "Two ways to pay the same prize: **₹25 crore** at once, as Kerala does, or 30 yearly payments that add up to **₹25 crore**, the American way. Make your call in the widget, then test it.",
    answer:
      "**Only if a rupee later is worth as much as a rupee now. It isn’t.** A payment in 2053 can’t be spent or invested until 2053. Put the cash in a deposit at 5% instead, and each far-off payment is worth much less today. Add the 30 payments up in today’s money, then compare.",
    follow: {
      right: "Right. Now drag the rate down. Only at 0%, when money earns nothing, are the two worth the same.",
      other: "Most people start there. Watch what a 5% rate does to the far-off payments, then look for the rate where the two match.",
    },
    endingLabel: "What the winner got",
    endingKind: "next",
    ending:
      "Kerala’s Lotteries department pays the prize into the winner’s bank account in one go, after the agent’s 10% commission and tax: about **₹12.88 crore** of the ₹25 crore reached the winner. Paid over 30 years instead, the same ₹25 crore would be worth only about **₹11.29 crore** today at 5% a year, before any tax. *A rupee later is worth less than a rupee today.*",
    asOf: "2024-10-09",
    sources: [
      {
        label: "The Hindu, 9 Oct 2024",
        url: "https://www.thehindu.com/news/national/kerala/keralas-25-crore-thiruvonam-bumper-lottery-announced-jackpot-goes-to-ticket-sold-in-wayanad/article68735952.ece",
      },
      { label: "Mathrubhumi, 9 Oct 2024", url: "https://english.mathrubhumi.com/news/kerala/kerala-thiruvonam-bumper-lottery-result-first-prize-winner-47fe5126" },
      { label: "The New Indian Express, 11 Oct 2024", url: "https://www.newindianexpress.com/states/karnataka/2024/Oct/11/mandya-bike-mechanic-wins-rs-25-crore-thiruvonam-bumper-lottery" },
      { label: "Mega Millions, Difference Between Cash Value and Annuity", url: "https://www.megamillions.com/difference-between-cash-value-and-annuity" },
      { note: "The 30 payments are a what-if, worked out the American way." },
    ],
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
    hook: "Amazon sells books online, loses money, and its shares cost $84. Set four levers and judge what the price needed.",
    story:
      "**February 2000.** Amazon sells books and music online. In the twelve months to September 1999 it sold **$1,117 million** and lost **$410 million** on its operations. Its shares cost $84. One published valuation writes down a Story about its future: how big it gets, what it keeps of each sale, what its growth costs and how risky it is.",
    facts: [
      { label: "Sales, 12 months to Sep 1999", value: "$1,117M" },
      { label: "Operating loss, same period", value: "$410M" },
      { label: "Share price, 3 Feb 2000", value: "$84" },
    ],
    ask: "If Amazon loses money, how can it be worth anything at all?",
    chip: "Amazon at $84",
    demoAsk: "How can a loss-making Amazon be worth $84 a share?",
    lead: "Start with what people knew that day. Buyers paid **$84** a share. One published valuation of Amazon’s future came to **$35**. Four levers explain the gap. Move one and watch.",
    answer:
      "**Because value comes from the cash it makes later, not the loss it makes now.** A valuation is a story told in four numbers: how big the business gets, what it keeps of each sale, what that growth costs, and how risky the ride is. Set those four levers and the cash flows, and the value, follow.",
    // The spec gives Amazon one follow-up for every call.
    follow: {
      right: "Green adds value to the published $35. Red takes it away. What did the $84 price need? Would you have believed it in 2000?",
      other: "Green adds value to the published $35. Red takes it away. What did the $84 price need? Would you have believed it in 2000?",
    },
    endingLabel: "What really happened",
    endingKind: "next",
    ending:
      "The published valuation came to **$35.08 a share** against the $84 price. The $84 was already below the year’s high: in early January 2000 the shares had traded as high as $91.50. The price fell through 2000, and by the fourth quarter the shares had been as low as **$14.88**. *A price is what buyers paid that day. A value is what one story about the business is worth.* Neither number proves the other wrong.",
    sources: [
      {
        label: "Aswath Damodaran, The Dark Side of Valuation: Can Amazon.com be valued? (NYU Stern, March 2000)",
        url: "https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/HighGrow.pdf",
      },
      { label: "Amazon.com, Form 10-K for 2000 (SEC)", url: "https://www.sec.gov/Archives/edgar/data/1018724/000103221001500087/d10k405.txt" },
      { note: "The widget runs the course’s tested valuation engine on Damodaran’s inputs: $35.04 a share against his published $35.08." },
    ],
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
    sources: [
      { label: "WeWork S-1, 14 Aug 2019", url: "https://www.sec.gov/Archives/edgar/data/1533523/000119312519220499/d781982ds1.htm" },
      {
        label: "CNBC, 30 Sep 2019",
        url: "https://www.cnbc.com/2019/09/30/wework-says-it-will-file-request-to-withdraw-its-ipo-prospectus-after-roadshow-management-turmoil.html",
      },
      { label: "CNBC, 7 Nov 2023", url: "https://www.cnbc.com/2023/11/07/wework-files-for-bankruptcy.html" },
    ],
    widget: "wework",
  },
  {
    slug: "rbi-repo-cut-2025",
    stamp: "Jun 2025",
    category: "The news",
    group: "news",
    topicId: "num-percent-bps",
    topic: "Percent, percentage points and basis points",
    question: "The RBI cut its repo rate from 6% to 5.5%. How big a cut is that?",
    hook: "Half a point, 50 basis points, or about 8%: three true answers of different sizes.",
    story:
      "**6 June 2025.** The Reserve Bank of India cuts its repo rate, the rate at which it lends to banks, from **6%** to **5.5%**. Home loans, deposits and the bond market all move on that number. But “cut by 0.5%” could mean two very different sizes.",
    facts: [
      { label: "Repo rate before", value: "6%" },
      { label: "Repo rate after", value: "5.5%" },
      { label: "Decided", value: "6 Jun 2025" },
    ],
    ask: "The RBI cut its rate from 6% to 5.5%. Is that a 0.5% cut?",
    chip: "The RBI’s June cut",
    demoAsk: "The RBI cut from 6% to 5.5%. How big a cut is that?",
    lead: "On 6 June 2025 the repo rate went from **6% to 5.5%**. Three ways of describing that move are in the widget. Tap each one you think is correct.",
    answer:
      "**It depends which size you mean.** From 6% to 5.5% is half a percentage point, 50 basis points, and about 8% of the old rate. All three are true, but they are different sizes. Down 0.5% could mean half a point, or 0.5% of the old 6%, which is only 0.03 points. So say down half a point, or down 50 bp.",
    // The spec gives Rates one follow-up for every call.
    follow: {
      right: "Tap the other two as well. Two are right, and one is the trap headlines fall into.",
      other: "Tap the other two as well. Two are right, and one is the trap headlines fall into.",
    },
    endingLabel: "The rule to keep",
    endingKind: "rule",
    ending:
      "*Name the base of every change.* A move from 6% to 5.5% is down 0.5 percentage points, down 50 basis points, and down about 8% on the old rate. The RBI announced it as **50 basis points**, so nobody had to ask which one it meant.",
    asOf: "2025-06-06",
    sources: [
      {
        label: "Reserve Bank of India, Monetary Policy Statement 2025-26, Resolution of the Monetary Policy Committee, 6 Jun 2025",
        url: "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=60604",
      },
    ],
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
    sources: [{ note: "Worked example from the Topic. No outside figures." }],
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
export const DEMO_ORDER: readonly string[] = ["kerala-bumper-2024", "amazon-2000", "rbi-repo-cut-2025", "compounding-1000", "wework-2019"];

/** The jackpot Example's slug: Home's "Try the jackpot" and hero numbers follow it. */
export const JACKPOT_EXAMPLE = "kerala-bumper-2024";

/** The Examples filter (§7.4): its chips in order, with the label each shows. */
export const EXAMPLE_FILTERS: readonly { id: ExampleGroup | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "everyday", label: "Everyday money" },
  { id: "news", label: "The news" },
  { id: "companies", label: "Real companies" },
];
