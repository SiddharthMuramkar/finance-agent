import { stringify } from "yaml";
import { AMAZON_2000 } from "../finance/fixtures/amazon-2000.valuation.ts";
import { parseCourseMap, type CourseMap, type Topic } from "./map.ts";
import { parseOutline, type Outline } from "./outline.ts";

/**
 * A Spine Topic for tests, after Spine Topic 1 (spec 2026-11-12, C5) on Damodaran's Amazon of February 2000: every item
 * C2 asks for, judgement questions from D1 (two computed from the Case, three written, one predict), a Primer (C3), and
 * the why line (A6). It passes the lesson lint (L1 to L14) and the Spine course check; tests take a copy and break one
 * thing at a time. Plain data, so a test can also write it out as a Topic file.
 */
export const SPINE_TOPIC_DATA = {
  id: "spine-01-worth",
  title: "What is a business worth?",
  goal: "Say what a company is worth as a story with four levers, and say what a price assumes",
  why: "Valuing a company starts with a story about the business; the four levers turn that story into a value you can argue for.",
  exampleCurrency: "USD",
  cases: [
    {
      id: "amazon-worth",
      title: "Damodaran values Amazon, February 2000",
      asOf: "2000-02-01",
      story: "February 2000. Amazon sells books and music online. Its shares cost $84. A professor in New York writes down what he thinks its future looks like.",
      reveal: "His story came to $35.08 a share against the $84 price. By the end of 2000 the shares had been as low as $14.88.",
      valuation: AMAZON_2000,
    },
  ],
  concept: "A price is what buyers pay today. A value is what the business's future cash is worth today, argued as a story with four levers.",
  principle: "A value is a story set as four levers. When a price and your value differ, ask what the price assumes before you call it wrong.",
  terms: [
    { term: "price", means: "What buyers pay for a share today." },
    { term: "value", means: "What the business's future cash is worth today, for one share." },
    { term: "revenue", means: "What the company sells in a year." },
    { term: "operating margin", means: "What the company keeps from each sale before tax." },
    { term: "cost of capital", means: "The return investors need, given the risk." },
  ],
  skills: [
    { id: "price-value", rule: "A price is paid today; a value is argued from the business's future." },
    { id: "levers", rule: "A value is a story set as four levers: size, margin, the cost of growth and risk." },
  ],
  insight: {
    question: "Find a story worth the price, and say what you had to change.",
    written: "The price needed a bigger and richer Amazon than the professor's story.",
    foundWhen: "The Learner reaches a story worth the price and names growth and margin as what they changed.",
    hints: ["Move one lever at a time and watch which one moves the value most.", "Try size and margin together."],
  },
  explore: { before: "worth-check", workbench: { recipe: "value_levers", case: "amazon-worth", inputs: {} } },
  connections: [
    { text: "Discounted cash flow puts each lever into a value one year at a time.", topics: ["val-dcf"] },
    { text: "The income statement is where revenue and margin come from.", topics: ["fs-income"] },
  ],
  primers: [
    {
      id: "worth-primer-margin",
      title: "What a margin keeps",
      lines: ["A margin is the share of each sale a company keeps.", "A shop that keeps ten cents of every dollar has a margin of a tenth."],
      term: "operating margin",
      quickTry: {
        id: "worth-primer-try",
        skill: "levers",
        ask: "A shop sells more but keeps the same share of each sale. What happened to its margin?",
        kind: "choice",
        answer: "same",
        choices: [
          { id: "same", text: "It stayed the same" },
          { id: "up", text: "It went up", mistake: { tag: "size_for_margin", fix: "Selling more is size. The margin is the share kept, which did not change." } },
        ],
      },
      elective: "fs-income",
      at: "concept",
    },
  ],
  questions: [
    {
      id: "worth-q-lever",
      kind: "which_lever",
      prompt: "From his story, which change lifts the value most?",
      skill: "levers",
      explanation: "Margin and growth move the value most; the discount rate moves it least.",
      computed: {
        case: "amazon-worth",
        changes: [
          { id: "margin", label: "Margin 10% to 12%", levers: { marginTarget: 12 } },
          { id: "revenue", label: "Revenue in year 10 $39bn to $44bn", levers: { revenueYear10: 44000 } },
          { id: "reinvest", label: "Sales to capital 3 to 4", levers: { salesToCapital: 4 } },
          { id: "risk", label: "Cost of capital 12.84% to 11.84%", levers: { costOfCapitalGrowing: 11.84 } },
          { id: "leaner", label: "Sales to capital 3 to 5", levers: { salesToCapital: 5 } },
        ],
      },
    },
    {
      id: "worth-q-price",
      kind: "price_assumes",
      prompt: "The price is $84. Which story gets there?",
      skill: "price-value",
      computed: {
        case: "amazon-worth",
        changes: [
          { id: "bigger-richer", label: "$60bn and 12.5%", levers: { revenueYear10: 60000, marginTarget: 12.5 } },
          { id: "cheaper-money", label: "$39bn, 10% and a 10% cost of capital", levers: { costOfCapitalGrowing: 10 } },
          { id: "lean", label: "$39bn, 10% and sales to capital 5", levers: { salesToCapital: 5 } },
          { id: "bigger", label: "$50bn and 10%", levers: { revenueYear10: 50000 } },
        ],
      },
    },
    {
      id: "worth-q-predict",
      kind: "predict",
      prompt: "If {change} instead of 10%, the value will be:",
      skill: "levers",
      computed: {
        case: "amazon-worth",
        changes: [
          { id: "thin", label: "Margins end at 4%", levers: { marginTarget: 4 } },
          { id: "eight", label: "Margins end at 8%", levers: { marginTarget: 8 } },
        ],
        bands: [
          { id: "most", label: "About two thirds", min: 0.4, max: 0.9 },
          { id: "fifth", label: "About a fifth", min: 0.1, max: 0.4 },
          { id: "none", label: "Nothing left", max: 0.1 },
        ],
      },
    },
    {
      id: "worth-q-direction",
      kind: "direction",
      prompt: "Amazon will sell toys and electronics as well as books. Which lever moves, and which way?",
      skill: "levers",
      choices: [
        { id: "size-up", text: "How big it gets, up" },
        { id: "risk-up", text: "How risky it is, up", mistake: { tag: "lever_mixup", fix: "More things to sell is more sales: that is size, not risk." } },
        { id: "margin-down", text: "What it keeps, down", mistake: { tag: "lever_mixup", fix: "New lines change how much it sells first; the margin is a separate lever." } },
      ],
      answer: "size-up",
      explanation: "New things to sell make the company bigger.",
      source: "Damodaran, valuation of Amazon, February 2000",
    },
    {
      id: "worth-q-hold",
      kind: "cannot_hold",
      prompt: "Which story contradicts itself?",
      skill: "levers",
      choices: [
        { id: "no-invest", text: "Sales grow 35 times and it invests almost nothing" },
        { id: "slow", text: "Sales grow slowly and margins stay thin", mistake: { tag: "dull_is_fine", fix: "A dull story can still hold together. Fast growth with no spending cannot." } },
      ],
      answer: "no-invest",
      explanation: "Growth costs money: more sales need warehouses and systems first.",
      source: "Damodaran, valuation of Amazon, February 2000",
    },
    {
      id: "worth-q-pricevalue",
      kind: "price_or_value",
      prompt: "It trades at ten times sales, cheaper than its rival. Is that about a price or a value?",
      skill: "price-value",
      choices: [
        { id: "price", text: "A price" },
        { id: "value", text: "A value", mistake: { tag: "price_for_value", fix: "Comparing what buyers pay is a price. A value comes from the business's own future cash." } },
      ],
      answer: "price",
      explanation: "A multiple compares what buyers pay, which is a price.",
      source: "Damodaran, valuation of Amazon, February 2000",
    },
  ],
  checks: [
    {
      id: "worth-check",
      kind: "quiz",
      questions: ["worth-q-lever", "worth-q-price", "worth-q-predict", "worth-q-direction", "worth-q-hold", "worth-q-pricevalue"],
      perAttempt: 4,
      passRule: { correct: 3 },
      card: {
        title: "A price is paid; a value is argued",
        lines: [
          "A price is what buyers pay today.",
          "A value is what the business's future cash is worth today.",
          "A value starts as a story: how big, what it keeps, what growth costs, how risky.",
          "Each part is one lever, and code works out the value.",
        ],
        writeDown: "A price is paid. A value is argued, with four levers.",
        skills: ["price-value", "levers"],
      },
      quickTries: [
        {
          id: "worth-try-pv-half",
          skill: "price-value",
          ask: "Amazon is at $84, so it is worth $84. Is that a price or a value?",
          halfDone: "First step, done for you: $84 is what buyers pay today.",
          kind: "choice",
          answer: "price",
          choices: [
            { id: "price", text: "A price" },
            { id: "value", text: "A value", mistake: { tag: "price_for_value", fix: "What buyers pay today is a price, whatever it is called." } },
          ],
        },
        {
          id: "worth-try-pv-2",
          skill: "price-value",
          ask: "His story says $35 a share. Is that a price or a value?",
          kind: "choice",
          answer: "value",
          choices: [
            { id: "value", text: "A value" },
            { id: "price", text: "A price", mistake: { tag: "value_for_price", fix: "Nobody paid $35: it is argued from a story, so it is a value." } },
          ],
        },
        {
          id: "worth-try-pv-3",
          skill: "price-value",
          ask: "Buyers paid $91.50 for a share in March 2000. Is that a price or a value?",
          kind: "choice",
          answer: "price",
          choices: [
            { id: "price", text: "A price" },
            { id: "value", text: "A value", mistake: { tag: "price_for_value", fix: "A trade is what buyers paid: a price." } },
          ],
        },
        {
          id: "worth-try-lever-half",
          skill: "levers",
          ask: "Amazon will sell toys too. Which lever moves?",
          halfDone: "First step, done for you: more things to sell means more sales.",
          kind: "choice",
          answer: "size",
          choices: [
            { id: "size", text: "How big it gets" },
            { id: "risk", text: "How risky it is", mistake: { tag: "lever_mixup", fix: "More sales is size, not risk." } },
          ],
        },
        {
          id: "worth-try-lever-computed",
          skill: "levers",
          kind: "which_lever",
          ask: "From his story, which change lifts the value most?",
          computed: {
            case: "amazon-worth",
            changes: [
              { id: "margin", label: "Margin 10% to 12%", levers: { marginTarget: 12 } },
              { id: "reinvest", label: "Sales to capital 3 to 4", levers: { salesToCapital: 4 } },
              { id: "risk", label: "Cost of capital 12.84% to 11.84%", levers: { costOfCapitalGrowing: 11.84 } },
            ],
          },
        },
        {
          id: "worth-try-hold",
          skill: "levers",
          ask: "Which story holds together?",
          kind: "choice",
          answer: "spends",
          choices: [
            { id: "spends", text: "Sales grow fast and it builds warehouses first" },
            { id: "free", text: "Sales grow 35 times and it invests almost nothing", mistake: { tag: "free_growth", fix: "Growth costs money: more sales need more warehouses." } },
          ],
        },
      ],
    },
    {
      id: "worth-talk",
      kind: "conversation",
      prompt: "Tell Amazon's story in two or three sentences, as you would set the four levers. Which lever are you least sure of, and why?",
      passCriteria: "Gives a size, a margin and either a cost of growth or a risk; ties the value to that story; names one lever as uncertain with a reason.",
      skills: ["levers"],
    },
  ],
};

