import { describe, expect, it } from "vitest";
import {
  blockedNumbersFrom,
  capFor,
  checkReply,
  correctionText,
  countWords,
  dropSumAsks,
  fixReply,
  splitAsk,
  sumAsked,
  trimToCap,
  type OpenItem,
  type ReplyCheckContext,
  type ReplyDraft,
  type ReplyWidget,
  type StepKind,
} from "./reply-checks";

/** Percent's Check 1 questions, as an open attempt holds them. */
const BP_DEFINITION: OpenItem = {
  prompt: "How many basis points are there in 0.6 of a percentage point?",
  choices: ["6", "60", "600", "0.6"],
  answer: "60",
};
const WRONG_DESCRIPTION: OpenItem = {
  prompt: "A central bank moves its rate from 4.00% to 4.50%. Which description of this move is wrong?",
  choices: ["The rate is up 50 basis points", "The rate is up half of a percentage point", "The rate is up 50 percent", "The rate is up 12.5 percent of its old level"],
  answer: "The rate is up 50 percent",
};
const BOND_120: OpenItem = {
  prompt: "A bond yield rises by 120 basis points. How many percentage points is that?",
  choices: ["12 percentage points", "1.2 percentage points", "0.12 percentage points", "120 percentage points"],
  answer: "1.2 percentage points",
};
const CHECK_1 = [BP_DEFINITION, WRONG_DESCRIPTION, BOND_120];

describe("countWords", () => {
  it("counts the words a Learner reads", () => {
    expect(countWords("A savings rate goes from 4% to 5%.")).toBe(8);
  });

  it("ignores Widget fences, Citation markers and Markdown symbols", () => {
    const text = [
      "## Points",
      "The Fed moved by **25 bp**.[1](/passages/12?blocks=0-2)",
      "",
      "```openui-lang",
      'root = Widget("One rate change", [old, new])',
      "```",
      "- 5 − 4 = 1",
    ].join("\n");
    // Points, The, Fed, moved, by, 25, bp, 5, 4, 1
    expect(countWords(text)).toBe(10);
  });
});

describe("capFor", () => {
  it("is 80 words at Concept, Your turn and Check", () => {
    for (const step of ["concept", "your_turn", "check"] as StepKind[]) expect(capFor(step)).toBe(80);
  });

  it("is 120 words at Story, Explore, Reveal and Principle, and with no step", () => {
    for (const step of ["story", "explore", "reveal", "principle", "none"] as StepKind[]) expect(capFor(step)).toBe(120);
  });

  it("rises to 120 for a worked example and a Go deeper reply at any step", () => {
    expect(capFor("concept", "worked_example")).toBe(120);
    expect(capFor("check", "go_deeper")).toBe(120);
    expect(capFor("your_turn", "worked_example")).toBe(120);
  });

  it("keeps the step's cap for every other Reply kind", () => {
    for (const kind of ["feedback", "rule", "quick_try", "reteach", "hint", "answer_question", "offer_park", "simpler"] as const) {
      expect(capFor("concept", kind)).toBe(80);
      expect(capFor("story", kind)).toBe(120);
    }
  });
});

describe("splitAsk", () => {
  it("takes a last line that asks a question as the ask", () => {
    expect(splitAsk("Points are the new rate minus the old rate.\n\nA rate goes from 3% to 3.5%: what do you call that gap?")).toEqual({
      message: "Points are the new rate minus the old rate.",
      ask: "A rate goes from 3% to 3.5%: what do you call that gap?",
    });
  });

  it("takes a last line that tells the Learner what to do as the ask", () => {
    expect(splitAsk("That is the whole rule.\nPress Next when you are ready.").ask).toBe("Press Next when you are ready.");
  });

  it("has no ask when the last line only tells", () => {
    expect(splitAsk("Points are the new rate minus the old rate.\nThat is all there is to it.")).toEqual({
      message: "Points are the new rate minus the old rate.\nThat is all there is to it.",
      ask: null,
    });
  });

  it("keeps only the last sentence of a long last line as the ask", () => {
    expect(splitAsk("Good. A rate goes from 3% to 3.5%. How many points did it move?")).toEqual({
      message: "Good. A rate goes from 3% to 3.5%.",
      ask: "How many points did it move?",
    });
  });

  it("looks past a Widget fence and Citation markers to the last line", () => {
    const { ask } = splitAsk('Rates moved.[1](/passages/3?blocks=0-1)\nWhich number is the move in basis points?\n```openui-lang\nroot = Widget("x", [])\n```');
    expect(ask).toBe("Which number is the move in basis points?");
  });
});

