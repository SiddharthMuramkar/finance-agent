import { createQueryManager, type QueryNode } from "@openuidev/lang-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";
import type { CaseData } from "@/case-data/case-data";
import { calculate, CALCULATORS } from "@/finance/calculators";
import { annuitySchedule } from "@/finance/present-value";
import { formatUsd } from "./case-data-view";
import { MAX_RANGE_POINTS, WIDGET_TOOL_NAMES, type RangeRow, type WidgetToolName } from "./tool-specs";
import { createWidgetTools, type WidgetToolOptions } from "./tools";

// A widget's Query() calls these tools in the browser. They answer with the same tested formulas
// and as-of-checked Case Data the rest of the app uses, as rows a chart plucks (rows.label,
// rows.value), and never throw: a problem comes back as empty rows and a plain-words error, which
// onError hears too.

/** Tools for one widget, with every onError call recorded as [tool, message]. */
function toolsWithErrors(options: Omit<WidgetToolOptions, "onError"> = {}) {
  const errors: [WidgetToolName, string][] = [];
  const tools = createWidgetTools({ ...options, onError: (tool, message) => errors.push([tool, message]) });
  return { tools, errors };
}

/** One result line of a direct calculate() call: the one with this label, or the first. */
function line(id: string, inputs: Record<string, number>, label?: string) {
  const result = calculate(id, inputs);
  if (!result.ok) throw new Error(result.error);
  return label ? result.results.find((r) => r.label === label)! : result.results[0];
}

const loan = { principal: 5_000_000, ratePercent: 8.5, years: 20 };

describe("the calculate tool", () => {
  it("answers the calculator's result lines as rows, the same numbers and text as calculate()", async () => {
    const direct = calculate("emi", loan);
    if (!direct.ok) throw new Error(direct.error);
    const { tools, errors } = toolsWithErrors();
    const result = await tools.calculate({ calculator: "emi", inputs: loan });
    expect(result).toEqual({ rows: direct.results.map(({ label, value, text }) => ({ label, value, text })), title: "Loan EMI" });
    expect(result.rows[0]).toMatchObject({ label: "Monthly instalment", text: "₹43,391.16" });
    expect(errors).toEqual([]);
  });

  it("shows money in the currency asked for", async () => {
    const result = await createWidgetTools().calculate({ calculator: "present_value", inputs: { amount: 100_000, ratePercent: 10, years: 5 }, currency: "inr" });
    expect(result.rows[0].text).toBe("₹62,092.13");
  });

  it("reads a number written as text, as a Select gives it, and nothing else", async () => {
    const tools = createWidgetTools();
    const asText = await tools.calculate({ calculator: "emi", inputs: { principal: "5000000", ratePercent: " 8.5 ", years: "20" } });
    expect(asText).toEqual(await tools.calculate({ calculator: "emi", inputs: loan }));
    expect((await tools.calculate({ calculator: "emi", inputs: { ...loan, years: "twenty" } })).error).toContain("inputs.years");
    expect((await tools.calculate({ calculator: "emi", inputs: { ...loan, years: "" } })).error).toContain("inputs.years");
  });

  it("says what is wrong, and tells onError: an unknown calculator, a missing input, an input the calculator does not take", async () => {
    const { tools, errors } = toolsWithErrors();
    const unknown = await tools.calculate({ calculator: "home_loan", inputs: loan });
    expect(unknown).toEqual({ rows: [], title: "", error: expect.stringContaining('Unknown calculator "home_loan". Available: future_value') });
    const missing = await tools.calculate({ calculator: "emi", inputs: { principal: 5_000_000, years: 20 } });
    expect(missing.error).toContain("ratePercent");
    // The calculator would silently drop an input it does not take, so a slider bound to it would move nothing.
    const extra = await tools.calculate({ calculator: "emi", inputs: { ...loan, rate: 9 } });
    expect(extra.error).toBe("emi has no input named rate. Its inputs are: principal, ratePercent, years.");
    expect(errors).toEqual([
      ["calculate", unknown.error],
      ["calculate", missing.error],
      ["calculate", extra.error],
    ]);
  });
});

