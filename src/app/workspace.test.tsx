import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CaseData } from "@/case-data/case-data";
import { Conversation, type Line } from "./conversation";
import { loadSourcedCases, SourcedStrip, WidgetPanel, widgetConcept, type SourcedCases, type WidgetItem } from "./widget-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const fence = (code: string) => ["```openui-lang", code, "```"].join("\n");
const ANNUITY = `root = Widget("What the annuity is worth today", [rate, chart])
$rate = 3
rate = Slider("rate", "Discount rate", 0, 10, 0.25, $rate, "percent")
chart = AnnuityChart(1537000000, 30, 5, $rate)`;
const HISTORY = `root = Widget("Long-term interest rates", [history])
history = HistoryChart("mega-millions-2018/treasury-30-year")`;
const CALC = `root = Widget("What a home loan costs", [calc])
calc = Calculator("emi", {principal: 5000000, ratePercent: 8.5, years: 20})`;
const SLIDER_ONLY = `root = Widget("Pick a rate", [rate])
$rate = 3
rate = Slider("rate", "Discount rate", 0, 10, 0.25, $rate, "percent")`;

const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };
const choices = [
  { id: "a", text: "Twenty-five" },
  { id: "b", text: "Zero point two five" },
];
const quiz = { attemptId: 1, checkId: "c", attemptNo: 0, questions: [{ id: "q", prompt: "How many basis points?", choices }] };

function workspace(over: Partial<Parameters<typeof Conversation>[0]> = {}) {
  return renderToStaticMarkup(
    <Conversation
      initial={[]}
      summary="You are learning present value."
      quiz={null}
      pending={null}
      review={noReview}
      place={{ stage: "foundation", title: "Present value" }}
      {...over}
    />,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the workspace's left column", () => {
  it("shows the status card: Course Map, Stage and Topic, the summary and Continue", () => {
    const html = text(workspace());
    expect(html).toContain("Course Map · Foundation · Present value");
    expect(html).toContain("You are learning present value.");
    expect(html).toMatch(/Continue/);
  });

  it("has a polite status line for screen readers, empty until a turn runs, apart from the streaming text", () => {
    const html = workspace();
    expect(html).toMatch(/<p role="status" aria-live="polite" class="sr-only" data-testid="turn-status"><\/p>/);
    expect(html.indexOf("turn-status")).toBeGreaterThan(html.indexOf("Ask the Tutor") - 2000);
  });

  it("folds a due spaced review into one row with the due count, and leaves it out when none is due", () => {
    const due = text(workspace({ review: { question: { id: "q", prompt: "How many basis points?", choices }, dueCount: 2, done: 0, cap: 5 } }));
    expect(due).toContain("Spaced review · 2 due");
    expect(due).toContain("Show");
    expect(due).toContain("How many basis points?");
    expect(text(workspace())).not.toContain("Spaced review");
  });

  it("folds an open quiz into one row, and leaves it out when there is none", () => {
    const open = text(workspace({ quiz }));
    expect(open).toContain("Quiz Check open");
    expect(open).toContain("Submit answers");
    expect(text(workspace())).not.toContain("Quiz Check");
  });

  it("puts a Widget chip where a Widget belongs in a reply, never the Widget itself", () => {
    const initial: Line[] = [
      { role: "user", text: "Show me" },
      { role: "assistant", text: `Here it is.\n\n${fence(ANNUITY)}\n\nMove the slider.` },
    ];
    const html = workspace({ initial });
    const chat = html.slice(0, html.indexOf('data-testid="widget-pane"'));
    expect(text(chat)).toContain("Widget 1 →");
    expect(chat).not.toContain("Discount rate");
    expect(chat).not.toContain("openui-lang");
  });

  it("has a composer that asks the Tutor", () => {
    expect(workspace()).toContain('placeholder="Ask the Tutor"');
  });
});