describe("blockedNumbersFrom", () => {
  it("is every number in the open questions and their choices", () => {
    expect(new Set(blockedNumbersFrom(CHECK_1))).toEqual(new Set(["0.6", "6", "60", "600", "4", "4.5", "50", "12.5", "120", "12", "1.2", "0.12"]));
  });

  it("normalises 4.5, 4.50 and 4.50% to one number", () => {
    expect(blockedNumbersFrom([{ prompt: "From 4.50% to 4.5 and then 4.50", choices: [] }])).toEqual(["4.5"]);
  });

  it("reads rupee amounts, Indian commas and falls", () => {
    expect(new Set(blockedNumbersFrom([{ prompt: "A fee of ₹1,00,000 falls by −30 bp", choices: ["$2.50"] }]))).toEqual(new Set(["100000", "30", "2.5"]));
  });

  it("is empty when no quiz is open", () => {
    expect(blockedNumbersFrom([])).toEqual([]);
  });
});

/** A rupee Topic: Percent's Case figures are rates, not dollar amounts. */
function ctx(over: Partial<ReplyCheckContext> = {}): ReplyCheckContext {
  return {
    step: "concept",
    exampleCurrency: "INR",
    caseCurrencies: [],
    openItems: [],
    internalWords: ["num-percent-bps", "check-1", "pb-q-bp-definition", "rate-change-three-ways"],
    ...over,
  };
}

function draft(text: string, widgets: ReplyWidget[] = [], savedRule: string | null = null): ReplyDraft {
  return { text, widgets, savedRule };
}

function rules(d: ReplyDraft, c: ReplyCheckContext): string[] {
  return checkReply(fixReply(d), c).map((p) => p.rule);
}

describe("fixReply", () => {
  it("strips emoji and decorative arrows", () => {
    expect(fixReply(draft("Nice 🎉 work.\n➜ Points first.\nIt went 4% → 5%.")).text).toBe("Nice work.\nPoints first.\nIt went 4% to 5%.");
  });

  it("flattens headings", () => {
    expect(fixReply(draft("## Points\nPoints are the new rate minus the old.")).text).toBe("Points\nPoints are the new rate minus the old.");
  });

  it("keeps the first bold span only", () => {
    expect(fixReply(draft("**Points** are a difference. **Basis points** are hundredths. __Percent__ is relative.")).text).toBe(
      "**Points** are a difference. Basis points are hundredths. Percent is relative.",
    );
  });

  it("leaves Widget fences as they are", () => {
    const fence = '```openui-lang\nroot = Widget("Rate ➜ 🎯", [a])\n```';
    expect(fixReply(draft(`Here.\n${fence}`)).text).toBe(`Here.\n${fence}`);
  });

  it("keeps the Widgets and the saved rule", () => {
    const w: ReplyWidget = { kind: "recipe", id: "rate_move", params: { old: 2, new: 3 } };
    expect(fixReply(draft("Here 🎉.", [w], "change times 100"))).toEqual(draft("Here.", [w], "change times 100"));
  });
});

describe("V1: words within the cap", () => {
  const long = Array.from({ length: 10 }, () => "Points are the new rate minus the old rate, said plainly.").join(" ");

  it("passes 80 words at Concept", () => {
    expect(rules(draft("Points are the new rate minus the old rate.\nWhich word do traders use for that gap?"), ctx())).toEqual([]);
  });

  it("fails 100 words at Concept and passes them at Story", () => {
    expect(rules(draft(long), ctx({ step: "concept" }))).toContain("V1");
    expect(rules(draft(long), ctx({ step: "story" }))).not.toContain("V1");
  });

  it("counts the ask with the message", () => {
    const seventyNine = Array.from({ length: 79 }, () => "word").join(" ") + ".";
    expect(rules(draft(`${seventyNine}\nHow many points?`), ctx())).toContain("V1");
  });
});