describe("the calculate_range tool", () => {
  it("runs the calculator at each point: EMI at 6% to 12% by 1 gives 7 rows labelled 6% to 12%, each one calculate() call", async () => {
    const { tools, errors } = toolsWithErrors();
    const result = await tools.calculate_range({ calculator: "emi", inputs: loan, vary: "ratePercent", from: 6, to: 12, step: 1 });
    expect(result.rows.map((r) => r.label)).toEqual(["6%", "7%", "8%", "9%", "10%", "11%", "12%"]);
    expect(result.rows.map((r) => r.x)).toEqual([6, 7, 8, 9, 10, 11, 12]);
    for (const row of result.rows) {
      const one = line("emi", { ...loan, ratePercent: row.x });
      expect(row).toEqual({ x: row.x, label: row.label, value: one.value, text: one.text });
    }
    expect(result.output).toBe("Monthly instalment");
    expect(result.outputs).toEqual(["Monthly instalment", "Total interest", "Total repaid"]);
    expect(result.error).toBeUndefined();
    expect(errors).toEqual([]);
  });

  it("picks the result named by output, in any case", async () => {
    const result = await createWidgetTools().calculate_range({ calculator: "emi", inputs: loan, vary: "principal", from: 1_000_000, to: 3_000_000, step: 1_000_000, output: "total INTEREST" });
    expect(result.output).toBe("Total interest");
    expect(result.rows.map((r) => r.label)).toEqual(["1,000,000", "2,000,000", "3,000,000"]);
    expect(result.rows.map((r) => r.value)).toEqual([1, 2, 3].map((m) => line("emi", { ...loan, principal: m * 1_000_000 }, "Total interest").value));
  });

  it("labels a number of years like 10 y, and a count or an amount as a plain number", async () => {
    const tools = createWidgetTools();
    const growth = await tools.calculate_range({ calculator: "future_value", inputs: { amount: 100_000, ratePercent: 8, years: 1 }, vary: "years", from: 1, to: 30, step: 1 });
    expect(growth.rows).toHaveLength(30);
    expect([growth.rows[0].label, growth.rows[29].label]).toEqual(["1 y", "30 y"]);
    expect(growth.rows[29].value).toBe(line("future_value", { amount: 100_000, ratePercent: 8, years: 30 }).value);
    // perYear counts compoundings and yearlyDeposit is money: neither is a number of years.
    const often = await tools.calculate_range({ calculator: "future_value", inputs: { amount: 100_000, ratePercent: 8, years: 10 }, vary: "perYear", from: 1, to: 12, step: 11 });
    expect(often.rows.map((r) => r.label)).toEqual(["1", "12"]);
    const deposits = await tools.calculate_range({ calculator: "ppf", inputs: { yearlyDeposit: 100_000, ratePercent: 7.1 }, vary: "yearlyDeposit", from: 100_000, to: 150_000, step: 50_000 });
    expect(deposits.rows.map((r) => r.label)).toEqual(["100,000", "150,000"]);
  });

  it("lands exactly on the end of a range with a fractional step", async () => {
    const result = await createWidgetTools().calculate_range({ calculator: "future_value", inputs: { amount: 1000, ratePercent: 0, years: 10 }, vary: "ratePercent", from: 0, to: 1, step: 0.1 });
    expect(result.rows.map((r) => r.x)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
    expect(result.rows.slice(0, 4).map((r) => r.label)).toEqual(["0%", "0.1%", "0.2%", "0.3%"]);
  });

  it(`takes up to ${MAX_RANGE_POINTS} points`, async () => {
    const tools = createWidgetTools();
    const doubling = { calculator: "rule_of_72", inputs: {}, vary: "ratePercent", from: 1, step: 1 };
    expect((await tools.calculate_range({ ...doubling, to: MAX_RANGE_POINTS })).rows).toHaveLength(MAX_RANGE_POINTS);
    expect((await tools.calculate_range({ ...doubling, to: MAX_RANGE_POINTS + 1 })).error).toContain("use a bigger step");
  });

  it("explains a range it cannot draw, and tells onError", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ vary: "rate" }, "vary must be one of emi's inputs: principal, ratePercent, years."],
      [{ from: 0, to: 1000 }, `From 0 to 1000 by 1 is more than ${MAX_RANGE_POINTS} points, so use a bigger step.`],
      [{ step: 0 }, "step must be more than 0, so use a bigger step"],
      [{ from: 12, to: 6 }, "to (6) is below from (12)"],
      [{ output: "EMI" }, "output must be one of emi's results: Monthly instalment, Total interest, Total repaid."],
      [{ calculator: "home_loan" }, 'Unknown calculator "home_loan"'],
    ];
    for (const [change, message] of cases) {
      const { tools, errors } = toolsWithErrors();
      const result = await tools.calculate_range({ calculator: "emi", inputs: loan, vary: "ratePercent", from: 6, to: 12, step: 1, ...change });
      expect(result, JSON.stringify(change)).toEqual({ rows: [], output: "", outputs: [], error: expect.stringContaining(message) });
      expect(errors).toEqual([["calculate_range", result.error]]);
    }
  });

  it("skips points with no answer, and answers the first error when no point has one", async () => {
    const tools = createWidgetTools();
    // A loan over 0 years is not a loan; at 0% money never doubles.
    const loans = await tools.calculate_range({ calculator: "emi", inputs: loan, vary: "years", from: 0, to: 3, step: 1 });
    expect(loans.rows.map((r) => r.label)).toEqual(["1 y", "2 y", "3 y"]);
    const doubling = await tools.calculate_range({ calculator: "rule_of_72", inputs: {}, vary: "ratePercent", from: 0, to: 2, step: 1 });
    expect(doubling.rows.map((r) => r.label)).toEqual(["1%", "2%"]);
    const noPrincipal = await tools.calculate_range({ calculator: "emi", inputs: { ratePercent: 8.5 }, vary: "years", from: 1, to: 3, step: 1 });
    expect(noPrincipal.error).toContain("principal");
    const never = await tools.calculate_range({ calculator: "rule_of_72", inputs: {}, vary: "ratePercent", from: 0, to: 0, step: 1 });
    expect(never.error).toBe("Rule of 72 gives no finite answer at ratePercent 0.");
  });

  it("can check vary and input names because every calculator takes named inputs", () => {
    for (const c of CALCULATORS) expect(c.inputs, c.id).toBeInstanceOf(z.ZodObject);
  });
});

