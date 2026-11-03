import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Conversation, type Line } from "./conversation";
import { WidgetPanel, widgetConcept, type WidgetItem } from "./widget-panel";

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
});
