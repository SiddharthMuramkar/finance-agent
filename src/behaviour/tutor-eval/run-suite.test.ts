import { describe, expect, it } from "vitest";
import { oldPercentOnly } from "@/test/old-percent-map";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { Budget } from "./budget";
import { CASES_DIR, loadCases, type EvalCase } from "./case";
import { allPassed } from "./report";
import { runSuite, type SuiteDeps } from "./run-suite";

/**
 * The whole suite with no network: the real Tutor Turn on in-memory Postgres with a scripted model, and a
 * stand-in grader. It covers the run path, the spend cap stopping runs, an unreadable grade and the aggregates. It runs
 * on Percent as it was before its conversion (a fixture), so T1's pinned questions and its written-ahead Widget stand.
 */
const map = oldPercentOnly();
const all = loadCases(CASES_DIR).cases;
const pick = (...ids: string[]) => ids.map((id) => all.find((c) => c.id === id)!) as EvalCase[];

const T1_REPLY =
  "Sure. This one shows a rate moving from 2% to 3%. The three numbers under the line each answer a different question.\nWhich of the three numbers is the move in basis points?";
const yesTo = (n: number) => JSON.stringify({ answers: Array.from({ length: n }, (_, i) => ({ n: i + 1, answer: "yes", why: "ok" })) });

function deps(over: Partial<SuiteDeps> & { reply?: string; graderText?: (prompt: string) => string; graderCost?: number } = {}): SuiteDeps {
  return {
    map,
    settings: { model: "claude-opus-5-5", effort: "medium", widgetEngine: "off" },
    graderModel: "claude-opus-5-5",
    fingerprint: "test",
    budget: new Budget(5),
    newDb: testDb,
    tutorClient: () =>
      scriptedClient([
        { content: [{ type: "tool_use", id: `toolu_${Math.random().toString(36).slice(2)}`, name: "open_widget", input: { id: "rate-change-three-ways" } }] },
        { content: [{ type: "text", text: over.reply ?? T1_REPLY }] },
      ]).client,
    grade: async (_system, prompt) => ({ text: over.graderText ? over.graderText(prompt) : yesTo((prompt.match(/^\d+\. /gm) ?? []).length), costUsd: over.graderCost ?? 0.05 }),
    courseCheck: async () => ({ passed: true, output: "" }),
    concurrency: 1,
    ...over,
  };
}

describe("a suite run", () => {
  it("runs a live case three times through the Tutor Turn, grades each, and passes it on three of three", async () => {
    const report = await runSuite(pick("T1"), deps());
    const [t1] = report.cases;
    expect(t1.runs.map((r) => r.reasons)).toEqual([[], [], []]);
    expect(t1.status).toBe("pass");
    expect(t1.runs[0].reply?.widgets[0]).toMatchObject({ kind: "written", id: "rate-change-three-ways" });
    expect(report.spentUsd).toBeCloseTo(0.15);
    expect(allPassed(report)).toBe(true);
  });

  it("stops starting runs once the next would pass the cap, says so, and does not pass", async () => {
    const report = await runSuite(pick("T1", "T11"), deps({ budget: new Budget(0.5), graderCost: 0.3 }));
    expect(report.budgetStop).toMatch(/would pass the \$0\.50 cap/);
    expect(report.spentUsd).toBeLessThanOrEqual(0.5);
    const runs = report.cases.flatMap((c) => c.runs);
    expect(runs.filter((r) => r.status === "skipped").length).toBe(5);
    expect(runs.find((r) => r.status === "skipped")?.reasons[0]).toMatch(/^Not run: Stopped/);
    expect(report.cases.map((c) => c.status)).toEqual(["skipped", "skipped"]);
    expect(allPassed(report)).toBe(false);
  });

  it("fails a run whose grade cannot be read, and one that breaks a reply check, with every reason", async () => {
    const unreadable = await runSuite(pick("T1"), deps({ graderText: () => "I think it was fine." }));
    expect(unreadable.cases[0].status).toBe("fail");
    expect(unreadable.cases[0].runs[0].reasons[0]).toMatch(/grade could not be read/);
    const refusal = await runSuite(pick("T1"), deps({ reply: "While the quiz is open I can't explain the ideas it tests. 60 basis points is 0.6 of a point." }));
    const reasons = refusal.cases[0].runs[0].reasons.join("\n");
    expect(reasons).toMatch(/V5/);
    expect(reasons).toMatch(/refuses/);
    expect(reasons).toMatch(/no ask/);
  });

  it("reports cases that cannot run yet as pending, and checks the aggregates over the live replies", async () => {
    const report = await runSuite(pick("T1", "T3", "T8", "T9", "T10"), deps({ reply: `## The idea\n${T1_REPLY.replace("Sure.", "Sure, see pb-quiz-language.")}` }));
    const byId = Object.fromEntries(report.cases.map((c) => [c.id, c]));
    expect(byId.T3).toMatchObject({ status: "pending", pending: expect.stringMatching(/no Skill pts-to-bp/) });
    expect(byId.T8).toMatchObject({ status: "pending", pending: expect.stringMatching(/#237/) });
    // T9 sees T1's replies (T3 did not run): the app word fails it in every run.
    expect(byId.T9.status).toBe("fail");
    expect(byId.T9.runs[0].reasons[0]).toMatch(/^T1: Style: .*pb-quiz-language/);
    expect(byId.T10.status).toBe("pass");
  });
});
