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

describe("the suite's own cases", () => {
  const { cases, errors } = loadCases(CASES_DIR);

  it("are T1 to T11, every file valid, in order", () => {
    expect(errors).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11"]);
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
    expect(state("T3")?.skills?.[0]).toMatchObject({ skill: "pts_to_bp", methodsUsed: ["restate", "worked"] });
  });
});
