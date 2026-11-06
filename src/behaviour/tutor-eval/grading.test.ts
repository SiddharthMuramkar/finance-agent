import { describe, expect, it } from "vitest";
import type { ReplyCheckContext } from "@/tutor/reply-checks";
import { buildGraderPrompt, codedFailures, judgeRun, parseGrade, RUBRIC, seen } from "./grading";

const ctx: ReplyCheckContext = {
  step: "check",
  exampleCurrency: "INR",
  caseCurrencies: [],
  openItems: [{ prompt: "How many basis points are there in 0.6 of a percentage point?", choices: ["6", "60", "600", "0.6"], answer: "60" }],
  internalWords: ["pb-quiz-language", "num-percent-bps"],
};

const good = seen({
  text: "Here is a rate moving from 2% to 3%. The three readouts each answer a different question.\nWhich readout is the move in basis points?",
  widgets: [{ kind: "recipe", id: "rate_move", params: { old: 2, new: 3, mode: "show" }, labels: ["Rate move"] }],
});

describe("the pass conditions code can tell", () => {
  it("passes the Session's good T1 reply", () => {
    expect(codedFailures([{ kind: "widget" }, { kind: "maxWords", value: 80 }, { kind: "noRefusal" }, { kind: "oneAsk" }], good, ctx)).toEqual([]);
  });

  it("fails the Session's refusal: no Widget, refusal words, and no ask", () => {
    const refusal = seen({ text: "While the quiz is open I can't explain the ideas it tests. Submit first and we will go over it.", widgets: [] });
    const failures = codedFailures([{ kind: "widget" }, { kind: "noRefusal" }, { kind: "oneAsk" }], refusal, ctx);
    expect(failures).toHaveLength(3);
    expect(failures.join("\n")).toMatch(/No Widget/);
    expect(failures.join("\n")).toMatch(/can't/);
    expect(failures.join("\n")).toMatch(/ask/);
  });

  it("counts words, lines, the acknowledgement and the message's sentences", () => {
    const reply = seen({ text: "Okay, let us slow right down and go one tiny step at a time now. One point is 100 bp.\nA second line.\nA third.\nA fourth.\nHow many bp is 0.2 of a point?", widgets: [] });
    expect(codedFailures([{ kind: "maxWords", value: 20 }], reply, ctx)[0]).toMatch(/3\d words; the limit is 20/);
    expect(codedFailures([{ kind: "maxLines", value: 4 }], reply, ctx)[0]).toMatch(/5 lines; the limit is 4/);
    expect(codedFailures([{ kind: "ackMaxWords", value: 8 }], reply, ctx)[0]).toMatch(/acknowledgement.*15 words; the limit is 8/);
    expect(codedFailures([{ kind: "maxMessageSentences", value: 2 }], reply, ctx)[0]).toMatch(/5 sentences; the limit is 2/);
    expect(codedFailures([{ kind: "maxLines", value: 4 }], seen({ text: "One.\n\n```openui-lang\nroot = Widget(\"x\", [])\n```\nTwo?", widgets: [] }), ctx)).toEqual([]);
  });

  it("wants a practice-mode Widget when the case says so, and no open-quiz numbers in it", () => {
    expect(codedFailures([{ kind: "widget", mode: "practice" }], good, ctx)[0]).toMatch(/practice mode/);
    const blocked = seen({ text: "See this.\nWhat do you notice?", widgets: [{ kind: "recipe", id: "rate_move", params: { old: 0.6, new: 1, mode: "practice" }, labels: [] }] });
    expect(codedFailures([{ kind: "widget", mode: "practice" }], blocked, ctx)[0]).toMatch(/0\.6.*open quiz/);
  });

  it("fails a reply that asks for a sum, and passes one that only says a sum as a fact (noSum, D3b)", () => {
    const asks = seen({ text: "A rate goes from 6% to 6.4%.\nHow many basis points is that?", widgets: [] });
    expect(codedFailures([{ kind: "noSum" }], asks, ctx)[0]).toMatch(/asks for a sum \("how many"\)/i);
    const says = seen({ text: "1 point times 100 is 100 bp.\nWhat would a trader call that move?", widgets: [] });
    expect(codedFailures([{ kind: "noSum" }], says, ctx)).toEqual([]);
  });

  // Run 16 (critics MP-1, MP-2, MP-4): T13 turns 5 and 15 asked for a sum indirectly, and noSum passed them.
  it("fails a reply that asks for a sum indirectly: the same steps on the Quick try's numbers, work it out, your turn to calculate (noSum, D3b)", () => {
    const run16 = [
      "Happy to get you there; the last tap stays yours. When a rate goes from 6% to 6.5%, 6.5 minus 6 is 0.5 of a point. Then 0.5 points times 100 is 50 basis points, just as 100 paise make ₹1.\n\nNow do the same steps on the Quick try's numbers and tap your answer.",
      "I'll get you most of the way; the last tap is yours. Going the other way works too: basis points divided by 100 give points, just as 150 paise make ₹1.50. So a move of 150 basis points is 1.5 points.\n\nNow try the same step on the Quick try's numbers and tap your answer.",
    ];
    expect(codedFailures([{ kind: "noSum" }], seen({ text: run16[0], widgets: [] }), ctx)[0]).toMatch(/asks for a sum \("do the same steps"\)/i);
    expect(codedFailures([{ kind: "noSum" }], seen({ text: run16[1], widgets: [] }), ctx)[0]).toMatch(/asks for a sum \("try the same step"\)/i);
    for (const ask of ["The rate went from 2% to 2.75%.\nWork it out and tap your answer.", "Here is a move of 0.4 points.\nYour turn to calculate it in basis points.", "One point is 100 bp.\nNow apply that to the card's numbers."])
      expect(codedFailures([{ kind: "noSum" }], seen({ text: ask, widgets: [] }), ctx), ask).toHaveLength(1);
    // Story and lingo asks, and a tap handed back, are not sums.
    for (const ok of [
      "The reporter would write half a percentage point: the gap between the two rates.\nWould a trader say that in points or in basis points?",
      "Traders do the same thing every morning.\nWhat would you do before the meeting?",
      "Basis points are points times 100, so a rise of 0.2 of a point is 20 bp.\nNow pick your answer to question 1.",
      "The Quick try is just below, so tap it like a pro.",
    ])
      expect(codedFailures([{ kind: "noSum" }], seen({ text: ok, widgets: [] }), ctx), ok).toEqual([]);
  });

  it("wants 2 or 3 stored Choices under the reply (choicesStored, D3a)", () => {
    const choice = (label: string) => ({ id: label, label, says: label, emoji: "eyes" });
    const two = seen({ text: "Okay.\nWhat next?", widgets: [], choices: [choice("Show me"), choice("Quiz me")] });
    expect(codedFailures([{ kind: "choicesStored" }], two, ctx)).toEqual([]);
    expect(codedFailures([{ kind: "choicesStored" }], seen({ text: "Okay.", widgets: [] }), ctx)[0]).toMatch(/No Choices were stored/);
    const four = seen({ text: "Okay.", widgets: [], choices: ["a", "b", "c", "d"].map(choice) });
    expect(codedFailures([{ kind: "choicesStored" }], four, ctx)[0]).toMatch(/4 Choices.*2 or 3/);
  });

  it("reads the saved rule and the park offer", () => {
    const saved = seen({ text: "Yes, that is it.\nA price goes from ₹50 to ₹60. What is the percent change?", widgets: [], savedRule: "percent change = change × 100 ÷ original" });
    expect(codedFailures([{ kind: "savedRule", contains: ["change", "100", "original"] }], saved, ctx)).toEqual([]);
    expect(codedFailures([{ kind: "savedRule", contains: ["change"] }], seen({ text: "Yes.", widgets: [] }), ctx)[0]).toMatch(/No rule was saved/);
    expect(codedFailures([{ kind: "parkOffer" }], seen({ text: "Park it and review tomorrow, or one more short try?", widgets: [] }), ctx)).toEqual([]);
    expect(codedFailures([{ kind: "parkOffer" }], seen({ text: "Here it is again.", widgets: [], parkOffer: true }), ctx)).toEqual([]);
    expect(codedFailures([{ kind: "parkOffer" }], seen({ text: "Let's try once more.", widgets: [] }), ctx)[0]).toMatch(/park/i);
  });

  it("checks plain style as the Learner sees it, and the dollar sign in text and Widget labels", () => {
    const styled = seen({ text: "## Points\n**One** rule and **two** rules ➜ pb-quiz-language. Code recorded a pass on Check 1.\nReady?", widgets: [] });
    // fixReply drops the heading, the arrow and the second bold; the app words are left for the check.
    expect(styled.text).not.toMatch(/##|➜/);
    expect(styled.fixed.length).toBeGreaterThan(0);
    const style = codedFailures([{ kind: "plainStyle" }], styled, ctx).join("\n");
    expect(style).toMatch(/pb-quiz-language/);
    expect(style).toMatch(/Code recorded/);
    expect(style).toMatch(/needed fixing/);
    // A reply that needed no fixing does not trip the raw-reply rule.
    expect(codedFailures([{ kind: "plainStyle" }], seen({ text: "A point is 100 bp.\nWhat is 0.5 of a point?", widgets: [] }), ctx)).toEqual([]);
    expect(codedFailures([{ kind: "noDollar" }], seen({ text: "Say you save $100.", widgets: [] }), ctx)[0]).toMatch(/\$/);
    expect(codedFailures([{ kind: "noDollar" }], seen({ text: "Here.", widgets: [{ kind: "written", id: "x", labels: ["Interest ($)"] }] }), ctx)[0]).toMatch(/Widget/);
  });
});

describe("the grader", () => {
  it("asks the spec's five rubric questions, worded exactly, then the case's own", () => {
    expect(RUBRIC).toEqual([
      "Did it do what the learner asked first?",
      "Is there exactly one idea and one ask?",
      "Could a beginner follow every sentence?",
      "If this was a repeat miss, did it use a new method?",
      "Did it keep back an open quiz answer?",
    ]);
    const prompt = buildGraderPrompt({ stateNote: "Check 1 is open.", message: "can you show me nice widget", reply: good, extra: ["Does it use no second analogy?"] });
    for (const q of RUBRIC) expect(prompt).toContain(q);
    expect(prompt).toContain("6. Does it use no second analogy?");
    expect(prompt).toContain("Check 1 is open.");
    expect(prompt).toContain("rate_move");
  });

  it("reads a full yes-or-no grade; anything partial or unreadable is not a grade", () => {
    const answers = [1, 2, 3, 4, 5, 6].map((n) => ({ n, answer: n === 3 ? "no" : "yes", why: `w${n}` }));
    const g = parseGrade(`Here: ${JSON.stringify({ answers })}`, 6);
    expect(g.ok).toBe(true);
    expect(g.ok && g.answers.filter((a) => !a.yes).map((a) => a.n)).toEqual([3]);
    expect(parseGrade("no json here", 5)).toMatchObject({ ok: false });
    expect(parseGrade(JSON.stringify({ answers: answers.slice(0, 4) }), 6)).toMatchObject({ ok: false });
    expect(parseGrade(JSON.stringify({ answers: [{ n: 1, answer: "maybe" }] }), 1)).toMatchObject({ ok: false });
  });

  it("passes a run only when the checks, the case conditions and every grader answer pass; an unreadable grade fails it", () => {
    const yes = parseGrade(JSON.stringify({ answers: [1, 2, 3, 4, 5].map((n) => ({ n, answer: "yes", why: "" })) }), 5);
    expect(judgeRun({ problems: [], coded: [], grade: yes, questions: RUBRIC })).toEqual({ passed: true, reasons: [] });
    const v1 = judgeRun({ problems: [{ rule: "V1", message: "Your reply was 142 words. The limit is 80." }], coded: [], grade: yes, questions: RUBRIC });
    expect(v1).toEqual({ passed: false, reasons: ["V1: Your reply was 142 words. The limit is 80."] });
    const unreadable = judgeRun({ problems: [], coded: [], grade: parseGrade("??", 5), questions: RUBRIC });
    expect(unreadable.passed).toBe(false);
    expect(unreadable.reasons[0]).toMatch(/grade could not be read/i);
    const no = parseGrade(JSON.stringify({ answers: [1, 2, 3, 4, 5].map((n) => ({ n, answer: n === 2 ? "no" : "yes", why: "two asks" })) }), 5);
    expect(judgeRun({ problems: [], coded: [], grade: no, questions: RUBRIC }).reasons).toEqual(['Grader: no to "Is there exactly one idea and one ask?" (two asks)']);
  });
});

// Round 10 (G-T15, run 23 T15 runs 1 and 2): round 9 made the Tutor write no ask of its own when code posts a Quick try
// after the reply (the spec: code's try is the ask), but the grader still read "it is not the Tutor's ask" and wanted one,
// so a right reply failed. Code's try counts as the reply's one ask; the reply itself must then ask nothing; one idea stays strict.
describe("a Quick try code posts after the reply is the reply's one ask (G-T15)", () => {
  const TRY = 'a Quick try: "If the Fed took its 3% rate to 3.5%, a rise traders call 50 basis points, her story would say:"';
  const noAsk = seen({ text: 'Ha, then you\'ll like this: it\'s words, not maths. "Points" is just the gap between an old rate and a new one.', widgets: [], alsoShown: [TRY] });
  const ownAsk = seen({ text: '"Points" is just the gap between an old rate and a new one.\nWould a trader say points or basis points?', widgets: [], alsoShown: [TRY] });

  it("tells the grader the try is the one ask, so a reply with no ask of its own passes and one with its own ask has two", () => {
    const prompt = buildGraderPrompt({ stateNote: "x", message: "honestly I'm so bad at maths lol", reply: noAsk, extra: [] });
    expect(prompt).not.toContain("it is not the Tutor's ask");
    expect(prompt).toContain("That Quick try is the reply's one ask: the reply itself must ask nothing (no question, no task, no invitation).");
    expect(prompt).toContain('For "exactly one idea and one ask", a reply with no ask of its own passes the ask part; a reply that also asks something has two asks, a no.');
  });

  it("keeps one idea strict: two ideas in one reply (percentage points and basis points) are a no", () => {
    for (const reply of [noAsk, seen({ text: "Hi.", widgets: [] })]) {
      const prompt = buildGraderPrompt({ stateNote: "x", message: "m", reply, extra: [] });
      expect(prompt).toContain('One idea is strict: a reply that teaches two ideas (say, what percentage points are and what basis points are) is a no to "exactly one idea and one ask", whatever its ask.');
    }
  });

  it("leaves the ask rule as it was when code posts no try", () => {
    const prompt = buildGraderPrompt({ stateNote: "x", message: "m", reply: seen({ text: "Hi.", widgets: [] }), extra: [] });
    expect(prompt).not.toContain("That Quick try is the reply's one ask");
  });

  it("oneAsk: with a try posted after the reply, no ask of its own passes and an ask of its own fails as two asks", () => {
    expect(codedFailures([{ kind: "oneAsk" }], noAsk, ctx)).toEqual([]);
    expect(codedFailures([{ kind: "oneAsk" }], ownAsk, ctx)).toEqual([expect.stringMatching(/two asks: its own \("Would a trader say points or basis points\?"\) and the Quick try code posted after it/)]);
    // With no try, a reply still needs its own one ask.
    expect(codedFailures([{ kind: "oneAsk" }], seen({ text: noAsk.text, widgets: [] }), ctx)[0]).toMatch(/no ask/);
  });
});

describe("the grader prompt and Widget Guided Tasks", () => {
  const widgetReply = seen({ text: "Here.\nWhat is the move in points?", widgets: [{ kind: "recipe", id: "rate_move", labels: ["Move the new rate to 4% and read the lines again"] }], savedRule: null, parkOffer: false });
  it("tells the grader Guided Tasks are optional play, not asks, when a Widget was shown", () => {
    const prompt = buildGraderPrompt({ stateNote: "x", message: "m", reply: widgetReply, extra: [] });
    expect(prompt).toMatch(/Guided Tasks .* optional play .* not asks/);
  });
  it("leaves the line out when no Widget was shown", () => {
    const none = seen({ text: "Hi.", widgets: [], savedRule: null, parkOffer: false });
    expect(buildGraderPrompt({ stateNote: "x", message: "m", reply: none, extra: [] })).not.toMatch(/Guided Tasks/);
  });
  it("tells the grader a Widget's sliders are no leak of an open answer, since code keeps the open numbers out of its inputs", () => {
    const prompt = buildGraderPrompt({ stateNote: "x", message: "m", reply: widgetReply, extra: [] });
    expect(prompt).toContain("A Widget's sliders are not a leak of an open quiz answer: code's reply checks already keep the open questions' numbers out of its inputs.");
    const none = seen({ text: "Hi.", widgets: [], savedRule: null, parkOffer: false });
    expect(buildGraderPrompt({ stateNote: "x", message: "m", reply: none, extra: [] })).not.toMatch(/sliders/);
  });
});
