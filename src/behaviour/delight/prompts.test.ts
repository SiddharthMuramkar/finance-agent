import { describe, expect, it } from "vitest";
import { TEACHING_STEPS } from "@/course/navigator";
import { loadCourseMap } from "@/course/map";
import prompts from "./prompts.json";
import { readOutlineText } from "@/course/map";
import { alsoReported, caseOf, computeBars, delightBudget, everyPlanned, judgeInput, parseJudge, Spend, type PromptResult } from "./judges";

// Appendix D.1, row by row.
const TABLE: [string, string, string, string][] = [
  ["D01", "num-percent-bps", "story", "what even is a basis point lol"],
  ["D02", "num-percent-bps", "concept", "why did the bank change the rate"],
  ["D03", "num-percent-bps", "concept", "show me"],
  ["D04", "num-percent-bps", "your_turn", "is this like my credit card?"],
  ["D05", "num-percent-bps", "check", "just tell me the answer pls"],
  ["D06", "num-compounding", "story", "explain like I'm 5"],
  ["D07", "num-compounding", "concept", "why does money grow faster later on"],
  ["D08", "num-compounding", "concept", "my dad keeps saying CAGR, what is that"],
  ["D09", "num-compounding", "your_turn", "quiz me but make it fun"],
  ["D10", "num-compounding", "reveal", "wait did people lose money in 1992??"],
  ["D11", "num-probability", "story", "who even were these LTCM guys"],
  ["D12", "num-probability", "concept", "what's expected value in normal words"],
  ["D13", "num-probability", "concept", "so is this basically gambling"],
  ["D14", "num-probability", "concept", "show me something cool"],
  ["D15", "num-probability", "concept", "my friend says crypto is 50/50, is that how odds work"],
  ["D16", "present-value", "story", "wait you can take the lottery all at once??"],
  ["D17", "present-value", "concept", "why is money today worth more than later"],
  ["D18", "present-value", "concept", "ok this is boring, make it a story"],
  ["D19", "present-value", "your_turn", "is the annuity like getting pocket money every month?"],
  ["D20", "present-value", "principle", "how does this touch my life"],
];

describe("[S3] the prompt set is Appendix D.1", () => {
  it("has 20 entries, ids D01 to D20, with the Topic, step and message of the table", () => {
    expect(prompts).toHaveLength(20);
    expect(prompts.map((p) => [p.id, p.topic, p.step, p.message])).toEqual(TABLE);
  });

  it("names only real Topics and Teaching Steps, and each entry has exactly four keys", () => {
    const topics = new Set(loadCourseMap().topics.map((t) => t.id));
    for (const p of prompts) {
      expect(Object.keys(p).sort()).toEqual(["id", "message", "step", "topic"]);
      expect(topics.has(p.topic)).toBe(true);
      expect(TEACHING_STEPS as readonly string[]).toContain(p.step);
    }
  });
});

describe("[S3] every judge's JSON example parses into the runner's schema", () => {
  it("Beginner persona", () => {
    const j = parseJudge("persona", `{ "id": "D01", "fun": 4, "clarity": 5, "lingo": { "score": 4, "terms": ["basis point"] }, "exam": false, "back": true, "best_line": "…", "worst_line": "…", "why": "≤ 40 words" }`);
    expect(j).toMatchObject({ id: "D01", fun: 4, lingo: { score: 4, terms: ["basis point"] }, exam: false });
  });
  it("Math police", () => {
    const j = parseJudge("math", `{ "id": "D05", "sums": [ { "where": "reply" , "quote": "…", "why": "asks for the bp of a 0.4-point move" } ], "count": 1 }`);
    expect(j.count).toBe(1);
    expect(j.sums[0].where).toBe("reply");
  });
  it("Widget fit, including its kind", () => {
    const j = parseJudge("fit", `{ "id": "D03", "match": 5, "lively": 4, "emoji": { "meaningful": ["money-bag", "bank"], "decorative": [] }, "alone": true, "kind": "lingo", "source": "lingo", "why": "≤ 30 words" }`);
    expect(j.kind).toBe("lingo");
    for (const kind of ["story", "lingo", "timeline", "chart_only", "other"]) {
      expect(parseJudge("fit", JSON.stringify({ id: "D03", match: 3, lively: 3, emoji: { meaningful: [], decorative: [] }, alone: false, kind, source: "x", why: "" })).kind).toBe(kind);
    }
  });
  it("Historian", () => {
    const j = parseJudge("historian", `{ "id": "D11", "claims": [ { "claim": "LTCM was founded in 1994", "verdict": "supported", "source": "<url>" } ], "wrong": 0, "after_as_of": 0, "unsupported": 0 }`);
    expect(j.claims[0].verdict).toBe("supported");
  });
  it("accepts one json fence and refuses prose, a bad kind, a score out of range and a wrong count", () => {
    const fit = { id: "D03", match: 5, lively: 4, emoji: { meaningful: [], decorative: [] }, alone: true, kind: "lingo", source: "lingo", why: "" };
    expect(parseJudge("fit", "```json\n" + JSON.stringify(fit) + "\n```").id).toBe("D03");
    expect(() => parseJudge("fit", "Sure! " + JSON.stringify(fit))).toThrow(/not JSON/);
    expect(() => parseJudge("fit", JSON.stringify({ ...fit, kind: "chart" }))).toThrow(/kind/);
    expect(() => parseJudge("fit", JSON.stringify({ ...fit, match: 6 }))).toThrow(/match/);
    expect(() => parseJudge("math", JSON.stringify({ id: "D05", sums: [], count: 2 }))).toThrow(/count/);
  });
});

