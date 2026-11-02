import { describe, expect, it } from "vitest";
import { testDb } from "@/test/pglite";
import { modelComparisonAnswers, modelComparisonRuns } from "@/db/schema";
import {
  buildComparisonGraderPrompt,
  financeBenchQuestions,
  LIMIT_STATEMENT,
  parseComparisonGrade,
  recommend,
  renderComparisonReport,
  saveComparison,
  summariseModels,
  type ComparisonRow,
} from "./compare";

const row = (model: string, id: string, over: Partial<ComparisonRow> = {}): ComparisonRow => ({
  questionId: id,
  source: "own",
  model,
  turns: ["q"],
  answer: "a",
  inputTokens: 1000,
  outputTokens: 500,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  turnCount: 1,
  costUsd: model.includes("haiku") ? 0.001 : 0.02,
  durationMs: 1000,
  correctness: "pass",
  giveAway: "pass",
  pastOnly: "pass",
  reasons: "fine",
  graderCostUsd: 0.01,
  ...over,
});

const HAIKU = "claude-haiku-5-5";
const SONNET = "claude-sonnet-5-5";

describe("grader verdicts", () => {
  it("reads three verdicts, allowing n/a for correctness and give-away", () => {
    const g = parseComparisonGrade('{"correctness":"pass","give_away":"na","past_only":"fail","reasons":"forecast"}');
    expect(g).toEqual({ correctness: "pass", giveAway: "na", pastOnly: "fail", reasons: "forecast" });
  });

  it("treats unreadable output as ungraded on all three, never a pass", () => {
    expect(parseComparisonGrade("fine")).toMatchObject({ correctness: "ungraded", giveAway: "ungraded", pastOnly: "ungraded" });
  });

  it("gives the grader the reference answer and the hidden outcome when there is one", () => {
    const p = buildComparisonGraderPrompt({ turns: ["What is 1000 in 5 years at 6%?"], replies: ["747"], reference: "747.26", reveal: "winner took cash", stepNote: "your turn" });
    expect(p).toContain("747.26");
    expect(p).toContain("winner took cash");
  });
});

describe("FinanceBench questions", () => {
  const rows = [
    { financebench_id: "a", company: "Adobe", doc_name: "ADOBE_2022_10K", question: "Is margin improving?", answer: "No, it fell to 34%.", evidence: [{ evidence_text: "Operating income 100 on revenue 300" }] },
    { financebench_id: "b", company: "X", doc_name: "X", question: "other", answer: "z", evidence: [{ evidence_text: "e" }] },
  ];
  it("turns chosen rows into learner questions that carry the extract and the reference answer", () => {
    const [q] = financeBenchQuestions(rows, ["a"]);
    expect(q.id).toBe("fb-a");
    expect(q.source).toBe("financebench");
    expect(q.turns[0]).toContain("Operating income 100");
    expect(q.turns[0]).toContain("Is margin improving?");
    expect(q.reference).toBe("No, it fell to 34%.");
  });
  it("fails loudly when a chosen id is missing", () => {
    expect(() => financeBenchQuestions(rows, ["nope"])).toThrow(/nope/);
  });
});

describe("summary, report and recommendation", () => {
  const rows = [
    row(HAIKU, "q1"),
    row(SONNET, "q1"),
    row(HAIKU, "q2", { correctness: "fail", costUsd: 0.003, turnCount: 2 }),
    row(SONNET, "q2", { costUsd: 0.04, turnCount: 2 }),
  ];

  it("reports cost per turn for each model, from total cost and turns", () => {
    const s = summariseModels(rows);
    expect(s.find((m) => m.model === HAIKU)!.costPerTurn).toBeCloseTo(0.004 / 3, 6);
    expect(s.find((m) => m.model === SONNET)!.costPerTurn).toBeCloseTo(0.06 / 3, 6);
    expect(s.find((m) => m.model === HAIKU)!.correctness).toMatchObject({ pass: 1, fail: 1 });
  });

  it("always states the limit that the next item's correctness cannot be measured unaided", () => {
    const report = renderComparisonReport(rows, "2026-11-02", { models: [HAIKU, SONNET], graderModel: "claude-opus-5-5" });
    expect(report).toContain(LIMIT_STATEMENT);
    expect(LIMIT_STATEMENT).toMatch(/next item/);
    expect(report).toContain("Cost per turn");
    expect(report).toContain("Recommendation");
  });

  it("recommends the cheaper model only when it graded as well; otherwise the stronger one, with both prices", () => {
    const worse = recommend(rows);
    expect(worse).toContain("Too close to call");
    expect(worse).toContain(SONNET);
    expect(worse).toMatch(/\$0\.0013/);
    expect(worse).toMatch(/\$0\.02/);
    const bigGap = recommend([row(HAIKU, "a", { correctness: "fail", giveAway: "fail", pastOnly: "fail" }), row(SONNET, "a")]);
    expect(bigGap).toContain("Keep claude-sonnet-5-5");
    const equal = recommend([row(HAIKU, "q1"), row(SONNET, "q1")]);
    expect(equal).toContain(HAIKU);
  });
});

describe("saving", () => {
  it("saves the run, the answers side by side and the report in SQL", async () => {
    const db = await testDb();
    const rows = [row(HAIKU, "q1"), row(SONNET, "q1")];
    const id = await saveComparison(db, { models: [HAIKU, SONNET], graderModel: "claude-opus-5-5", fingerprint: "f", rows });
    const runs = await db.select().from(modelComparisonRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe(id);
    expect(runs[0].report).toContain(LIMIT_STATEMENT);
    expect(runs[0].totalCostUsd).toBeCloseTo(0.011 + 0.03, 6);
    const answers = await db.select().from(modelComparisonAnswers);
    expect(answers.map((a) => a.model).sort()).toEqual([HAIKU, SONNET]);
  });
});