describe("the annuity_schedule tool", () => {
  const jackpot = { total: 1_537_000_000, payments: 30, growthPercent: 5, ratePercent: 3 };

  it("answers each yearly payment and its worth today, as annuitySchedule() does, labelled from Year 1", async () => {
    const schedule = annuitySchedule(jackpot);
    const result = await createWidgetTools().annuity_schedule(jackpot);
    expect(result.rows.map(({ year, payment, presentValue }) => ({ year, payment, presentValue }))).toEqual(schedule.rows);
    // year counts from now (the first payment is paid today); the label counts payments from 1.
    expect([result.rows[0].year, result.rows[0].label, result.rows[29].label]).toEqual([0, "Year 1", "Year 30"]);
    expect(result.presentValue).toBe(schedule.presentValue);
    expect(result.presentValueText).toBe(formatUsd(schedule.presentValue));
    expect(result.error).toBeUndefined();
  });

  it("keeps the payments between 1 and 60, as the annuity chart does", async () => {
    const tools = createWidgetTools();
    expect((await tools.annuity_schedule({ ...jackpot, payments: 100 })).rows).toHaveLength(60);
    expect((await tools.annuity_schedule({ ...jackpot, payments: 0 })).rows).toHaveLength(1);
    expect((await tools.annuity_schedule({ ...jackpot, payments: 2.6 })).rows).toHaveLength(3);
  });

  it("says so when the inputs give no finite schedule", async () => {
    const { tools, errors } = toolsWithErrors();
    const result = await tools.annuity_schedule({ ...jackpot, ratePercent: -100 });
    expect(result).toEqual({ rows: [], presentValue: 0, presentValueText: "", error: expect.stringContaining("no finite schedule") });
    expect(errors).toEqual([["annuity_schedule", result.error]]);
  });
});