/** The Percent Session's reply after the third attempt: two miss explanations and seven asks. */
const SEVEN_ASKS = [
  "Two slips this time.",
  "",
  "First: 0.6 of a point is 60 bp, not 6. Multiply by 100.",
  "Second: 120 bp is 1.2 points. Divide by 100.",
  "",
  "Set the widget to 4% and 4.5% and watch the readouts.",
  "Why do 50 bp and 12.5% describe the same move?",
  "Do its three Guided Tasks.",
  "Say the basis-point number out loud first.",
  "Ask me anything that still feels unclear.",
  "Press Try again when you are ready.",
].join("\n");

describe("V2: one question and one ask", () => {
  it("fails the Percent Session's seven-ask reply", () => {
    expect(rules(draft(SEVEN_ASKS), ctx({ step: "check" }))).toContain("V2");
  });

  it("fails two questions in the message", () => {
    expect(rules(draft("How far did it move? Is that points or percent?\nWhat is 3% to 3.5% in points?"), ctx())).toContain("V2");
  });

  it("passes one question in the message plus the ask", () => {
    expect(rules(draft("How far did it move? One point.\nWhat is 3% to 3.5% in points?"), ctx())).toEqual([]);
  });

  it("fails an ask over 25 words", () => {
    const ask = "Now take the rate that went from three percent to three and a half percent last year and tell me how many points and basis points it moved?";
    expect(rules(draft(`Points first.\n${ask}`), ctx())).toContain("V2");
  });

  it("fails a task line besides the ask", () => {
    expect(rules(draft("Open the Widget and set the old rate.\nTry 3% to 3.5%.\nHow many points did it move?"), ctx())).toContain("V2");
  });

  it("fails two task lines when the reply has no ask", () => {
    expect(rules(draft("Try 3% to 3.5% in your head.\nOpen the Widget and set the old rate.\nThat is a move of half a point."), ctx())).toContain("V2");
  });

  it("allows a task line when the reply has no ask", () => {
    expect(rules(draft("Try 3% to 3.5% in your head.\nThat is a move of half a point."), ctx())).toEqual([]);
  });
});

describe("V3: plain style", () => {
  it("fails banned phrases", () => {
    expect(rules(draft("Great question! Points are a difference.\nWhich word do traders use for that gap?"), ctx())).toEqual(["V3"]);
    expect(rules(draft("Certainly. Points are a difference."), ctx())).toEqual(["V3"]);
    expect(rules(draft("Absolutely right."), ctx())).toEqual(["V3"]);
  });

  it("fails emoji, arrows and extra bold before the fix, and passes after it", () => {
    const d = draft("**Points** 🎉 ➜ **bp**.\nWhich word do traders use for that gap?");
    expect(checkReply(d, ctx()).map((p) => p.rule)).toContain("V3");
    expect(checkReply(fixReply(d), ctx())).toEqual([]);
  });
});

const RATE_MOVE: ReplyWidget = { kind: "recipe", id: "rate_move", params: { old: 2, new: 3, mode: "show" } };

describe("V4: a valid Widget", () => {
  it("passes one Widget the validator accepts", () => {
    expect(rules(draft("This shows a rate moving from 2% to 3%.", [RATE_MOVE]), ctx({ widgetOk: () => null }))).toEqual([]);
  });

  it("exactly one, and code fills a missing one: no Widget is no problem, two are (E4a)", () => {
    expect(checkReply(draft("A basis point is one hundredth of a point."), ctx())).toEqual([]);
    const two = checkReply(draft("Two pictures.", [RATE_MOVE, { kind: "written", id: "rate-change-three-ways" }]), ctx());
    expect(two).toEqual([{ rule: "V4", message: "Your reply showed 2 Widgets. The limit is one." }]);
  });

  it("fails two Widgets in one reply", () => {
    expect(rules(draft("Two pictures.", [RATE_MOVE, { kind: "written", id: "rate-change-three-ways" }]), ctx())).toEqual(["V4"]);
  });

  it("fails a Widget the validator rejects, with its reason", () => {
    const problems = checkReply(draft("Here.", [RATE_MOVE]), ctx({ widgetOk: () => "unknown recipe" }));
    expect(problems.map((p) => p.rule)).toEqual(["V4"]);
    expect(problems[0].message).toContain("unknown recipe");
  });
});

