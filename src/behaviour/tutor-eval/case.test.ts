import { describe, expect, it } from "vitest";
import { CASES_DIR, loadCases, parseCase } from "./case";

const live = {
  id: "T1",
  title: "A Widget asked for while the quiz is open",
  kind: "live",
  topic: "num-percent-bps",
  state: { step: "check", check: 1, quiz: { state: "open", questions: ["pb-q-bp-definition"] } },
  message: "can you show me nice widget to explain this",
  pass: [{ kind: "maxWords", value: 80 }, { kind: "noRefusal" }, { kind: "oneAsk" }, { kind: "widget" }],
};

describe("a case file", () => {
  it("reads a live case with its state, message and pass conditions", () => {
    const read = parseCase(JSON.stringify(live), "T1.json");
    expect(read.errors).toEqual([]);
    expect(read.case).toMatchObject({ id: "T1", kind: "live", state: { step: "check", check: 1 }, message: live.message });
    expect(read.case?.kind === "live" && read.case.pass.map((p) => p.kind)).toEqual(["maxWords", "noRefusal", "oneAsk", "widget"]);
  });

  it("names every problem: bad JSON, a missing message, an unknown step, an unknown condition and an unknown field", () => {
    expect(parseCase("{ not json", "x.json").errors[0]).toMatch(/x\.json: not JSON/);
    const bad = { ...live, message: "", state: { step: "reveal_soon", check: 0 }, pass: [{ kind: "maxWordz", value: 80 }], extra: 1 };
    const { errors, case: c } = parseCase(JSON.stringify(bad), "T1.json");
    expect(c).toBeUndefined();
    expect(errors.join("\n")).toMatch(/message/);
    expect(errors.join("\n")).toMatch(/step/);
    expect(errors.join("\n")).toMatch(/check/);
    expect(errors.join("\n")).toMatch(/maxWordz/);
    expect(errors.join("\n")).toMatch(/extra/);
  });

  it("reads the Quick try an answer case names, and refuses a try that is not an id or a key it does not know", () => {
    const answered = { ...live, answer: { skill: "pts-to-bp", verdict: "wrong", try: "pb-try-a3" } };
    expect(parseCase(JSON.stringify(answered), "T3.json").errors).toEqual([]);
    expect(parseCase(JSON.stringify({ ...answered, answer: { ...answered.answer, try: 3 } }), "T3.json").errors.join("\n")).toMatch(/answer "try"/);
    expect(parseCase(JSON.stringify({ ...answered, answer: { ...answered.answer, tries: "pb-try-a3" } }), "T3.json").errors.join("\n")).toMatch(/unknown field "tries"/);
  });

  it("reads the Quick tries answered since the Tutor's last reply, which need a history to be shown in", () => {
    const state = { step: "concept", check: 2, history: [{ learner: "ok", tutor: "Have a go." }], answeredTries: [{ try: "pb-try-b1", input: "50", verdict: "right" }] };
    expect(parseCase(JSON.stringify({ ...live, state }), "T6.json").errors).toEqual([]);
    const bad = { ...state, answeredTries: [{ try: "pb-try-b1", input: "50" }] };
    expect(parseCase(JSON.stringify({ ...live, state: bad }), "T6.json").errors.join("\n")).toMatch(/answeredTries\[0\] needs "try".*"verdict"/);
    const noHistory = { ...state, history: undefined };
    expect(parseCase(JSON.stringify({ ...live, state: noHistory }), "T6.json").errors.join("\n")).toMatch(/"answeredTries" needs a "history"/);
  });

  it("needs a number for the conditions that carry one", () => {
    const { errors } = parseCase(JSON.stringify({ ...live, pass: [{ kind: "maxWords" }] }), "T1.json");
    expect(errors.join("\n")).toMatch(/maxWords.*value/);
  });

  it("reads an aggregate case over other cases and a lint case", () => {
    const agg = parseCase(JSON.stringify({ id: "T9", title: "Style", kind: "aggregate", over: ["T1", "T2"], pass: [{ kind: "plainStyle" }] }), "T9.json");
    expect(agg.errors).toEqual([]);
    expect(agg.case).toMatchObject({ kind: "aggregate", over: ["T1", "T2"] });
    const lint = parseCase(JSON.stringify({ id: "T8", title: "Lint", kind: "lint", pending: "not yet" }), "T8.json");
    expect(lint.case).toMatchObject({ kind: "lint", pending: "not yet" });
  });
});

