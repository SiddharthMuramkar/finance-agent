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
