import { describe, expect, it } from "vitest";
import { RULES } from "@/behaviour/grading";
import { modelComparisonAnswers, modelComparisonRuns } from "@/db/schema";
import { testDb } from "@/test/pglite";
import {
  blindOrder,
  buildRankingPrompt,
  buildRubricPrompt,
  parseRanking,
  parseRubric,
  recommendTeaching,
  renderTeachingReport,
  saveTeaching,
  rubricPassed,
  RUBRIC_ITEMS,
  summariseTeaching,
  TEACHING_QUESTIONS,
  unblind,
  codeRuleVerdicts,
  type TeachingRow,
} from "./teaching";

const allPass = Object.fromEntries(RUBRIC_ITEMS.map((i) => [i.id, "pass"])) as TeachingRow["rubric"];

const row = (model: string, id: string, over: Partial<TeachingRow> = {}): TeachingRow => ({
  questionId: id,
  model,
  turns: ["q"],
  answer: "a",
  inputTokens: 1000,
  outputTokens: 500,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  turnCount: 1,
  costUsd: model === "cheap" ? 0.01 : model === "mid" ? 0.02 : 0.1,
  durationMs: 1000,
  rubric: allPass,
  rules: {},
  rank: 2,
  reasons: "ok",
  graderCostUsd: 0.01,
  ...over,
});

describe("teaching questions", () => {
  it("has about 12 with unique ids and the five kinds the ticket names", () => {
    const ids = TEACHING_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(11);
    expect(ids.length).toBeLessThanOrEqual(13);
    for (const kind of ["insight", "connection", "plain", "formula_words", "own_life"]) expect(TEACHING_QUESTIONS.some((q) => q.kind === kind), kind).toBe(true);
  });
  it("asks the bond-yield connection question and only names shared rules that exist", () => {
    expect(TEACHING_QUESTIONS.some((q) => /discount rates and bond yields/i.test(q.turns[0]))).toBe(true);
    const known = RULES.map((r) => r.id);
    for (const q of TEACHING_QUESTIONS) for (const r of q.rules) expect(known).toContain(r);
    expect(TEACHING_QUESTIONS.some((q) => q.rules.includes("typed_formula"))).toBe(true);
    expect(TEACHING_QUESTIONS.some((q) => q.rules.includes("source_named"))).toBe(true);
    expect(TEACHING_QUESTIONS.some((q) => q.rules.includes("insight_early"))).toBe(true);
  });
  it("keeps the own-life question free of advice requests", () => {
    const q = TEACHING_QUESTIONS.find((x) => x.kind === "own_life")!;
    expect(q.turns[0]).not.toMatch(/should i/i);
  });
});

describe("rubric", () => {
  it("is pitched at a beginner: every term not yet taught explained where it first appears, ambiguous words fail", () => {
    const text = RUBRIC_ITEMS.map((i) => i.rubric).join(" ");
    expect(text).toMatch(/pitched at a beginner, with every term not yet taught explained where it first appears/);
    expect(text).not.toMatch(/MBA/);
    expect(text).toMatch(/ambiguous/i);
  });
  it("puts the shared rule rubric and the hidden Insight into the grader prompt", () => {
    const p = buildRubricPrompt({ turns: ["t"], reply: "r", rules: ["insight_early"], insight: "HIDDEN INSIGHT TEXT", stepNote: "explore" });
    expect(p).toContain("HIDDEN INSIGHT TEXT");
    expect(p).toContain(RULES.find((r) => r.id === "insight_early")!.rubric.slice(0, 40));
  });
  it("reads every item and rule verdict; anything missing or unreadable counts as ungraded", () => {
    const good = JSON.stringify({ items: allPass, rules: { source_named: "fail" }, reasons: "x" });
    const g = parseRubric(good, ["source_named"]);
    expect(g.rubric.accurate).toBe("pass");
    expect(g.rules.source_named).toBe("fail");
    const missing = parseRubric(JSON.stringify({ items: { accurate: "pass" }, rules: {}, reasons: "x" }), []);
    expect(missing.rubric.unambiguous).toBe("ungraded");
    const bad = parseRubric("nope", ["source_named"]);
    expect(Object.values(bad.rubric).every((v) => v === "ungraded")).toBe(true);
    expect(bad.rules.source_named).toBe("ungraded");
    expect(rubricPassed(bad.rubric)).toBe(0);
    expect(rubricPassed(g.rubric)).toBe(RUBRIC_ITEMS.length);
  });
  it("grades the typed-formula rule by code with the shared detector", () => {
    expect(codeRuleVerdicts(["PV = FV / (1 + r)^n"], ["typed_formula"]).typed_formula).toBe("fail");
    expect(codeRuleVerdicts(["Divide the payment by one plus the rate for each year."], ["typed_formula"]).typed_formula).toBe("pass");
    expect(codeRuleVerdicts(["anything"], ["source_named"])).toEqual({});
  });
});

