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
    const refusal = await runSuite(pick("T1"), deps({ reply: "While the quiz is open I can't explain the ideas it tests. 60 basis points is six tenths of a percentage point." }));
    const reasons = refusal.cases[0].runs[0].reasons.join("\n");
    expect(reasons).toMatch(/V5/);
    expect(reasons).toMatch(/refuses/);
    expect(reasons).toMatch(/no ask/);
  });

  it("reports cases that cannot run yet as pending, and checks the aggregates over the live replies", async () => {
    const report = await runSuite(
      pick("T1", "T3", "T8", "T9", "T10"),
      deps({
        reply: `## The idea\n${T1_REPLY.replace("Sure.", "Sure, see pb-quiz-language.")}`,
        courseCheck: async (cwd) => (cwd.includes("fixtures") ? { passed: false, output: 'L1: Check "c" tests Skill "pts", which no Concept card teaches' } : { passed: true, output: "" }),
      }),
    );
    const byId = Object.fromEntries(report.cases.map((c) => [c.id, c]));
    expect(byId.T3).toMatchObject({ status: "pending", pending: expect.stringMatching(/no Skill pts-to-bp/) });
    expect(byId.T8.status).toBe("pass");
    // T9 sees T1's replies (T3 did not run): the app word fails it in every run.
    expect(byId.T9.status).toBe("fail");
    expect(byId.T9.runs[0].reasons[0]).toMatch(/^T1: Style: .*pb-quiz-language/);
    expect(byId.T10.status).toBe("pass");
  });
});