/** The outline the fixture is read with: Spine Topic 1, and the Electives its Primer and Connections name (Coming). */
export const SPINE_OUTLINE_TEXT = stringify({
  topics: [
    {
      id: "spine-01-worth",
      title: "What is a business worth?",
      stage: "spine",
      spine: 1,
      minutes: 10,
      drawsOn: ["val-dcf"],
      cases: [{ title: "Damodaran values Amazon.com", asOf: "2000-02-01", outcome: "The shares fell.", sources: ["http://pages.stern.nyu.edu/~adamodar/pdfiles/papers/HighGrow.pdf"], verified: true }],
    },
    {
      id: "fs-income",
      title: "The income statement",
      stage: "foundation",
      subject: "Financial statements",
      cases: [{ title: "WeWork's S-1", asOf: "2019-08-14", outcome: "It withdrew.", sources: ["https://www.sec.gov/"], verified: true }],
    },
    {
      id: "val-dcf",
      title: "DCF valuation",
      stage: "foundation",
      subject: "Valuation & corporate finance",
      cases: [{ title: "Amazon", asOf: "2000-02-01", outcome: "It fell.", sources: ["https://www.sec.gov/"], verified: true }],
    },
  ],
});

export function spineOutline(): Outline {
  const { outline, errors } = parseOutline(SPINE_OUTLINE_TEXT);
  if (!outline) throw new Error(`The Spine fixture's outline does not load:\n${errors.join("\n")}`);
  return outline;
}

/** The fixture with a change laid on: a deep copy, then `edit` applied to it. */
export function spineData(edit: (d: typeof SPINE_TOPIC_DATA) => void = () => {}): typeof SPINE_TOPIC_DATA {
  const d = structuredClone(SPINE_TOPIC_DATA);
  edit(d);
  return d;
}

/** The fixture (or a changed copy) as the Course Map loads it with its outline. */
export function parseSpine(data: object = SPINE_TOPIC_DATA): { map?: CourseMap; errors: string[] } {
  return parseCourseMap([{ name: "spine-01-worth.yaml", text: stringify(data) }], spineOutline());
}

/** The fixture's Course Map, throwing if it does not load. */
export function spineMap(data: object = SPINE_TOPIC_DATA): CourseMap {
  const { map, errors } = parseSpine(data);
  if (!map) throw new Error(`The Spine fixture does not load:\n${errors.join("\n")}`);
  return map;
}

/** The fixture's Topic as the Course Map loads it. */
export const spineTopic = (data: object = SPINE_TOPIC_DATA): Topic => spineMap(data).topic("spine-01-worth")!;