describe("V5: no open quiz answer", () => {
  const quizOpen = ctx({ step: "check", openItems: CHECK_1 });

  it("fails 60 basis points said while the 0.6-point question is open", () => {
    expect(rules(draft("Think of it this way: 0.6 of a point is 60 bp, because a point is 100 bp.\nWhat is 0.3 of a point in bp?"), quizOpen)).toEqual([
      "V5",
    ]);
  });

  it("fails an answer given in words with its question's numbers", () => {
    expect(rules(draft("From 4% to 4.5% the rate is up 50 percent? No, that one is wrong."), quizOpen)).toContain("V5");
  });

  it("passes the same idea taught on other numbers", () => {
    expect(rules(draft("A point is 100 bp. So 0.2 of a point is 20 bp.\nWhich name would a trader give that move?"), quizOpen)).toEqual([]);
  });

  it("fails a reply that confirms the open answer without its question's numbers", () => {
    expect(rules(draft("Yes, 60 is right."), quizOpen)).toContain("V5");
    expect(rules(draft("The answer is 60 basis points."), quizOpen)).toContain("V5");
    expect(rules(draft("Correct: 60 bp."), quizOpen)).toContain("V5");
    expect(rules(draft("You got it, 60."), quizOpen)).toContain("V5");
  });

  it("passes teaching 0.6 into 60 bp while a question about 0.8 points is open", () => {
    const open: OpenItem = { prompt: "How many basis points are there in 0.8 of a percentage point?", choices: ["8", "80", "800"], answer: "80" };
    const c = ctx({ step: "check", openItems: [open] });
    expect(rules(draft("Take 0.6 points: that is 60 bp, because a point is 100 bp.\nWhich name would a trader give that move?"), c)).toEqual([]);
  });

  it("passes the open answer once no quiz is open", () => {
    expect(rules(draft("0.6 of a point is 60 bp.\nWhat is 0.3 of a point in bp?"), ctx({ step: "check" }))).toEqual([]);
  });

  it("fails a Widget preset that uses a blocked number", () => {
    const widget: ReplyWidget = { kind: "recipe", id: "rate_move", params: { old: 4, new: "4.50%", mode: "show" } };
    expect(rules(draft("This shows a rate move.", [widget]), quizOpen)).toEqual(["V5"]);
  });

  it("passes a Widget preset on other numbers", () => {
    expect(rules(draft("This shows a rate moving from 2% to 3%.", [RATE_MOVE]), quizOpen)).toEqual([]);
  });

  it("fails a saved rule that gives the answer", () => {
    expect(rules(draft("Yes.", [], "0.6 of a point is 60 bp"), quizOpen)).toEqual(["V5"]);
  });
});

describe("V6: no app words", () => {
  it('fails "Code recorded a pass on Check 1"', () => {
    expect(rules(draft("Code recorded a pass on Check 1, so the next step is open."), ctx())).toContain("V6");
  });

  it('fails "Code" as the subject of a sentence', () => {
    expect(rules(draft("Right. The code marks this one as passed."), ctx())).toEqual(["V6"]);
    expect(rules(draft("Right. Code will open the next step."), ctx())).toEqual(["V6"]);
  });

  it("fails Topic, Check, question and Widget ids, and tool names", () => {
    expect(rules(draft("This is check-1 of num-percent-bps."), ctx())).toEqual(["V6"]);
    expect(rules(draft("I will call open_widget now."), ctx())).toEqual(["V6"]);
    expect(rules(draft("You are at your_turn."), ctx())).toEqual(["V6"]);
  });

  it("fails the named app internals", () => {
    for (const phrase of ["Course Navigator", "Session item", "Reply kind", "Skill state"])
      expect(rules(draft(`The ${phrase} says so.`), ctx())).toEqual(["V6"]);
  });

  it("allows the Learner's app words", () => {
    const text = "This Topic has three Checks. Open the Check tab, or use the Widget, a Quick try or the Concept card. Go deeper or Show me in a widget if you like.\nPress Next.";
    expect(rules(draft(text), ctx({ step: "story" }))).toEqual([]);
  });

  it("does not treat an allowed word passed as an id as banned", () => {
    expect(rules(draft("This Topic is short."), ctx({ internalWords: ["topic"] }))).toEqual([]);
  });
});

