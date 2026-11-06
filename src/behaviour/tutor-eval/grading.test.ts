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