describe("the Widget panel", () => {
  const items: WidgetItem[] = [
    { key: "a:0", number: 1, code: HISTORY, complete: true },
    { key: "b:0", number: 2, code: ANNUITY, complete: true },
  ];

  it("shows the newest Widget by default in the workspace", () => {
    const initial: Line[] = [
      { role: "assistant", text: fence(CALC) },
      { role: "assistant", text: fence(ANNUITY) },
    ];
    const html = workspace({ initial });
    const panel = text(html.slice(html.indexOf('data-testid="widget-pane"')));
    expect(panel).toContain("What the annuity is worth today");
    expect(panel).toContain("Discount rate");
    expect(panel).not.toContain("Loan amount");
  });

  it("shows a chip per Widget title only once there are two or more", () => {
    const two = text(renderToStaticMarkup(<WidgetPanel widgets={items} shown={items[1]} onPick={() => {}} />));
    expect(two).toContain("Long-term interest rates");
    expect(two).toContain("What the annuity is worth today");
    const one = renderToStaticMarkup(<WidgetPanel widgets={[items[1]]} shown={items[1]} onPick={() => {}} />);
    expect(one).not.toContain("Widgets in this Session");
    expect(text(one)).not.toContain("Long-term interest rates");
  });

  it("names the concept from the Widget's components, else the current Topic", () => {
    expect(widgetConcept(ANNUITY, "Bonds")).toBe("Present value");
    expect(widgetConcept(HISTORY, "Bonds")).toBe("Case Data");
    expect(widgetConcept(CALC, "Bonds")).toBe("Calculator");
    expect(widgetConcept(SLIDER_ONLY, "Bonds")).toBe("Bonds");
    const card = text(renderToStaticMarkup(<WidgetPanel widgets={[items[1]]} shown={items[1]} onPick={() => {}} topicTitle="Bonds" />));
    expect(card).toContain("Present value");
  });

  it("shows the dashed empty state before the Tutor builds any Widget", () => {
    expect(text(renderToStaticMarkup(<WidgetPanel widgets={[]} shown={undefined} onPick={() => {}} />))).toContain("Widgets the Tutor builds appear here.");
    expect(text(workspace())).toContain("Widgets the Tutor builds appear here.");
  });

  it("names the concept from the Widget tools its Queries call, and a Formula Card's Widget Formula", () => {
    const calling = (query: string) => `root = Widget("T", [])\nq = ${query}`;
    expect(widgetConcept(calling('Query("annuity_schedule", {total: 1537000000, payments: 30, growthPercent: 5, ratePercent: 3}, {rows: []})'), "Bonds")).toBe("Present value");
    expect(widgetConcept(calling('Query("case_data", {dataset: "sensex-1992/sensex-closes"}, {rows: []})'), "Bonds")).toBe("Case Data");
    expect(widgetConcept(calling('Query("calculate", {calculator: "emi", inputs: {principal: 5000000, ratePercent: 8.5, years: 20}}, {rows: []})'), "Bonds")).toBe("Calculator");
    expect(
      widgetConcept(calling('Query("calculate_range", {calculator: "future_value", inputs: {amount: 100000, ratePercent: 8, years: 1}, vary: "years", from: 1, to: 30, step: 1}, {rows: []})'), "Bonds"),
    ).toBe("Calculator");
    expect(widgetConcept('root = Widget("PV", [card])\ncard = FormulaCard("present-value", {}, {}, {amount: 1000, ratePercent: 10, years: 5})', "Bonds")).toBe("Formula");
  });

  // These need OpenUI's kit (Stack, BarChart, Table, AreaChart) in the frozen schema.
  it("says Illustration for a ready-made chart or table whose numbers none of our code supplies", () => {
    const bars = `root = Widget("Illustration: a rate moving from 5% to 5.5%", [box])
box = Stack([chart])
chart = BarChart(["Before", "After"], [Series("Rate (%)", [5, 5.5])])`;
    expect(widgetConcept(bars, "Bonds")).toBe("Illustration");
    expect(widgetConcept('root = Widget("Illustration: two rates", [t])\nt = Table([Col("Rate", ["5%", "5.5%"])])', "Bonds")).toBe("Illustration");
  });

  it("names the code behind a kit chart's numbers, deep in the layout, rather than Illustration", () => {
    const grow = `root = Widget("How 1 lakh grows at your rate", [box])
$rate = 8
box = Stack([rate, chart])
rate = Slider("ratePercent", "Yearly return", 1, 15, 0.5, $rate, "percent")
chart = AreaChart(g.rows.label, [Series(g.output, g.rows.value)])
g = Query("calculate_range", {calculator: "future_value", inputs: {amount: 100000, ratePercent: $rate, years: 1}, vary: "years", from: 1, to: 30, step: 1}, {rows: []})`;
    expect(widgetConcept(grow, "Bonds")).toBe("Calculator");
    expect(widgetConcept(`root = Widget("Rates", [box])\nbox = Stack([history])\nhistory = HistoryChart("mega-millions-2018/treasury-30-year")`, "Bonds")).toBe("Case Data");
  });
});

