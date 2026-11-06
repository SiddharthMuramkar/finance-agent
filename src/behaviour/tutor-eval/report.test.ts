import { describe, expect, it } from "vitest";
import { seen } from "./grading";
import { allPassed, caseStatus, renderReport, renderSummary, reportFiles, type EvalReport, type RunResult } from "./report";

const pass = (run: number): RunResult => ({ run, status: "pass", reasons: [], costUsd: 0.1 });
const long = "word ".repeat(150).trim();

const report: EvalReport = {
  startedAt: "2026-11-04T10:00:00.000Z",
  finishedAt: "2026-11-04T10:20:00.000Z",
  tutor: { model: "claude-opus-5-5", effort: "medium", widgetEngine: "off" },
  graderModel: "claude-opus-5-5",
  fingerprint: "abc123",
  capUsd: 5,
  spentUsd: 4.62,
  budgetStop: "Stopped: spent $4.62, and the next run (about $0.40) would pass the $5.00 cap.",
  cases: [
    { id: "T1", title: "Check open: a Widget", kind: "live", status: "pass", runs: [pass(1), pass(2), pass(3)] },
    {
      id: "T2",
      title: "After 0 of 3",
      kind: "live",
      status: "fail",
      runs: [
        pass(1),
        {
          run: 2,
          status: "fail",
          reasons: ["V1: Your reply was 150 words. The limit is 120. Keep one idea and one ask.", 'Grader: no to "Is there exactly one idea and one ask?" (three asks)'],
          reply: seen({ text: long, widgets: [{ kind: "recipe", id: "rate_move", params: { old: 2, new: 3 }, labels: [] }] }),
          costUsd: 0.2,
        },
        { run: 3, status: "skipped", reasons: ["Not run: the spend cap was reached."], costUsd: 0 },
      ],
    },
    { id: "T3", title: "Repeat miss", kind: "live", status: "pending", pending: "num-percent-bps has no Skill pts_to_bp yet.", runs: [] },
  ],
};

describe("the report", () => {
  it("says what ran, on which model and effort, what it cost and that the cap stopped it", () => {
    const md = renderReport(report);
    expect(md).toMatch(/claude-opus-5-5, effort medium, widget engine off/);
    expect(md).toContain("$4.62 of the $5.00 cap");
    expect(md).toContain("Stopped: spent $4.62");
    expect(md).toMatch(/\| T1 \| Check open: a Widget \| pass \| 3 of 3 \|/);
    expect(md).toMatch(/\| T2 \| After 0 of 3 \| fail \| 1 of 3 \|/);
    expect(md).toMatch(/\| T3 \| Repeat miss \| pending \| 0 of 3 \|/);
  });

  it("lists every failure in full: each reason, the whole reply and its Widgets", () => {
    const md = renderReport(report);
    const failures = md.slice(md.indexOf("## Failures"));
    expect(failures).toContain("### T2, run 2");
    expect(failures).toContain("V1: Your reply was 150 words.");
    expect(failures).toContain("three asks");
    expect(failures).toContain(long);
    expect(failures).toContain("rate_move");
    expect(failures).toContain("### T2, run 3");
    expect(failures).toContain("Not run: the spend cap was reached.");
    expect(md).toContain("num-percent-bps has no Skill pts_to_bp yet.");
  });

  // Round 10 (critic MP-3): a critic traces each number to a story fact, a choice label or a tool result, so the report keeps
  // every tool call of every run, passed or not, and each dialogue turn's, with its inputs and result.
  it("lists every tool call of every run and dialogue turn, with its inputs and result, passed runs too", () => {
    const calc = { name: "calculate", input: { calculator: "cagr", inputs: { start: 100000, end: 200000, years: 5 } }, result: "CAGR: 14.87%", isError: false };
    const withTools: EvalReport = {
      ...report,
      cases: [
        { id: "T15", title: "Warm", kind: "live", status: "pass", runs: [{ ...pass(1), reply: seen({ text: "Ok.", widgets: [], tools: [calc] }) }] },
        {
          id: "T13",
          title: "No sum",
          kind: "dialogue",
          status: "pass",
          runs: [{ ...pass(1), transcript: [{ learner: "hi", reply: seen({ text: "Hi.", widgets: [] }) }, { learner: "my dad keeps saying CAGR", reply: seen({ text: "CAGR is...", widgets: [], tools: [calc] }) }] }],
          bar: { runs: 1, passes: 1 },
        },
      ],
    };
    const md = renderReport(withTools);
    const tools = md.slice(md.indexOf("## Tool calls"));
    expect(tools).toContain('- T15, run 1: calculate {"calculator":"cagr","inputs":{"start":100000,"end":200000,"years":5}} returned: CAGR: 14.87%');
    expect(tools).toContain('- T13, run 1, turn 2 ("my dad keeps saying CAGR"): calculate {"calculator":"cagr","inputs":{"start":100000,"end":200000,"years":5}} returned: CAGR: 14.87%');
    expect(tools).not.toContain("turn 1");
    expect(renderReport(report)).toMatch(/## Tool calls\n\nNone\./);
  });

  it("keeps a short summary for the job and the PR, and names every file", () => {
    const summary = renderSummary(report);
    expect(summary).toMatch(/1 of 3 cases passed/);
    expect(summary).toContain("Stopped: spent $4.62");
    expect(summary).toMatch(/T2.*1 of 3/);
    expect(summary).not.toContain(long);
    const files = reportFiles(report);
    expect(Object.keys(files).sort()).toEqual(["latest.json", "latest.md", "summary.md", "tutor-eval-2026-11-04T10-00-00-000Z.json", "tutor-eval-2026-11-04T10-00-00-000Z.md"]);
    expect(JSON.parse(files["latest.json"]).cases).toHaveLength(3);
  });

  it("passes a case only on three passing runs, and the suite only when every case passes", () => {
    expect(caseStatus([pass(1), pass(2), pass(3)])).toBe("pass");
    expect(caseStatus([pass(1), pass(2)])).toBe("skipped");
    expect(caseStatus([pass(1), { run: 2, status: "fail", reasons: ["x"], costUsd: 0 }, pass(3)])).toBe("fail");
    expect(caseStatus([pass(1), { run: 2, status: "skipped", reasons: [], costUsd: 0 }, pass(3)])).toBe("skipped");
    expect(allPassed(report)).toBe(false);
    expect(allPassed({ ...report, budgetStop: null, cases: [report.cases[0]] })).toBe(true);
  });
});