describe("the D3b case shapes", () => {
  it("reads the noSum and choicesStored conditions", () => {
    const read = parseCase(JSON.stringify({ ...live, pass: [{ kind: "noSum" }, { kind: "choicesStored" }] }), "T14.json");
    expect(read.errors).toEqual([]);
    expect(read.case?.kind === "live" && read.case.pass).toEqual([{ kind: "noSum" }, { kind: "choicesStored" }]);
  });

  it("reads an opener case, which has no message, and refuses a message beside it", () => {
    const { message: _drop, ...noMessage } = live;
    void _drop;
    const opener = { ...noMessage, state: { step: "story", check: 1 }, opener: true };
    expect(parseCase(JSON.stringify(opener), "T12.json").errors).toEqual([]);
    expect(parseCase(JSON.stringify({ ...opener, message: "hi" }), "T12.json").errors.join("\n")).toMatch(/opener.*no "message"/);
    expect(parseCase(JSON.stringify(noMessage), "T1.json").errors.join("\n")).toMatch(/"message" is required/);
  });

  it("reads how many of the three runs a live case needs to pass, from 1 to 3", () => {
    expect(parseCase(JSON.stringify({ ...live, minPasses: 2 }), "T15.json").case).toMatchObject({ minPasses: 2 });
    expect(parseCase(JSON.stringify({ ...live, minPasses: 4 }), "T15.json").errors.join("\n")).toMatch(/minPasses/);
  });

  it("reads a dialogue case: its messages in order, conditions on every reply, one run", () => {
    const dialogue = { id: "T13", title: "No sum in 20 turns", kind: "dialogue", topic: "num-percent-bps", state: { step: "your_turn", check: 1 }, messages: ["a", "b"], runs: 1, pass: [{ kind: "noSum" }] };
    const read = parseCase(JSON.stringify(dialogue), "T13.json");
    expect(read.errors).toEqual([]);
    expect(read.case).toMatchObject({ kind: "dialogue", messages: ["a", "b"], runs: 1 });
    const bad = parseCase(JSON.stringify({ ...dialogue, messages: [], runs: 0, message: "x" }), "T13.json").errors.join("\n");
    expect(bad).toMatch(/"messages"/);
    expect(bad).toMatch(/"runs"/);
    expect(bad).toMatch(/unknown field "message"/);
  });
});