const persona = (id: string, fun: number, lingo: number, exam = false) => ({ id, fun, clarity: 4, lingo: { score: lingo, terms: [] }, exam, back: true, best_line: "", worst_line: "", why: "" });
const fit = (id: string, kind: "story" | "chart_only" = "story", match = 5) => ({ id, match, lively: 4, emoji: { meaningful: [], decorative: [] }, alone: true, kind, source: "scene", why: "" });
const passing = (): PromptResult[] =>
  prompts.map((p) => ({ id: p.id, widgetSource: "scene", choicesCount: 3, persona: persona(p.id, 4, 4), math: { id: p.id, sums: [], count: 0 }, fit: fit(p.id), historian: { id: p.id, claims: [], wrong: 0, after_as_of: 0, unsupported: 0 } }));

const JUDGED_BARS = ["No sum asked", "Fun (median)", "Lingo learned", "Felt like an exam", "No chart-only Widget"];

describe("[S3] the report lists every Appendix D.3 bar with its number", () => {
  it("passes all seven bars on a clean round", () => {
    const bars = computeBars(passing());
    expect(bars.map((b) => b.name)).toEqual(["A Widget with every reply", "No sum asked", "Choices on every reply", "Fun (median)", "Lingo learned", "Felt like an exam", "No chart-only Widget"]);
    expect(bars.every((b) => b.pass === true)).toBe(true);
    expect(bars[0].actual).toBe("20 of 20");
  });
  it("fails each bar on its own failure", () => {
    const at = (f: (r: PromptResult[]) => void) => {
      const r = passing();
      f(r);
      return computeBars(r).filter((b) => b.pass !== true).map((b) => b.name);
    };
    expect(at((r) => (r[0].widgetSource = "none"))).toEqual(["A Widget with every reply"]);
    expect(at((r) => (r[1].widgetSource = null))).toEqual(["A Widget with every reply"]);
    expect(at((r) => (r[2].math = { id: "D03", sums: [{ where: "choice", quote: "q", why: "w" }], count: 1 }))).toEqual(["No sum asked"]);
    expect(at((r) => (r[3].choicesCount = 1))).toEqual(["Choices on every reply"]);
    expect(at((r) => (r[3].choicesCount = 4))).toEqual(["Choices on every reply"]);
    expect(at((r) => r.slice(0, 10).forEach((x) => (x.persona = persona(x.id, 3, 4))))).toEqual(["Fun (median)"].filter(() => true));
    expect(at((r) => r.slice(0, 5).forEach((x) => (x.persona = persona(x.id, 4, 3))))).toEqual(["Lingo learned"]);
    expect(at((r) => (r[5].persona = persona("D06", 4, 4, true)))).toEqual(["Felt like an exam"]);
    expect(at((r) => (r[6].fit = fit("D07", "chart_only")))).toEqual(["No chart-only Widget"]);
  });
  it("lets 4 of 20 miss lingo but not 5, and never passes a bar whose judge is missing", () => {
    const r = passing();
    r.slice(0, 4).forEach((x) => (x.persona = persona(x.id, 4, 3)));
    expect(computeBars(r).find((b) => b.name === "Lingo learned")).toMatchObject({ pass: true, actual: "80 % (16 of 20)" });
    r[10].persona = undefined;
    expect(computeBars(r).find((b) => b.name === "Fun (median)")).toMatchObject({ pass: false });
  });
  it("fails every judged bar when --judge ran but no judge answered for any prompt (all 401 or 429, or the cap ran out first)", () => {
    const r = passing().map((x) => ({ ...x, persona: undefined, math: undefined, fit: undefined, historian: undefined }));
    const bars = computeBars(r, r.length, true);
    for (const name of JUDGED_BARS) expect(bars.find((b) => b.name === name)).toMatchObject({ pass: false, actual: "not judged (0 of 20 judged)" });
    expect(bars.find((b) => b.name === "A Widget with every reply")).toMatchObject({ pass: true });
  });
  it("reads the judged bars as not judged (pass null) only when --judge did not run", () => {
    const r = passing().map((x) => ({ ...x, persona: undefined, math: undefined, fit: undefined, historian: undefined }));
    const bars = computeBars(r, r.length, false);
    for (const name of JUDGED_BARS) expect(bars.find((b) => b.name === name)).toMatchObject({ pass: null, actual: "not judged" });
  });
  it("counts the bars over all 20 planned prompts when the round stopped after 5 good ones (E4b-B1)", () => {
    const planned = TABLE.map(([id], i) => ({ n: i + 1, id }));
    const good = passing().slice(0, 5).map((result, i) => ({ n: i + 1, result }));
    // The old count, over the rows actually run, read every bar as a pass.
    expect(computeBars(good.map((g) => g.result), good.length).every((b) => b.pass === true)).toBe(true);
    const all = everyPlanned(planned, good, (p) => ({ n: p.n, result: { id: p.id, widgetSource: null, choicesCount: null } as PromptResult, notRun: true }));
    expect(all.map((r) => r.n)).toEqual(planned.map((p) => p.n));
    expect(all.filter((r) => "notRun" in r)).toHaveLength(15);
    const bars = computeBars(all.map((r) => r.result), planned.length);
    expect(bars[0]).toMatchObject({ target: "20 of 20", actual: "5 of 20", pass: false });
    expect(bars.some((b) => b.pass === true)).toBe(false);
  });
  it("reports the also-reported rows", () => {
    const r = passing();
    r[10].historian = { id: "D11", claims: [], wrong: 1, after_as_of: 0, unsupported: 0 };
    r.forEach((x) => (x.fit = fit(x.id, "story", 3)));
    const rows = alsoReported(r);
    expect(rows[0].ids).toEqual(["D11"]);
    expect(rows[1].ids).toHaveLength(20);
  });
});