const sensex: CaseData = {
  caseId: "sensex-1992",
  asOf: "1992-04-30",
  revealed: false,
  datasets: [
    {
      id: "sensex-close",
      label: "BSE Sensex, milestone closing levels",
      unit: "index points",
      source: "BSE, SENSEX@40 white paper",
      sourceUrl: "https://bseindia.com/example.pdf",
      checkedOn: "2026-11-02",
      points: [
        { date: "1991-12-31", value: 1908.85 },
        { date: "1992-02-29", value: 3017.68 },
        { date: "1992-04-22", value: 4467.32 },
      ],
    },
  ],
};
const reference = "sensex-1992/sensex-close";
const onlySensex = async (caseId: string) => (caseId === "sensex-1992" ? sensex : null);

describe("the case_data tool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers a dataset's points as rows, each value also written in the dataset's unit, with its source", async () => {
    const fetchCaseData = vi.fn(onlySensex);
    const result = await createWidgetTools({ fetchCaseData }).case_data({ dataset: reference });
    expect(fetchCaseData).toHaveBeenCalledWith("sensex-1992");
    expect(result).toEqual({
      rows: [
        { date: "1991-12-31", value: 1908.85, text: "1,908.85 index points" },
        { date: "1992-02-29", value: 3017.68, text: "3,017.68 index points" },
        { date: "1992-04-22", value: 4467.32, text: "4,467.32 index points" },
      ],
      label: "BSE Sensex, milestone closing levels",
      unit: "index points",
      source: "BSE, SENSEX@40 white paper",
      sourceUrl: "https://bseindia.com/example.pdf",
      asOf: "1992-04-30",
      revealed: false,
    });
  });

  it("fetches each Case once for the widget, however many Queries read it", async () => {
    const fetchCaseData = vi.fn(onlySensex);
    const tools = createWidgetTools({ fetchCaseData });
    await Promise.all([tools.case_data({ dataset: reference }), tools.case_data({ dataset: reference }), tools.case_data({ dataset: "sensex-1992/nifty-close" })]);
    await tools.case_data({ dataset: reference });
    expect(fetchCaseData).toHaveBeenCalledTimes(1);
    await tools.case_data({ dataset: "fed-hike-1994/fed-funds" });
    expect(fetchCaseData).toHaveBeenCalledTimes(2);
    // Another widget has its own tools, so it fetches afresh: one drawn after the reveal gets the full data.
    await createWidgetTools({ fetchCaseData }).case_data({ dataset: reference });
    expect(fetchCaseData).toHaveBeenCalledTimes(3);
  });

  it("says there is no sourced data for a missing or withheld dataset, an unknown Case, or a failed request", async () => {
    const { tools, errors } = toolsWithErrors({
      fetchCaseData: async (caseId) => {
        if (caseId === "offline") throw new Error("Failed to fetch");
        return onlySensex(caseId);
      },
    });
    for (const ref of ["sensex-1992/nifty-close", "no-such-case/close", "offline/close"]) {
      const result = await tools.case_data({ dataset: ref });
      expect(result).toEqual({
        rows: [],
        label: "",
        unit: "",
        source: "",
        sourceUrl: "",
        asOf: "",
        revealed: false,
        error: `No sourced data for ${ref}: it may not exist, or it is withheld until the reveal.`,
      });
    }
    expect(errors.map(([tool]) => tool)).toEqual(["case_data", "case_data", "case_data"]);
  });

  it("tries a Case that failed to load again on a later Query", async () => {
    const fetchCaseData = vi.fn<(caseId: string) => Promise<CaseData | null>>().mockResolvedValueOnce(null).mockResolvedValue(sensex);
    const tools = createWidgetTools({ fetchCaseData });
    expect((await tools.case_data({ dataset: reference })).error).toContain("No sourced data");
    expect((await tools.case_data({ dataset: reference })).rows).toHaveLength(3);
    expect(fetchCaseData).toHaveBeenCalledTimes(2);
  });

  it("takes only a Case Data reference", async () => {
    const result = await createWidgetTools({ fetchCaseData: onlySensex }).case_data({ dataset: "the Sensex in 1992" });
    expect(result.error).toBe('case_data: dataset: a Case Data reference, "caseId/datasetId". It takes {dataset}.');
  });

  it("fetches through the server's as-of rule, /api/case-data, by default", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(sensex));
    vi.stubGlobal("fetch", fetch);
    const result = await createWidgetTools().case_data({ dataset: reference });
    expect(fetch).toHaveBeenCalledWith("/api/case-data/sensex-1992");
    expect(result.rows).toHaveLength(3);
  });
});