describe("V7: the right currency", () => {
  it("fails a dollar amount in a rupee Topic", () => {
    expect(rules(draft("Say you save $1,000 at 4%."), ctx())).toEqual(["V7"]);
    expect(rules(draft("Say you save US$1,000 at 4%."), ctx())).toEqual(["V7"]);
    expect(rules(draft("Say you save 1,000 USD at 4%."), ctx())).toEqual(["V7"]);
  });

  it('fails a "$" slider label in a rupee Topic', () => {
    const widget: ReplyWidget = { kind: "recipe", id: "grow_money", params: { amount: 1000, rate: 4, label: "Deposit ($)" } };
    expect(rules(draft("Here is your deposit growing.", [widget]), ctx())).toEqual(["V7"]);
  });

  it("passes rupee amounts in a rupee Topic", () => {
    expect(rules(draft("Say you save ₹1,000 at 4%."), ctx())).toEqual([]);
  });

  it("passes a dollar amount when a Case is in dollars", () => {
    expect(rules(draft("The ticket was worth $1.537 billion."), ctx({ caseCurrencies: ["USD"] }))).toEqual([]);
  });

  it("fails a rupee amount when the Topic's examples are in another currency and no Case uses rupees", () => {
    expect(rules(draft("Say you save ₹1,000."), ctx({ exampleCurrency: "USD", caseCurrencies: ["USD"] }))).toEqual(["V7"]);
    expect(rules(draft("Say you save ₹1,000."), ctx({ exampleCurrency: "USD", caseCurrencies: ["INR"] }))).toEqual([]);
  });
});

/** D1a's first 12 sum-asking stems and first 12 story or lingo asks (src/teaching/no-sums.test.ts). */
const SUM_STEMS = [
  "How many basis points did the rate move?",
  "Can you work out how much ₹2,000 grows to?",
  "Calculate the new EMI.",
  "What is 0.25% in basis points?",
  "So what's 3% of ₹10,000 worth?",
  "If you add 50 bp to 6.5%, what rate do you get?",
  "What would ₹1 lakh be worth after 10 years?",
  "1.2 points times 100 is how many bp?",
  "Compute the debt to equity ratio.",
  "Figure out the yearly growth.",
  "What's 6% minus 4%?",
  "Give it to two decimal places.",
];
const STORY_ASKS = [
  "What does a basis point mean to you?",
  "Which would you pick and why: 7% or 7.5%?",
  "Why did the Fed move in February 1994?",
  "What is the point of quoting moves in bps?",
  "How many people lined up outside the bank?",
  "WeWork said revenue was $1.8 billion. Sound like a lot?",
  "Say it in your own words: what is a percentage point?",
  "RBI cut by 0.25%. What do traders call that move?",
  "Which headline gets the 1994 move right?",
  "What happened to Satyam's cash, do you think?",
  "Its compute costs fell. Why might that matter?",
  "ETFs work out a NAV each day. What is a NAV?",
];
const V8_CTX = { step: "story" as const, caseCurrencies: ["USD", "INR"] };
const v8s = (text: string) => checkReply(fixReply(draft(text)), ctx(V8_CTX)).filter((p) => p.rule === "V8");