describe("the D3b cases", () => {
  const STORY = "February 1994. Bond traders in New York are about to get a surprise from the Fed.\nWhat do you think they are watching?";
  const textOnly = (text: string) => scriptedClient([{ content: [{ type: "text", text }] }]).client;
  const base = { title: "x", topic: "num-percent-bps", state: { step: "story" as const, check: 1 } };

  it("starts an opener as the page does, tells the grader the Learner wrote nothing, and sees the Choices code stored", async () => {
    const prompts: string[] = [];
    const opener: EvalCase = { ...base, id: "T12", kind: "live", opener: true, message: "", pass: [{ kind: "noSum" }, { kind: "choicesStored" }] };
    const report = await runSuite([opener], deps({ tutorClient: () => textOnly(STORY), graderText: (p) => (prompts.push(p), yesTo((p.match(/^\d+\. /gm) ?? []).length)) }));
    expect(report.cases[0].runs.map((r) => r.reasons)).toEqual([[], [], []]);
    expect(report.cases[0].runs[0].reply?.choices.length).toBe(3);
    expect(prompts[0]).toMatch(/Learner: \(nothing: the page started this turn\)/);
  });

  it("passes a live case on two of three runs when it needs two", async () => {
    const c: EvalCase = { ...base, id: "T15", kind: "live", message: "honestly I'm so bad at maths lol", minPasses: 2, pass: [{ kind: "noSum" }] };
    const client = (_c: unknown, run: number) => textOnly(run === 2 ? "Okay.\nHow many basis points is 0.4 of a point?" : STORY);
    const report = await runSuite([c], deps({ tutorClient: client }));
    expect(report.cases[0].runs.map((r) => r.status)).toEqual(["pass", "fail", "pass"]);
    expect(report.cases[0].status).toBe("pass");
    expect(allPassed(report)).toBe(true);
  });

  it("runs a dialogue's messages in order in one Session, checks every reply, and keeps the whole transcript", async () => {
    const replies = [STORY, "Okay.\nHow many basis points is 0.4 of a point?", "1 point times 100 is 100 bp.\nWhat would a trader call that?"];
    const c: EvalCase = { ...base, id: "T13", kind: "dialogue", messages: ["hi", "show me", "ok"], runs: 1, pass: [{ kind: "noSum" }] };
    // One client for the whole conversation: it answers the three turns in order.
    const { client } = scriptedClient(replies.map((text) => ({ content: [{ type: "text", text }] })));
    const report = await runSuite([c], deps({ tutorClient: () => client }));
    const [t13] = report.cases;
    expect(t13.runs).toHaveLength(1);
    expect(t13.status).toBe("fail");
    expect(t13.runs[0].reasons).toEqual([expect.stringMatching(/^Turn 2 \("show me"\): The reply asks for a sum/)]);
    expect(t13.runs[0].transcript?.map((t) => t.learner)).toEqual(["hi", "show me", "ok"]);
    expect(t13.runs[0].transcript?.[2].reply.text).toBe(replies[2]);
  });

  // Round 10 (F1-cutoff): runLive fails a cut-off reply, but runDialogue dropped cut_off and cut_short, so a truncated
  // T13 reply counted as clean and could pass noSum only because it stopped early.
  it("fails a dialogue turn whose reply was cut short, as a live run does", async () => {
    const c: EvalCase = { ...base, id: "T13", kind: "dialogue", messages: ["hi", "show me"], runs: 1, pass: [{ kind: "noSum" }] };
    const { client } = scriptedClient([
      { content: [{ type: "text", text: STORY }] },
      { content: [{ type: "text", text: "Points are the gap between" }], stop_reason: "max_tokens" },
    ]);
    const report = await runSuite([c], deps({ tutorClient: () => client }));
    const [t13] = report.cases;
    expect(t13.status).toBe("fail");
    expect(t13.runs[0].reasons).toEqual([expect.stringMatching(/^Turn 2 \("show me"\): the Tutor Turn sent "cut_short"/)]);
  });

  // Premerge T-1 (round 13): when the spend cap stopped a dialogue partway, the run read "fail" though no turn that ran
  // had failed (run18: T13 "fail 0 of 1" with 0 sums in the 17 turns it ran). A live run the cap stops is skipped, and so
  // is a dialogue the cap cuts short, unless a turn that ran failed.
  describe("a dialogue the spend cap cuts short (premerge T-1)", () => {
    /** A budget that lets `turns` holds through, then stops as the cap would. */
    class StopsAfter extends Budget {
      constructor(private turns: number) {
        super(5);
      }
      override hold(amount: number): boolean {
        if (this.turns-- > 0) return super.hold(amount);
        this.stopped ??= "Stopped: spent $4.90, and the next run (about $0.20) would pass the $5.00 cap.";
        return false;
      }
    }
    const dialogue: EvalCase = { ...base, id: "T13", kind: "dialogue", messages: ["hi", "show me", "ok"], runs: 1, pass: [{ kind: "noSum" }] };
    const talk = (...texts: string[]) => scriptedClient(texts.map((text) => ({ content: [{ type: "text", text }] }))).client;

    it("is skipped, not judged, when every turn that ran was clean, and keeps those turns", async () => {
      const client = talk(STORY, STORY);
      const report = await runSuite([dialogue], deps({ budget: new StopsAfter(2), tutorClient: () => client }));
      const [t13] = report.cases;
      expect(t13.runs[0].status).toBe("skipped");
      expect(t13.status).toBe("skipped");
      expect(t13.runs[0].reasons).toEqual([expect.stringMatching(/^Not run past turn 2: Stopped/)]);
      expect(t13.runs[0].transcript?.map((t) => t.learner)).toEqual(["hi", "show me"]);
      expect(t13.runs[0].note).toMatch(/^2 of 3 turns ran before the spend cap stopped the dialogue: not judged/);
      expect(report.budgetStop).toMatch(/^Stopped/);
      expect(allPassed(report)).toBe(false);
    });

    it("still fails when a turn that ran failed, with that turn's reason first", async () => {
      const client = talk(STORY, "Okay.\nHow many basis points is 0.4 of a point?");
      const report = await runSuite([dialogue], deps({ budget: new StopsAfter(2), tutorClient: () => client }));
      const [t13] = report.cases;
      expect(t13.runs[0].status).toBe("fail");
      expect(t13.status).toBe("fail");
      expect(t13.runs[0].reasons).toEqual([expect.stringMatching(/^Turn 2 \("show me"\): The reply asks for a sum/), expect.stringMatching(/^Not run past turn 2: Stopped/)]);
    });

    it("is skipped with no transcript when the cap stops it before its first turn", async () => {
      const report = await runSuite([dialogue], deps({ budget: new StopsAfter(0), tutorClient: () => talk(STORY) }));
      expect(report.cases[0].runs[0]).toMatchObject({ status: "skipped", transcript: [] });
    });
  });

  // Round 10 (F1-budget): each dialogue turn held the per-run mean (a Tutor Turn and a grade) but settled one turn's cost,
  // so the dialogue over-held and pulled the live runs' mean down. A dialogue turn holds and settles its own estimate.
  it("holds each dialogue turn on its own per-turn estimate and keeps the live runs' estimate apart", async () => {
    class Watched extends Budget {
      holds: number[] = [];
      override hold(amount: number): boolean {
        this.holds.push(amount);
        return super.hold(amount);
      }
    }
    const budget = new Watched(5);
    const usage = { input_tokens: 2000, output_tokens: 100 };
    const live: EvalCase = { ...base, id: "T15", kind: "live", message: "honestly I'm so bad at maths lol", minPasses: 2, pass: [{ kind: "noSum" }] };
    const dialogue: EvalCase = { ...base, id: "T13", kind: "dialogue", messages: ["hi", "ok", "and?"], runs: 1, pass: [{ kind: "noSum" }] };
    const { client: talk } = scriptedClient([STORY, STORY, STORY].map((text) => ({ content: [{ type: "text", text }], usage })));
    const report = await runSuite(
      [live, dialogue],
      deps({ budget, graderCost: 0.2, tutorClient: (c) => (c.kind === "dialogue" ? talk : scriptedClient([{ content: [{ type: "text", text: STORY }], usage }]).client) }),
    );
    expect(report.cases.map((c) => c.status)).toEqual(["pass", "pass"]);
    const runCost = report.cases[0].runs[0].costUsd;
    const turnCost = (report.cases[1].runs[0].costUsd ?? 0) / 3;
    expect(runCost).toBeGreaterThan(turnCost);
    // Three live runs, then three dialogue turns: the first turn holds the first-turn estimate, the next ones the turns' mean.
    const turnHolds = budget.holds.slice(3);
    expect(turnHolds).toHaveLength(3);
    expect(turnHolds[1]).toBeCloseTo(turnCost);
    expect(turnHolds[2]).toBeCloseTo(turnCost);
    // The live runs' mean is untouched by the cheaper turns.
    expect(budget.estimate("run")).toBeCloseTo(runCost);
    expect(budget.estimate("dialogue_turn")).toBeCloseTo(turnCost);
  });
});