describe("[S3] the spend cap", () => {
  it("defaults to 13 dollars and reads DELIGHT_BUDGET_USD", () => {
    expect(delightBudget({})).toBe(13);
    expect(delightBudget({ DELIGHT_BUDGET_USD: "6.5" })).toBe(6.5);
    expect(() => delightBudget({ DELIGHT_BUDGET_USD: "0" })).toThrow(/DELIGHT_BUDGET_USD/);
    expect(() => delightBudget({ DELIGHT_BUDGET_USD: "lots" })).toThrow(/DELIGHT_BUDGET_USD/);
  });
  it("charges Opus at the price table and stops when the next call would pass the cap", () => {
    const s = new Spend(13);
    expect(s.charge("claude-opus-5-5", { inputTokens: 1_000_000, outputTokens: 100_000 })).toBeCloseTo(6);
    expect(s.allows(7)).toBe(true);
    expect(s.allows(7.01)).toBe(false);
    expect(() => s.charge("claude-unknown", { inputTokens: 1, outputTokens: 1 })).toThrow(/no price/);
  });
  it("gives each judge the evidence it needs, the Historian also the Case", () => {
    const e = { prompt: prompts[10], topicTitle: "Probability and expected value", reply: "Hello", choices: [{ label: "Who were they?" }], widgetCode: "root = Card()", widgetSource: "case", caseText: "asOf: 1998-08-01" };
    expect(judgeInput("persona", e)).toContain("who even were these LTCM guys");
    expect(judgeInput("persona", e)).not.toContain("asOf");
    expect(judgeInput("historian", e)).toContain("asOf: 1998-08-01");
    expect(judgeInput("fit", e)).toContain("Widget source: case");
  });
});

describe("[S3] the Historian's Case comes from the outline", () => {
  it("has a Case with asOf, outcome and sources for every Topic of the 20 prompts", () => {
    for (const topic of new Set(prompts.map((p) => p.topic))) {
      const { title, caseText } = caseOf(readOutlineText(), topic);
      expect(title.length).toBeGreaterThan(0);
      expect(caseText).toMatch(/asOf: \d{4}-\d{2}-\d{2}/);
      expect(caseText).toContain("outcome: ");
      expect(caseText).toContain("- http");
    }
  });
  it("refuses an unknown Topic", () => {
    expect(() => caseOf("topics: []", "nope")).toThrow(/no Topic/);
  });
});