describe("V8: no sum asked of the Learner", () => {
  it.each(SUM_STEMS)("gives exactly one V8 when the ask is a sum: %s", (stem) => {
    const found = v8s(`Rates move in small steps, and traders name them in basis points.\n${stem}`);
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/^Your reply asks the Learner to work out a sum \("[^"]+"\)\. Ask what it means, what someone in the story did, or which choice is right; never for a number\.$/);
  });

  it.each(STORY_ASKS)("gives none when the ask is about the story or a word: %s", (stem) => {
    expect(v8s(`Rates move in small steps, and traders name them in basis points.\n${stem}`)).toEqual([]);
  });

  it("leaves a statement alone: a short sum said as a fact is not asked", () => {
    expect(v8s("1 point times 100 is 100 bp.")).toEqual([]);
  });

  // The ask sentence is read with the reply's numbers as context (ADR 0009): the numbers to work the figure out from
  // may sit in a statement before the question, on its line or the line above.
  it.each([
    ["on the ask's line", "Infosys earned ₹30 profit on ₹100 of sales. What is its margin?"],
    ["on the line above", "Infosys earned ₹30 profit on ₹100 of sales.\nWhat is its margin?"],
  ])("finds a figure asked for when the reply gives the numbers %s", (_where, reply) => {
    expect(sumAsked(reply)).toBe("What is its margin");
    expect(v8s(reply)).toHaveLength(1);
    expect(dropSumAsks(reply)).toBe("Infosys earned ₹30 profit on ₹100 of sales.");
  });

  // T1: a lingo ask stays a lingo ask in a reply that gives numbers (a %, a date, "Check 1").
  it.each([
    "RBI held the repo rate at 6.5%.\nWhat is a yield?",
    "RBI held the repo rate at 6.5% in June 2024.\nWhat is a margin?",
    "That is Check 1 done.\nWhat is the difference between the repo rate and the reverse repo rate?",
  ])("leaves a lingo ask alone in a reply that gives numbers: %s", (reply) => {
    expect(sumAsked(reply)).toBeNull();
    expect(v8s(reply)).toEqual([]);
    expect(dropSumAsks(reply)).toBe(reply);
  });

  it("still finds a figure asked of the story in a reply that gives the numbers", () => {
    expect(sumAsked("Infosys earned 30 on 100 of sales. What is its margin?")).toBe("What is its margin");
  });

  it("leaves a words question for a figure alone when the reply gives no numbers", () => {
    const reply = "Infosys sells software and keeps part of each sale as profit.\nWhat is its margin telling you about the business?";
    expect(sumAsked(reply)).toBeNull();
    expect(dropSumAsks(reply)).toBe(reply);
  });

  it("lists V8 beside V2 when the reply breaks both", () => {
    const found = rules(draft("Is that a big move? Is it points or percent?\nWhat is 0.25% in basis points?"), ctx(V8_CTX));
    expect(found).toEqual(expect.arrayContaining(["V2", "V8"]));
  });
});

describe("Appendix A's good replies, said in words", () => {
  const quizOpen = { step: "check" as const, openItems: CHECK_1 };
  const cases: { name: string; d: ReplyDraft; c: Partial<ReplyCheckContext> }[] = [
    {
      name: "a Widget asked for during an open quiz",
      d: draft("Sure. This one shows a rate moving from 2% to 3%. The three numbers under the line each answer a different question.\nWhich of the three numbers is the move in basis points?", [RATE_MOVE]),
      c: { ...quizOpen, replyKind: "answer_question" },
    },
    {
      name: "starting from the beginning",
      d: draft(
        'Okay. One idea first. A savings rate goes from 4% to 5%. How far did it move? Five minus four is **1 percentage point**. "Points" is short for percentage points. It is the new rate minus the old rate.\nA rate goes from 3% to 3.5%: what do you call that gap?',
      ),
      c: { step: "concept", replyKind: "rule" },
    },
    {
      name: "fill-in boxes after repeat misses",
      d: draft("0.3 is right in points. One step is left. Use two boxes. Box 1: 5.0 minus 4.6 is how many points. Box 2: that number times 100 is how many basis points.\nFill in both boxes."),
      c: { step: "your_turn", replyKind: "reteach" },
    },
    {
      name: "a practice Widget when the Learner wants it over with",
      d: draft("Okay. Shortest path.\nWhich reading in the Widget is right?", [{ kind: "recipe", id: "rate_move", params: { old: 2, new: 2.5, mode: "practice" } }]),
      c: { step: "concept", replyKind: "quick_try" },
    },
    {
      name: "the Learner's own rule",
      d: draft("Yes. That is percent change: **the change times 100, divided by the old value.** The order does not matter.\nA price goes from ₹50 to ₹60: what is the percent change?", [], "change times 100, then divide by the original"),
      c: { step: "concept", replyKind: "feedback" },
    },
    {
      name: "asked for an open answer",
      d: draft("I can't give the answer to an open quiz question. I can show the method on other numbers. Basis points are points times 100. So 0.2 of a point is 20 bp.\nNow you try: which word names a move that small?"),
      c: { ...quizOpen, replyKind: "hint" },
    },
  ];

  for (const { name, d, c } of cases)
    it(`passes ${name}`, () => {
      expect(checkReply(fixReply(d), ctx({ ...c, widgetOk: () => null }))).toEqual([]);
    });
});

