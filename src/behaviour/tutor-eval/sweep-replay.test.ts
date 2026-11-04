import { describe, expect, it } from "vitest";
import { oldPercentOnly } from "@/test/old-percent-map";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { Budget } from "./budget";
import { CASES_DIR, loadCases, type LiveCase } from "./case";
import { renderReplay, replayFiles, runReplay, type ReplayDeps } from "./sweep-replay";

const map = oldPercentOnly(); // Percent before its conversion (a fixture), with its old Widget
const t1 = loadCases(CASES_DIR).cases.find((c) => c.id === "T1") as LiveCase;
const turn = (id: string, over: Partial<LiveCase> = {}): LiveCase => ({ ...t1, id, title: `Turn ${id}`, source: `Session turn ${id}`, ...over });

const GOOD = "Sure. This one shows a rate moving from 2% to 3%. The three numbers under the line each answer a different question.\nWhich of the three numbers is the move in basis points?";
const text = (t: string) => ({ content: [{ type: "text", text: t }] });

function deps(replies: string[], over: Partial<ReplayDeps> = {}): ReplayDeps {
  let i = 0;
  return {
    map,
    settings: { model: "claude-opus-5-5", effort: "medium", widgetEngine: "off" },
    budget: new Budget(5),
    newDb: testDb,
    tutorClient: () => scriptedClient([text(replies[i++ % replies.length])]).client,
    concurrency: 1,
    ...over,
  };
}

describe("a replay", () => {
  it("runs every turn through the real Tutor Turn and counts the pass rate per rule", async () => {
    const long = `${"Interest is the price of borrowing money for a while. ".repeat(14)}\nWhat is a rate?`;
    const report = await runReplay([turn("a"), turn("b"), turn("c")], deps([GOOD, long, GOOD]));
    expect(report.turns.map((t) => t.status)).toEqual(["ok", "ok", "ok"]);
    expect(report.rules.V1).toEqual({ passed: 2, total: 3 });
    expect(report.rules.V2).toEqual({ passed: 3, total: 3 });
    expect(report.rules.V7).toEqual({ passed: 3, total: 3 });
    expect(report.longestWords).toBeGreaterThan(120);
    expect(report.turns[1].problems.map((p) => p.rule)).toContain("V1");
    const md = renderReplay(report);
    expect(md).toMatch(/\| V1 \| 2 of 3 \|/);
    expect(md).toMatch(/Longest reply: \d+ words/);
    // Every failure is written out in full: the Learner's message, the reply and the reason.
    expect(md).toMatch(/### Turn c|### Turn b/);
    expect(md).toContain(long.split("\n")[1]);
    expect(md).toMatch(/Your reply was \d+ words/);
  });

  it("applies the code fixes before the checks, so a heading is not a failure", async () => {
    const report = await runReplay([turn("a")], deps([`## The idea\n${GOOD}`]));
    expect(report.rules.V3).toEqual({ passed: 1, total: 1 });
    expect(report.turns[0].reply).not.toMatch(/^##/);
  });

  it("stops at the cap and leaves the rest as skipped, never as passed", async () => {
    const report = await runReplay([turn("a"), turn("b"), turn("c")], deps([GOOD], { budget: new Budget(0.0001) }));
    expect(report.budgetStop).toMatch(/cap|Stopped/);
    expect(report.turns.filter((t) => t.status === "skipped").length).toBeGreaterThan(0);
    expect(report.rules.V1.total).toBeLessThan(3);
  });

  it("records a turn that cannot run (an unknown Topic) as skipped with its reason, and one that throws as an error", async () => {
    const report = await runReplay([turn("a", { topic: "no-such-topic" }), turn("b")], deps([GOOD], { newDb: async () => { throw new Error("db down"); } }));
    expect(report.turns[0]).toMatchObject({ status: "skipped", reason: expect.stringMatching(/no-such-topic/) });
    expect(report.turns[1]).toMatchObject({ status: "error", reason: expect.stringMatching(/db down/) });
    expect(renderReplay(report)).toMatch(/db down/);
  });

  it("writes a dated report and a latest copy, in Markdown and JSON", async () => {
    const report = await runReplay([turn("a")], deps([GOOD]));
    expect(Object.keys(replayFiles(report)).sort()).toEqual(["replay-latest.json", "replay-latest.md", expect.stringMatching(/^replay-.*\.json$/), expect.stringMatching(/^replay-.*\.md$/)].sort());
  });
});
