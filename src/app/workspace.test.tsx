import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CaseData } from "@/case-data/case-data";
import { caseLoader, fetchCaseData } from "@/widgets/case-data-client";
import { createWidgetTools } from "@/widgets/tools";
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
const quiz = { attemptId: 1, checkId: "c", checkNumber: 1, checkCount: 2, attemptNo: 0, questions: [{ id: "q", prompt: "How many basis points?", choices }] };

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

  it("has no folded quiz bar: an open quiz is not in the left column", () => {
    const html = workspace({ quiz });
    const left = text(html.slice(0, html.indexOf('data-testid="widget-pane"')));
    expect(left).not.toContain("Quiz Check open");
    expect(left).not.toContain("How many basis points?");
    expect(left).not.toContain("Submit answers");
  });

  it("puts a Widget chip where a Widget belongs in a reply, never the Widget itself", () => {
    const initial: Line[] = [
      { role: "user", text: "Show me" },
      { role: "assistant", text: `Here it is.\n\n${fence(ANNUITY)}\n\nMove the slider.` },
    ];
    const html = workspace({ initial });
    const chat = html.slice(0, html.indexOf('data-testid="widget-pane"'));
    expect(text(chat)).toContain("Open: What the annuity is worth today →");
    expect(chat).not.toContain("Discount rate");
    expect(chat).not.toContain("openui-lang");
  });

  it("never shows a numbered \"Widget N →\" chip anywhere in the workspace", () => {
    const initial: Line[] = [
      { role: "assistant", text: fence(HISTORY) },
      { role: "assistant", text: fence(ANNUITY) },
    ];
    const html = text(workspace({ initial }));
    expect(html).toContain("Open: Long-term interest rates →");
    expect(html).toContain("Open: What the annuity is worth today →");
    expect(html).not.toMatch(/Widget \d/);
  });

  it("labels every Tutor reply \"Tutor\" in navy, and no Learner message", () => {
    const initial: Line[] = [
      { role: "user", text: "What is present value?" },
      { role: "assistant", text: "Present value is **today's worth** of money paid later." },
      { role: "user", text: "And discounting?" },
      { role: "assistant", text: "### Step one\n\nDiscounting is the reverse of compounding." },
    ];
    const html = workspace({ initial });
    const labels = html.match(/<[^>]*data-testid="tutor-label"[^>]*>Tutor</g) ?? [];
    expect(labels).toHaveLength(2);
    for (const label of labels) expect(label).toContain("text-[var(--brand)]");
    const firstReply = html.indexOf("today");
    expect(html.indexOf("tutor-label")).toBeGreaterThan(html.indexOf("What is present value?"));
    expect(html.indexOf("tutor-label")).toBeLessThan(firstReply);
  });

  it("never says \"lesson\" anywhere in the Study Workspace markup", () => {
    const initial: Line[] = [
      { role: "user", text: "Show me" },
      { role: "assistant", text: `Here it is.\n\n${fence(ANNUITY)}` },
    ];
    expect(workspace({ initial }).toLowerCase()).not.toContain("lesson");
    expect(workspace({ quiz, review: { ...noReview, dueCount: 2 } }).toLowerCase()).not.toContain("lesson");
  });

  it("has a composer that asks the Tutor", () => {
    expect(workspace()).toContain('placeholder="Ask the Tutor"');
  });

  it("hides Under the hood by default, and shows it under each Tutor reply when Show developer details is on", () => {
    const usage = { model: "claude-opus-5-5", inputTokens: 1200, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: null, durationMs: 2500, costUsd: 0.05, tools: [], steps: [] };
    const initial: Line[] = [
      { role: "user", text: "What is present value?" },
      { role: "assistant", text: "Today's worth of money paid later.", usage },
    ];
    expect(text(workspace({ initial }))).not.toContain("Under the hood");
    const shown = text(workspace({ initial, developerDetails: true }));
    expect(shown).toContain("Under the hood: 0 steps, 1,200 tokens in, 300 out");
    expect(shown.indexOf("Under the hood")).toBeGreaterThan(shown.indexOf("Today's worth"));
  });
});