/** A 142-word reply: 20 seven-word sentences in two paragraphs, then a two-word ask. */
const LONG_REPLY = [
  Array.from({ length: 10 }, (_, i) => `Sentence ${i + 1} says one small plain thing.`).join(" "),
  Array.from({ length: 10 }, (_, i) => `Sentence ${i + 11} says one more plain thing.`).join(" "),
  "Ready now?",
].join("\n\n");

describe("correctionText", () => {
  it("names each failed rule and its limit", () => {
    const c = ctx();
    const d = draft(LONG_REPLY);
    const problems = checkReply(d, c);
    const text = correctionText(problems, d, c);
    expect(text).toContain("Your reply was 142 words. The limit is 80. Keep one idea and one ask.");
  });

  it("lists every problem, one per line", () => {
    const c = ctx({ step: "check" });
    const d = draft(`Code recorded a pass. Say you save $100.\n${SEVEN_ASKS}`);
    const problems = checkReply(fixReply(d), c);
    expect(problems.map((p) => p.rule)).toEqual(expect.arrayContaining(["V2", "V3", "V6", "V7"]));
    const text = correctionText(problems, d, c);
    for (const p of problems) expect(text).toContain(p.message);
  });

  it("tells a reply that leaked an open answer which numbers to keep away from", () => {
    const c = ctx({ step: "check", openItems: [BP_DEFINITION] });
    const d = draft("0.6 of a point is 60 bp.");
    const text = correctionText(checkReply(d, c), d, c);
    expect(text).toContain("0.6, 6, 60, 600");
  });

  it("is empty when nothing failed", () => {
    expect(correctionText([], draft("Fine."), ctx())).toBe("");
  });
});

describe("trimToCap", () => {
  it("cuts at the last full sentence within the cap and keeps the ask", () => {
    const trimmed = trimToCap(LONG_REPLY, 80);
    expect(countWords(trimmed)).toBeLessThanOrEqual(80);
    // 78 words are left after the ask: ten sentences of the first paragraph and one of the second (77 words).
    expect(trimmed).toBe(
      `${Array.from({ length: 10 }, (_, i) => `Sentence ${i + 1} says one small plain thing.`).join(" ")}\n\nSentence 11 says one more plain thing.\n\nReady now?`,
    );
  });

  it("cuts inside the first paragraph when the cap is small", () => {
    // 28 words are left after the ask: four sentences.
    expect(trimToCap(LONG_REPLY, 30)).toBe(
      "Sentence 1 says one small plain thing. Sentence 2 says one small plain thing. Sentence 3 says one small plain thing. Sentence 4 says one small plain thing.\n\nReady now?",
    );
  });

  it("leaves a reply within the cap as it was", () => {
    expect(trimToCap("Points are a difference.\nWhich word do traders use for that gap?", 80)).toBe("Points are a difference.\nWhich word do traders use for that gap?");
  });

  it("does not count Citation markers or Widget fences", () => {
    const text = 'Rates move in points.[1](/passages/2?blocks=0-1) A point is 100 bp.\n```openui-lang\nroot = Widget("x", [a, b, c, d, e, f])\n```\nHow many bp is half a point?';
    // Nine words of message and seven of ask.
    expect(trimToCap(text, 16)).toBe(text);
  });
});