describe("blind ranking", () => {
  it("shuffles the models the same way for the same question, and labels them A, B, C", () => {
    const models = ["cheap", "mid", "top"];
    expect(blindOrder(models, "q1")).toEqual(blindOrder(models, "q1"));
    expect([...blindOrder(models, "q1")].sort()).toEqual([...models].sort());
    const orders = new Set(["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"].map((q) => blindOrder(models, q).join()));
    expect(orders.size).toBeGreaterThan(1);
  });
  it("never shows model names in the ranking prompt", () => {
    const p = buildRankingPrompt({ turns: ["What is PV?"], answers: ["answer one", "answer two", "answer three"], stepNote: "explore" });
    expect(p).toContain("Answer A");
    expect(p).toContain("Answer C");
    expect(p).not.toMatch(/sonnet|opus|fable/i);
  });
  it("parses a full ranking and rejects a partial or repeated one", () => {
    expect(parseRanking('{"ranking":["B","A","C"],"reasons":"r"}', 3)).toEqual(["B", "A", "C"]);
    expect(parseRanking('text {"ranking":["b","a","c"]}', 3)).toEqual(["B", "A", "C"]);
    expect(parseRanking('{"ranking":["A","A","C"]}', 3)).toBeNull();
    expect(parseRanking('{"ranking":["A","B"]}', 3)).toBeNull();
    expect(parseRanking("x", 3)).toBeNull();
  });
  it("turns a ranking back into a rank per model (1 is best)", () => {
    const order = ["top", "cheap", "mid"]; // A=top, B=cheap, C=mid
    expect(unblind(order, ["B", "C", "A"])).toEqual({ cheap: 1, mid: 2, top: 3 });
  });
});

describe("summary and recommendation", () => {
  const rows = [
    row("cheap", "q1", { rank: 2 }),
    row("mid", "q1", { rank: 1 }),
    row("top", "q1", { rank: 3 }),
    row("cheap", "q2", { rank: 2 }),
    row("mid", "q2", { rank: 1 }),
    row("top", "q2", { rank: 3 }),
  ];

  it("reports cost per turn, mean rank, rubric pass rate and shared-rule failures per model", () => {
    const s = summariseTeaching([...rows, row("cheap", "q3", { turnCount: 2, costUsd: 0.04, rank: 1, rules: { typed_formula: "fail" } })]);
    const c = s.find((m) => m.model === "cheap")!;
    expect(c.costPerTurn).toBeCloseTo((0.01 + 0.01 + 0.04) / 4, 6);
    expect(c.meanRank).toBeCloseTo(5 / 3, 6);
    expect(c.rubricRate).toBe(1);
    expect(c.ruleFails).toBe(1);
  });

  it("recommends the cheapest model that is as good as the best, and states every price", () => {
    const rec = recommendTeaching([...rows.map((r) => (r.model === "cheap" ? { ...r, rank: 1.5 } : r))]);
    // cheap mean rank 1.5 vs mid 1: gap 0.5 is wider than the tie margin, so mid wins
    expect(rec.model).toBe("mid");
    expect(rec.text).toContain("$0.0100");
    expect(rec.text).toContain("$0.0200");
    expect(rec.text).toContain("$0.1000");
  });

  it("picks the cheaper model when it is within the margin of the best", () => {
    const close = rows.map((r) => (r.model === "cheap" ? { ...r, rank: 1.1 } : r));
    expect(recommendTeaching(close).model).toBe("cheap");
  });

  it("never picks a model that broke more shared rules than the best, however cheap", () => {
    const broken = rows.map((r) => (r.model === "cheap" ? { ...r, rank: 1, rules: { typed_formula: "fail" as const } } : r));
    const rec = recommendTeaching(broken);
    expect(rec.model).not.toBe("cheap");
  });

  it("treats a lower rubric rate as worse, and ungraded as not passed", () => {
    const weak = rows.map((r) => (r.model === "cheap" ? { ...r, rank: 1, rubric: { ...allPass, accurate: "ungraded" as const, unambiguous: "fail" as const } } : r));
    expect(recommendTeaching(weak).model).not.toBe("cheap");
  });

  it("says so when only one model ran", () => {
    expect(recommendTeaching(rows.filter((r) => r.model === "mid")).model).toBeNull();
  });

  it("renders a report with the limit, the table, the recommendation and every answer", () => {
    const report = renderTeachingReport(rows, "2026-11-03", { models: ["cheap", "mid", "top"], graderModel: "claude-opus-5-5" });
    expect(report).toContain("Teaching comparison");
    expect(report).toContain("Cost per turn");
    expect(report).toContain("Recommendation");
    expect(report).toContain("### q1");
  });
});

describe("saving", () => {
  it("saves the report, recommendation and every answer in the existing comparison tables", async () => {
    const db = await testDb();
    const rows = [row("cheap", "q1", { rank: 1 }), row("mid", "q1", { rank: 2, rubric: { ...allPass, guides: "fail" }, rules: { typed_formula: "fail" } })];
    const id = await saveTeaching(db, { models: ["cheap", "mid"], graderModel: "claude-opus-5-5", fingerprint: "f", rows });
    const [run] = await db.select().from(modelComparisonRuns);
    expect(run.id).toBe(id);
    expect(run.report).toContain("Teaching comparison");
    expect(run.recommendation).toContain("Use cheap");
    expect(run.totalCostUsd).toBeCloseTo(0.01 + 0.01 + 0.02 + 0.01, 6);
    const answers = await db.select().from(modelComparisonAnswers);
    const mid = answers.find((a) => a.model === "mid")!;
    expect(mid.giveAway).toBe("fail");
    expect(mid.pastOnly).toBe("fail");
    expect(mid.reasons).toContain("blind rank 2");
  });
});