describe("the suite's own cases", () => {
  const { cases, errors } = loadCases(CASES_DIR);

  it("are T1 to T16, every file valid, in order", () => {
    expect(errors).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13", "T14", "T15", "T16"]);
  });

  it("encode the spec's pass conditions in code where code can tell", () => {
    const pass = (id: string) => {
      const c = cases.find((x) => x.id === id)!;
      return c.kind === "lint" ? [] : c.pass;
    };
    expect(pass("T1")).toEqual(expect.arrayContaining([{ kind: "maxWords", value: 80 }, { kind: "noRefusal" }, { kind: "oneAsk" }, { kind: "widget" }]));
    expect(pass("T3")).toEqual([{ kind: "maxWords", value: 60 }]);
    expect(pass("T4")).toEqual(expect.arrayContaining([{ kind: "maxLines", value: 4 }]));
    expect(pass("T5")).toEqual(expect.arrayContaining([{ kind: "maxWords", value: 40 }, { kind: "ackMaxWords", value: 8 }, { kind: "oneAsk" }, { kind: "widget", mode: "practice" }]));
    expect(pass("T6")).toEqual(expect.arrayContaining([{ kind: "maxMessageSentences", value: 2 }, { kind: "oneAsk" }]));
    expect(pass("T6").find((p) => p.kind === "savedRule")).toBeTruthy();
    expect(pass("T7")).toEqual(expect.arrayContaining([{ kind: "maxWords", value: 40 }, { kind: "parkOffer" }]));
    expect(pass("T9")).toEqual([{ kind: "plainStyle" }]);
    expect(pass("T10")).toEqual([{ kind: "noDollar" }]);
    expect(pass("T11")).toEqual([{ kind: "maxWords", value: 60 }]);
    // T11 may say it cannot give the answer: only T1 bans refusal words.
    expect(pass("T11").some((p) => p.kind === "noRefusal")).toBe(false);
  });

  it("aggregate T9 over every reply in T1 to T7, and T10 over every live reply", () => {
    const t9 = cases.find((c) => c.id === "T9")!;
    const t10 = cases.find((c) => c.id === "T10")!;
    expect(t9.kind === "aggregate" && t9.over).toEqual(["T1", "T2", "T3", "T4", "T5", "T6", "T7"]);
    expect(t10.kind === "aggregate" && t10.over).toEqual(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T11"]);
  });

  it("put T1 and T11 at the open Check 1 quiz, and T2 after 0 of 3", () => {
    const state = (id: string) => {
      const c = cases.find((x) => x.id === id)!;
      return c.kind === "live" ? c.state : undefined;
    };
    for (const id of ["T1", "T11"]) expect(state(id)).toMatchObject({ step: "check", check: 1, quiz: { state: "open" } });
    expect(state("T2")).toMatchObject({ step: "check", check: 1, quiz: { state: "missed", correct: 0 } });
    expect(state("T3")?.skills?.[0]).toMatchObject({ skill: "pts-to-bp", methodsUsed: ["restate", "worked"] });
  });

  it("rewrite T3 for Choices: the Learner picks the 0.3 bp choice by its number, and the new method is a half-done choice (D3b)", () => {
    const t3 = cases.find((c) => c.id === "T3")!;
    expect(t3.kind === "live" && t3.message).toBe("0.3");
    expect(t3.kind === "live" && t3.graderChecks?.join(" ")).toMatch(/a half-done choice/);
    expect(JSON.stringify(t3)).not.toMatch(/fill-in boxes/);
  });

  it("encode T12 to T16 as the D3b table gives them", () => {
    const get = (id: string) => cases.find((c) => c.id === id)!;
    const t12 = get("T12");
    expect(t12).toMatchObject({ kind: "live", topic: "num-probability", opener: true, state: { step: "story" }, minPasses: 2 });
    expect(t12.kind === "live" && t12.pass).toEqual([{ kind: "maxWords", value: 120 }, { kind: "noSum" }]);
    expect(t12.kind === "live" && t12.graderChecks?.join(" ")).toMatch(/1998-08-01|1 August 1998/);

    // Appendix D.1's ten persona lines for Percent and Compounding (D01 to D10), twice, in order.
    const D = [
      "what even is a basis point lol",
      "why did the bank change the rate",
      "show me",
      "is this like my credit card?",
      "just tell me the answer pls",
      "explain like I'm 5",
      "why does money grow faster later on",
      "my dad keeps saying CAGR, what is that",
      "quiz me but make it fun",
      "wait did people lose money in 1992??",
    ];
    expect(get("T13")).toMatchObject({ kind: "dialogue", topic: "num-percent-bps", state: { step: "your_turn" }, messages: [...D, ...D], runs: 1, pass: [{ kind: "noSum" }] });

    const t14 = get("T14");
    expect(t14).toMatchObject({ kind: "live", topic: "num-compounding", state: { step: "concept" }, message: "ok and?", minPasses: 2, pass: [{ kind: "choicesStored" }] });
    expect(t14.kind === "live" && t14.graderChecks?.join(" ")).toMatch(/menu/);

    const t15 = get("T15");
    expect(t15).toMatchObject({ kind: "live", topic: "num-percent-bps", state: { step: "your_turn" }, message: "honestly I'm so bad at maths lol", minPasses: 2 });
    expect(t15.kind === "live" && t15.pass).toEqual([{ kind: "noSum" }, { kind: "maxWords", value: 80 }]);

    const t16 = get("T16");
    expect(t16).toMatchObject({ kind: "live", topic: "num-percent-bps", state: { step: "story" }, message: "what even is a basis point lol", minPasses: 2, pass: [{ kind: "noSum" }] });
  });
});