describe("a Topic passed in a turn", () => {
  const passedTopic = { title: "Present value", next: "Next Topic: Bond prices" };
  const initial: Line[] = [
    { role: "user", text: "So money today is worth more." },
    { role: "assistant", text: "Exactly. Topic complete." },
  ];

  it("keeps its Session on screen, offers What comes next and the Course Map, and has no message box", () => {
    const html = workspace({ initial, passed: passedTopic });
    expect(text(html)).toContain("Exactly. Topic complete.");
    expect(text(html)).toContain("Present value is passed.");
    expect(html).toMatch(/<button[^>]*data-what-comes-next[^>]*>Next Topic: Bond prices →<\/button>/);
    expect(html).toMatch(/<a[^>]*href="\/course"[^>]*>Course Map<\/a>/);
    expect(html).not.toContain('placeholder="Ask the Tutor"');
  });

  it("with every Topic passed, offers only the Course Map", () => {
    const html = workspace({ initial, passed: { title: "Present value", next: null } });
    expect(html).not.toContain("data-what-comes-next");
    expect(html).toMatch(/<a[^>]*href="\/course"[^>]*>Course Map<\/a>/);
  });
});

describe("the fixed two-column layout", () => {
  const tag = (html: string, testid: string) => html.match(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? "";
  const review = { question: { id: "q", prompt: "How many basis points?", choices }, dueCount: 2, done: 0, cap: 5 };

  it("fills the height it is given, never more, with both columns scrolling inside themselves", () => {
    const html = workspace({ quiz, review });
    const frame = tag(html, "workspace-frame");
    expect(frame).toMatch(/\bflex-1\b/);
    expect(frame).toMatch(/\bmin-h-0\b/);
    expect(frame).toMatch(/\boverflow-hidden\b/);
    const pane = tag(html, "widget-pane");
    expect(pane).toMatch(/\boverflow-y-auto\b/);
    expect(pane).toMatch(/\bmin-h-0\b/);
    expect(pane).not.toMatch(/\bsticky\b/);
    const thread = tag(html, "thread-viewport");
    expect(thread).toMatch(/\boverflow-y-auto\b/);
    expect(thread).toMatch(/\bmin-h-0\b/);
  });

  it("caps what stands above the chat (status card, Review) and scrolls it inside itself, so the chat keeps its height", () => {
    const html = workspace({ review });
    const above = tag(html, "above-thread");
    expect(above).toMatch(/\bmax-h-/);
    expect(above).toMatch(/\boverflow-y-auto\b/);
    const inside = html.slice(html.indexOf('data-testid="above-thread"'), html.indexOf('data-testid="thread-viewport"'));
    expect(text(inside)).toContain("Spaced review · 2 due");
    expect(inside).toContain('aria-label="Where you stand"');
  });
});

describe("a quiz Check in the right panel", () => {
  const pane = (html: string) => html.slice(html.indexOf('data-testid="widget-pane"'));

  it("opens as a tab named Check k of N, selected automatically, showing the questions", () => {
    const html = pane(workspace({ quiz }));
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>(<[^>]+>)*Check 1 of 2</);
    expect(text(html)).toContain("How many basis points?");
    expect(text(html)).toContain("Submit answers");
  });

  it("stays the selected tab when the Tutor has drawn Widgets, which keep their own tabs", () => {
    const initial: Line[] = [{ role: "assistant", text: fence(ANNUITY) }];
    const html = pane(workspace({ quiz, initial }));
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>(<[^>]+>)*Check 1 of 2</);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*title="What the annuity is worth today"/);
    expect(text(html)).toContain("How many basis points?");
    expect(text(html)).not.toContain("Discount rate");
  });

  it("puts the quiz rule above the message box while the quiz is open, and the box stays usable", () => {
    const note = "Quiz open: the Tutor will help with these questions after you submit.";
    const html = workspace({ quiz });
    const left = html.slice(0, html.indexOf('data-testid="widget-pane"'));
    expect(text(left)).toContain(note);
    // Above the box: after the thread, before the box itself.
    expect(left.indexOf(note)).toBeGreaterThan(left.indexOf('data-testid="thread-viewport"'));
    expect(left.indexOf(note)).toBeLessThan(left.indexOf('placeholder="Ask the Tutor"'));
    expect(left.match(/<textarea[^>]*placeholder="Ask the Tutor"[^>]*>/)?.[0]).not.toMatch(/\bdisabled\b/);
    expect(text(workspace())).not.toContain(note);
  });

  it("has no Check tab when no quiz is open", () => {
    expect(text(workspace())).not.toMatch(/Check \d of \d/);
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

  it("replaces a Widget in its own tab when the Tutor draws one with the same title, adding no new tab", () => {
    const updated = SLIDER_ONLY.replace('"Discount rate"', '"Loan rate"');
    const initial: Line[] = [
      { role: "assistant", text: fence(SLIDER_ONLY) },
      { role: "assistant", text: fence(CALC) },
      { role: "assistant", text: `Here it is again.\n\n${fence(updated)}` },
    ];
    const html = workspace({ initial });
    const panel = html.slice(html.indexOf('data-testid="widget-pane"'));
    const row = panel.slice(panel.indexOf('aria-label="Widgets in this Session"'), panel.indexOf("</div>", panel.indexOf('aria-label="Widgets in this Session"')));
    // Two tabs, the updated Widget still first, where "Pick a rate" was.
    expect([...row.matchAll(/<button[^>]*title="([^"]*)"/g)].map((m) => m[1])).toEqual(["Pick a rate", "What a home loan costs"]);
    // The newest drawing shows, in the updated Widget's tab.
    expect(text(panel)).toContain("Loan rate");
    expect(text(panel)).not.toContain("Discount rate");
    // Both replies' chips open the one Widget.
    const chat = text(html.slice(0, html.indexOf('data-testid="widget-pane"')));
    expect(chat.match(/Open: Pick a rate →/g)).toHaveLength(2);
  });

  it("shows a chip per Widget title only once there are two or more", () => {
    const two = text(renderToStaticMarkup(<WidgetPanel widgets={items} shown={items[1]} onPick={() => {}} />));
    expect(two).toContain("Long-term interest rates");
    expect(two).toContain("What the annuity is worth today");
    const one = renderToStaticMarkup(<WidgetPanel widgets={[items[1]]} shown={items[1]} onPick={() => {}} />);
    expect(one).not.toContain("Widgets in this Session");
    expect(text(one)).not.toContain("Long-term interest rates");
  });

  it("keeps its tabs on one line that scrolls sideways, each named by title and shortened when long", () => {
    const long = `root = Widget("A very long title for a Widget that would never fit on one tab in the right panel", [history])
history = HistoryChart("mega-millions-2018/treasury-30-year")`;
    const many: WidgetItem[] = [...items, ...[3, 4, 5, 6].map((n) => ({ key: `m:${n}`, number: n, code: n === 6 ? long : CALC, complete: true }))];
    const html = renderToStaticMarkup(<WidgetPanel widgets={many} shown={many[0]} onPick={() => {}} />);
    const row = html.match(/<div[^>]*aria-label="Widgets in this Session"[^>]*>/)?.[0] ?? "";
    expect(row).toMatch(/\bflex-nowrap\b/);
    expect(row).toMatch(/\boverflow-x-auto\b/);
    expect(row).not.toMatch(/\bflex-wrap\b/);
    const tab = html.match(/<button[^>]*title="A very long title[^"]*"[^>]*>\s*<span[^>]*>/)?.[0] ?? "";
    expect(tab).toMatch(/\bshrink-0\b/);
    expect(tab).toMatch(/\bmax-w-/);
    expect(tab).toMatch(/<span[^>]*\btruncate\b/);
    expect(text(html)).not.toMatch(/Widget \d/);
  });

  it("names the concept from the Widget's components, else the current Topic", () => {
    expect(widgetConcept(ANNUITY, "Bonds")).toBe("Present value");
    expect(widgetConcept(HISTORY, "Bonds")).toBe("Case Data");
    expect(widgetConcept(CALC, "Bonds")).toBe("Calculator");
    expect(widgetConcept(SLIDER_ONLY, "Bonds")).toBe("Bonds");
    const card = text(renderToStaticMarkup(<WidgetPanel widgets={[items[1]]} shown={items[1]} onPick={() => {}} topicTitle="Bonds" />));
    expect(card).toContain("Present value");
  });

  it("says \"Widgets for this Topic will appear here.\" before the Tutor builds any Widget", () => {
    expect(text(renderToStaticMarkup(<WidgetPanel widgets={[]} shown={undefined} onPick={() => {}} />))).toContain("Widgets for this Topic will appear here.");
    expect(text(workspace())).toContain("Widgets for this Topic will appear here.");
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

  it("names the Topic, not Illustration, over a finished Widget the check refuses, which shows only the fallback", () => {
    const code = `root = Widget("Sensex prices", [line])
prices = Query("not_a_tool", {dataset: "sensex-1992/sensex-close"}, {rows: []})
line = LineChart(prices.rows.date, [Series("Close", prices.rows.value)])`;
    const broken: WidgetItem = { key: "c:0", number: 3, code, complete: true };
    const card = text(renderToStaticMarkup(<WidgetPanel widgets={[broken]} shown={broken} onPick={() => {}} topicTitle="Bonds" />));
    expect(card).toContain("This widget could not be drawn");
    expect(card).toContain("Bonds");
    expect(card).not.toContain("Illustration");
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

  // A dataset the server does not have, or withholds, already gets the Widget's own line under the chart
  // ("This chart's data could not be loaded: No sourced data for …"), so the strip does not say it twice.
  it("shows nothing while the data loads, and no line for a dataset the server does not have", () => {
    expect(strip(["sensex-1992/sensex-closes"], undefined)).toBe("");
    expect(strip(["sensex-1992/sensex-highs", "fed-hike-1994/fed-funds-rate"], { "sensex-1992": sensex, "fed-hike-1994": null })).toBe("");
    const some = strip(["sensex-1992/sensex-closes", "fed-hike-1994/fed-funds-rate"], { "sensex-1992": sensex, "fed-hike-1994": null });
    expect(some.match(/data-kind="sourced"/g)).toHaveLength(1);
    expect(text(some)).toContain("Sourced Sensex closing values");
    expect(text(some)).not.toContain("fed-funds-rate");
  });

  it("fetches each Case once, through the server's as-of route, and marks one it cannot fetch", async () => {
    const fetchImpl = vi.fn(async (url: string) => (url === "/api/case-data/sensex-1992" ? Response.json(sensex) : new Response("Not found", { status: 404 })));
    const loadCase = (caseId: string) => fetchCaseData(caseId, fetchImpl as unknown as typeof fetch);
    const cases = await loadSourcedCases(["sensex-1992/sensex-closes", "sensex-1992/sensex-highs", "fed-hike-1994/fed-funds-rate"], loadCase);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(["/api/case-data/sensex-1992", "/api/case-data/fed-hike-1994"]);
    expect(cases).toEqual({ "sensex-1992": sensex, "fed-hike-1994": null });
  });

  it("shares one request per Case with the Widget's own Queries, as the Widget panel gives both one loader", async () => {
    const load = vi.fn(async (caseId: string) => (caseId === "sensex-1992" ? sensex : null));
    const loadCase = caseLoader(load);
    const tools = createWidgetTools({ fetchCaseData: loadCase });
    const [, query] = await Promise.all([loadSourcedCases(["sensex-1992/sensex-closes"], loadCase), tools.case_data({ dataset: "sensex-1992/sensex-closes" })]);
    await tools.case_data({ dataset: "sensex-1992/sensex-closes" });
    expect(query.rows).toEqual([{ date: "1992-01-02", value: 1900, text: "1,900 points" }]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("is not drawn on the server, where the data has not loaded yet", () => {
    const item: WidgetItem = { key: "a:0", number: 1, code: 'root = Widget("Sensex milestones", [])\nd = Query("case_data", {dataset: "sensex-1992/sensex-closes"}, {rows: []})', complete: true };
    const html = renderToStaticMarkup(<WidgetPanel widgets={[item]} shown={item} onPick={() => {}} />);
    expect(text(html)).toContain("Sensex milestones");
    expect(html).not.toContain("sourced-strip");
  });
});