describe("every widget tool", () => {
  it("answers empty rows and a plain error, never throwing, for garbage arguments", async () => {
    const { tools, errors } = toolsWithErrors({ fetchCaseData: async () => null });
    const garbage: unknown[] = [undefined, null, {}, "emi", 42, Number.NaN, [], [1, 2], { calculator: 5, inputs: "x" }, { dataset: Number.NaN }, { total: Number.NaN, payments: Infinity }];
    for (const name of WIDGET_TOOL_NAMES) {
      for (const args of garbage) {
        const result = await tools[name](args as Record<string, unknown>);
        expect(result.rows, `${name}(${String(args)})`).toEqual([]);
        expect(result.error, `${name}(${String(args)})`).toMatch(new RegExp(`^${name}: .+ It takes \\{`));
      }
    }
    expect(errors).toHaveLength(WIDGET_TOOL_NAMES.length * garbage.length);
  });

  it("still answers when onError itself throws", async () => {
    const tools = createWidgetTools({
      onError: () => {
        throw new Error("a broken listener");
      },
    });
    await expect(tools.calculate({})).resolves.toMatchObject({ rows: [], error: expect.any(String) });
  });
});

describe("the tools in OpenUI's own query runner", () => {
  it("answer a widget's Query, and run again only when a slider moves an argument", async () => {
    const tools = createWidgetTools();
    let calls = 0;
    // As the Renderer calls a function map: the tool looked up by name and called on its own, with the evaluated arguments.
    const runner = createQueryManager({
      callTool: (name, args) => {
        calls++;
        const tool = tools[name as WidgetToolName];
        return tool(args);
      },
    });
    const growth = (ratePercent: number): QueryNode => ({
      statementId: "growth",
      toolName: "calculate_range",
      args: { calculator: "future_value", inputs: { amount: 100_000, ratePercent, years: 1 }, vary: "years", from: 1, to: 3, step: 1 },
      defaults: { rows: [] },
      deps: undefined,
      complete: true,
    });
    const values = () => (runner.getResult("growth") as { rows: RangeRow[] }).rows.map((r) => r.value);
    const expected = (ratePercent: number) => [1, 2, 3].map((years) => line("future_value", { amount: 100_000, ratePercent, years }).value);
    runner.activate();
    runner.evaluateQueries([growth(8)]);
    await vi.waitFor(() => expect(values()).toEqual(expected(8)));
    runner.evaluateQueries([growth(8)]);
    runner.evaluateQueries([growth(10)]);
    await vi.waitFor(() => expect(values()).toEqual(expected(10)));
    expect(calls).toBe(2);
    runner.dispose();
  });
});