describe("the Sourced strip under a Widget that draws Case Data", () => {
  const sensex: CaseData = {
    caseId: "sensex-1992",
    asOf: "1992-04-29",
    revealed: false,
    datasets: [
      { id: "sensex-closes", label: "Sensex closing values", unit: "points", source: "BSE", sourceUrl: "https://example.com/bse", checkedOn: "2026-10-01", points: [{ date: "1992-01-02", value: 1900 }] },
    ],
  };
  const strip = (datasets: string[], cases: SourcedCases | undefined) => renderToStaticMarkup(<SourcedStrip datasets={datasets} cases={cases} />);

  it("shows an amber Sourced line per dataset, with its label and ⓘ credit, and what stays withheld until the reveal", () => {
    const html = strip(["sensex-1992/sensex-closes"], { "sensex-1992": sensex });
    expect(html.match(/data-kind="sourced"/g)).toHaveLength(1);
    expect(text(html)).toContain("Sourced Sensex closing values");
    expect(html).toContain('data-testid="credit"');
    expect(html).toContain("ⓘ");
    expect(text(html)).toContain("Data after 1992-04-29 is withheld until the reveal.");
    expect(text(strip(["sensex-1992/sensex-closes"], { "sensex-1992": { ...sensex, revealed: true } }))).not.toContain("withheld");
  });

  it("shows nothing while the data loads, and a quiet note for a dataset the server does not have", () => {
    expect(strip(["sensex-1992/sensex-closes"], undefined)).toBe("");
    const missing = strip(["sensex-1992/sensex-highs", "fed-hike-1994/fed-funds-rate"], { "sensex-1992": sensex, "fed-hike-1994": null });
    expect(text(missing)).toContain("No sourced data for sensex-1992/sensex-highs.");
    expect(text(missing)).toContain("No sourced data for fed-hike-1994/fed-funds-rate.");
    expect(missing).not.toContain('data-kind="sourced"');
  });

  it("fetches each Case once, through the server's as-of route, and marks one it cannot fetch", async () => {
    const fetchImpl = vi.fn(async (url: string) => (url === "/api/case-data/sensex-1992" ? Response.json(sensex) : new Response("Not found", { status: 404 })));
    const cases = await loadSourcedCases(["sensex-1992/sensex-closes", "sensex-1992/sensex-highs", "fed-hike-1994/fed-funds-rate"], fetchImpl as unknown as typeof fetch);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(["/api/case-data/sensex-1992", "/api/case-data/fed-hike-1994"]);
    expect(cases).toEqual({ "sensex-1992": sensex, "fed-hike-1994": null });
  });

  it("is not drawn on the server, where the data has not loaded yet", () => {
    const item: WidgetItem = { key: "a:0", number: 1, code: 'root = Widget("Sensex milestones", [])\nd = Query("case_data", {dataset: "sensex-1992/sensex-closes"}, {rows: []})', complete: true };
    const html = renderToStaticMarkup(<WidgetPanel widgets={[item]} shown={item} onPick={() => {}} />);
    expect(text(html)).toContain("Sensex milestones");
    expect(html).not.toContain("sourced-strip");
  });
});
