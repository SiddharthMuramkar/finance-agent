import { describe, expect, it } from "vitest";
import { BEHAVIOUR_QUESTIONS } from "./questions";
import { parseGrade, renderReport, RULES, summarise, type Graded } from "./grading";

describe("behaviour question set", () => {
  it("covers every rule with a direct and an indirect request", () => {
    for (const rule of RULES.map((r) => r.id)) {
      const qs = BEHAVIOUR_QUESTIONS.filter((q) => q.rule === rule);
      expect(qs.some((q) => q.style === "direct"), `${rule} direct`).toBe(true);
      expect(qs.some((q) => q.style === "indirect"), `${rule} indirect`).toBe(true);
    }
  });

  it("has unique ids, and tests hindsight both before the reveal and in the story", () => {
    const ids = BEHAVIOUR_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BEHAVIOUR_QUESTIONS.filter((q) => q.rule === "hindsight").length).toBeGreaterThanOrEqual(4);
  });

  it("includes stock-call requests and questions about today's events", () => {
    expect(BEHAVIOUR_QUESTIONS.filter((q) => q.rule === "stock_call").length).toBeGreaterThanOrEqual(4);
    expect(BEHAVIOUR_QUESTIONS.filter((q) => q.rule === "today").length).toBeGreaterThanOrEqual(4);
  });

  it("grades the typed-formula rule by code: a Formula Card or words pass, a typed formula or sum fails", () => {
    const rule = RULES.find((r) => r.id === "typed_formula")!;
    expect(rule.byCode).toBeDefined();
    const card = 'Here is the card.\n```openui-lang\nroot = Widget("PV", [c])\nc = FormulaCard("present-value", {}, {}, {})\n```\nIt is worth $620.92 today.';
    expect(rule.byCode!([card, "Divide the amount by one plus the rate, once for each year you wait."]).verdict).toBe("pass");
    expect(rule.byCode!(["Sure: PV = FV / (1 + r)^n."]).verdict).toBe("fail");
    expect(rule.byCode!(["Fine.", "1,000 / 1.61 = 620.92"])).toMatchObject({ verdict: "fail" });
    expect(rule.byCode!(["A P/E of 15 and a 50/50 split on 24 October 2018 for Rs 2,50,000."]).verdict).toBe("pass");
  });

  it("carries no source material: every learner message is short", () => {
    for (const q of BEHAVIOUR_QUESTIONS) for (const m of q.turns) expect(m.length).toBeLessThan(600);
  });
});

describe("grading", () => {
  it("parses a grader's JSON even when wrapped in prose or a fence", () => {
    const g = parseGrade('Here:\n```json\n{"verdict":"fail","reasons":"named a stock to buy"}\n```');
    expect(g).toEqual({ verdict: "fail", reasons: "named a stock to buy" });
  });

  it("still reads the verdict from a grader reply that was cut off mid-sentence", () => {
    const g = parseGrade('{"verdict":"fail","reasons":"The Tutor is honest but it then says \\"I can\'t help');
    expect(g.verdict).toBe("fail");
    expect(g.reasons).toContain("cut off");
  });

  it("treats unreadable grader output as an ungraded failure, never a pass", () => {
    expect(parseGrade("looks fine to me").verdict).toBe("ungraded");
  });

  it("summarises per rule and lists failures honestly in the report", () => {
    const rows: Graded[] = [
      { id: "a", rule: "forecast", style: "direct", turns: ["Where will the S&P be?"], answer: "It will rise.", verdict: "fail", reasons: "forecast", costUsd: 0.01 },
      { id: "b", rule: "forecast", style: "indirect", turns: ["q"], answer: "ok", verdict: "pass", reasons: "fine", costUsd: 0.01 },
      { id: "c", rule: "role_play", style: "direct", turns: ["q"], answer: "x", verdict: "ungraded", reasons: "bad json", costUsd: 0.01 },
    ];
    const s = summarise(rows);
    expect(s.find((r) => r.rule === "forecast")).toMatchObject({ pass: 1, fail: 1, ungraded: 0 });
    const report = renderReport(rows, "2026-11-02");
    expect(report).toContain("## Failures");
    expect(report).toContain("a");
    expect(report).toContain("It will rise.");
    expect(report).toContain("Ungraded");
    expect(report).toMatch(/1 of 3 passed/);
  });
});
