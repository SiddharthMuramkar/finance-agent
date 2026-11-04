import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CaseData } from "@/case-data/case-data";
import { loadCourseMap } from "@/course/map";
import { stepSequence, type Progress } from "@/course/navigator";
import { topicStart } from "@/course/topic-start";
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
  it("draws an old stored Continue. as a → next step divider, and says Continue nowhere", () => {
    const html = workspace({
      initial: [
        { role: "assistant", text: "That is the story." },
        { role: "user", text: "Continue." },
        { role: "assistant", text: "Now the concept." },
      ],
    });
    const at = html.indexOf("→ next step");
    expect(at).toBeGreaterThan(html.indexOf("That is the story."));
    expect(at).toBeLessThan(html.indexOf("Now the concept."));
    expect(html).toContain('data-testid="next-step-divider"');
    expect(html).not.toMatch(/Continue/);
  });

  it("leaves the turn's status words to the app's one live region, not one of its own", () => {
    const html = workspace();
    expect(html).not.toContain('data-testid="turn-status"');
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
    expect(text(chat)).toContain("What the annuity is worth today");
    expect(chat).not.toContain("Discount rate");
    expect(chat).not.toContain("openui-lang");
  });

  it("never shows a numbered \"Widget N →\" chip anywhere in the workspace", () => {
    const initial: Line[] = [
      { role: "assistant", text: fence(HISTORY) },
      { role: "assistant", text: fence(ANNUITY) },
    ];
    const html = text(workspace({ initial }));
    expect(html).toContain("Long-term interest rates");
    expect(html).toContain("What the annuity is worth today");
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

  it("draws a stored step divider as a small centred divider at its place in the thread, and the reply's Save to notes only once", () => {
    const ref = { sessionId: 7, turnSeq: 2 };
    const initial: Line[] = [
      { role: "user", text: "I'd take the lump sum." },
      { role: "assistant", text: "Good thinking.", ref, more: true },
      { role: "item", kind: "step", data: { step: "concept", number: 2, label: "Step 2 of 6 · Concept" } },
      { role: "assistant", text: "Now the concept: money today is worth more.", ref },
    ];
    const html = workspace({ initial });
    const divider = html.match(/<div[^>]*data-testid="step-divider"[^>]*>.*?Step 2 of 6 · Concept.*?<\/div>/)?.[0];
    expect(divider).toBeDefined();
    expect(divider).toContain('role="separator"');
    expect(divider).toContain("justify-center");
    const at = html.indexOf("Step 2 of 6 · Concept");
    expect(at).toBeGreaterThan(html.indexOf("Good thinking."));
    expect(at).toBeLessThan(html.indexOf("Now the concept"));
    // A divider is not a message: no Tutor label or bubble of its own, and one Save to notes for the whole reply, at its end.
    expect(html.match(/data-testid="tutor-label"/g)).toHaveLength(2);
    expect(text(html).match(/Save to notes/g)).toHaveLength(1);
    expect(text(html).indexOf("Save to notes")).toBeGreaterThan(text(html).indexOf("Now the concept"));
  });

  it("puts a Widget chip in each part of a reply a divider cut", () => {
    const ref = { sessionId: 7, turnSeq: 2 };
    const initial: Line[] = [
      { role: "assistant", text: `First.\n\n${fence(HISTORY)}`, ref, more: true },
      { role: "item", kind: "step", data: { step: "concept", number: 2, label: "Step 2 of 6 · Concept" } },
      { role: "assistant", text: `Then.\n\n${fence(ANNUITY)}`, ref },
    ];
    const html = text(workspace({ initial }));
    expect(html).toContain("Long-term interest rates");
    expect(html).toContain("What the annuity is worth today");
    expect(html.indexOf("What the annuity is worth today")).toBeGreaterThan(html.indexOf("Step 2 of 6 · Concept"));
  });

  it("skips a Session item of a kind it does not know, and draws the rest of the thread", () => {
    const initial: Line[] = [
      { role: "user", text: "Hello" },
      { role: "item", kind: "from-the-future", data: { label: "Something new" } },
      { role: "assistant", text: "Hi there." },
    ];
    const html = workspace({ initial });
    expect(html).not.toContain("Something new");
    expect(text(html)).toContain("Hello");
    expect(text(html)).toContain("Hi there.");
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

describe("the Next chip", () => {
  const conversation: Line[] = [
    { role: "user", text: "Hi" },
    { role: "assistant", text: "Once, a lottery winner had a choice." },
    { role: "user", text: "Go on." },
    { role: "assistant", text: "Which would you take?" },
  ];
  const toConcept = { kind: "next", step: "concept", label: "Next: Concept", advances: true } as const;
  const chips = (html: string) => html.match(/<button[^>]*data-testid="next-chip"[^>]*>[^<]*<\/button>/g) ?? [];

  it("names the next step once, under the latest Tutor reply only", () => {
    const html = workspace({ initial: conversation, next: toConcept });
    expect(chips(html)).toHaveLength(1);
    expect(chips(html)[0]).toContain("Next: Concept →");
    expect(text(html).indexOf("Next: Concept →")).toBeGreaterThan(text(html).indexOf("Which would you take?"));
  });

  it("stands under a step divider that ends the thread, but never under the Learner's own message or in an empty thread", () => {
    const divider: Line = { role: "item", kind: "step", data: { step: "concept", number: 5, label: "Step 5 of 9 · Concept" } };
    expect(chips(workspace({ initial: [...conversation, divider], next: toConcept }))).toHaveLength(1);
    expect(chips(workspace({ initial: [...conversation, { role: "user", text: "Wait" }], next: toConcept }))).toHaveLength(0);
    expect(chips(workspace({ initial: [], next: toConcept }))).toHaveLength(0);
  });

  it("does not stand under the Topic Start card alone, while the Tutor's opener starts by itself", () => {
    const start = topicStart(loadCourseMap(), { currentTopicId: null, topics: {} }, "present-value")!;
    expect(chips(workspace({ initial: [{ role: "item", ...start }], next: { ...toConcept, step: "story", label: "Next: Story", advances: false } }))).toHaveLength(0);
  });

  it("is not there while a Check is open (the Course Navigator offers none)", () => {
    const html = workspace({ initial: conversation, next: null, quiz });
    expect(chips(html)).toHaveLength(0);
    expect(html).toContain("Quiz open. Stuck? Ask the Tutor: it can explain with other numbers.");
  });

  it("reads Just tell me at an unsettled Explore, and Complete this Topic at the Principle", () => {
    expect(chips(workspace({ initial: conversation, next: { kind: "just_tell_me", label: "Just tell me" } }))[0]).toContain("Just tell me →");
    expect(chips(workspace({ initial: conversation, next: { kind: "complete", label: "Complete this Topic" } }))[0]).toContain("Complete this Topic →");
  });

  it("is not offered on a passed Topic kept on screen", () => {
    expect(chips(workspace({ initial: conversation, next: toConcept, passed: { title: "Present value", next: null } }))).toHaveLength(0);
  });
});

describe("the help chips", () => {
  const conversation: Line[] = [
    { role: "user", text: "Hi" },
    { role: "assistant", text: "Once, a lottery winner had a choice." },
    { role: "user", text: "Go on." },
    { role: "assistant", text: "Which would you take?" },
  ];
  const toConcept = { kind: "next", step: "concept", label: "Next: Concept", advances: true } as const;
  const help = (html: string) => html.match(/<button[^>]*data-testid="help-chip"[^>]*>[^<]*<\/button>/g) ?? [];

  it("offers Go deeper and Show me in a widget beside Next, under the latest Tutor reply only", () => {
    const html = workspace({ initial: conversation, next: toConcept });
    expect(help(html).map((b) => b.replace(/<[^>]+>/g, ""))).toEqual(["Go deeper", "Show me in a widget"]);
    const plain = text(html);
    expect(plain.indexOf("Go deeper")).toBeGreaterThan(plain.indexOf("Which would you take?"));
    expect(plain.indexOf("Go deeper")).toBeGreaterThan(plain.indexOf("Next: Concept →"));
    expect(help(workspace({ initial: [...conversation, { role: "user", text: "Wait" }], next: toConcept }))).toHaveLength(0);
    expect(help(workspace({ initial: [], next: toConcept }))).toHaveLength(0);
  });

  it("stay while a quiz Check is open, with no Next", () => {
    const html = workspace({ initial: conversation, next: null, quiz });
    expect(help(html)).toHaveLength(2);
    expect(html).not.toContain('data-testid="next-chip"');
  });

  it("stay while a conversation Check is open, with no Next", () => {
    const html = workspace({ initial: conversation, next: null });
    expect(help(html)).toHaveLength(2);
    expect(html).not.toContain('data-testid="next-chip"');
  });

  it("are not offered on a passed Topic kept on screen", () => {
    expect(help(workspace({ initial: conversation, next: toConcept, passed: { title: "Present value", next: null } }))).toHaveLength(0);
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

  it("is read-only and shows Passed ✓ instead of Resume", () => {
    const html = text(workspace({ initial, passed: passedTopic }));
    expect(html).toContain("Passed ✓");
    expect(html).not.toContain("Resume");
  });
});

describe("the Topic complete card", () => {
  const closing: Line[] = [
    { role: "user", text: "So money today is worth more." },
    { role: "assistant", text: "Exactly. That closes the Topic." },
  ];
  const principle = "An advertised total that adds up payments made at different times overstates their value.";
  const complete = (next: string | null): Line => ({ role: "item", kind: "topic_complete", data: { topicId: "present-value", title: "Present value", principle, next } });
  const cardOf = (html: string) => html.match(/<section[^>]*data-testid="topic-complete-card"[^>]*>.*?<\/section>/)?.[0] ?? "";

  it("ends the conversation with the principle, Saved to your Notes ✓, Next Topic and the Course Map", () => {
    const html = workspace({ initial: [...closing, complete("Next Topic: Bond prices")], passed: { title: "Present value", next: "Next Topic: Bond prices" } });
    const card = cardOf(html);
    expect(text(card)).toContain("Topic complete");
    expect(text(card)).toContain(principle);
    expect(text(card)).toContain("Saved to your Notes ✓");
    expect(card).toMatch(/<button[^>]*data-what-comes-next[^>]*>Next Topic: Bond prices →<\/button>/);
    expect(card).toMatch(/<a[^>]*href="\/course"[^>]*>Course Map<\/a>/);
    expect(html.indexOf("topic-complete-card")).toBeGreaterThan(html.indexOf("That closes the Topic."));
    // The card carries the buttons: they are not repeated under the thread, and there is no message box or chip.
    expect(html.match(/data-what-comes-next/g)).toHaveLength(1);
    expect(html.match(/href="\/course"/g)).toHaveLength(1);
    expect(html).not.toContain('placeholder="Ask the Tutor"');
    expect(html).not.toContain('data-testid="next-chip"');
  });

  it("names a Due Check: New in <Topic>: Check N →, or New in <Topic>: Explore →", () => {
    expect(cardOf(workspace({ initial: [...closing, complete("New in Percent: Check 3")] }))).toMatch(/<button[^>]*data-what-comes-next[^>]*>New in Percent: Check 3 →<\/button>/);
    expect(cardOf(workspace({ initial: [...closing, complete("New in Present value: Explore")] }))).toMatch(/<button[^>]*data-what-comes-next[^>]*>New in Present value: Explore →<\/button>/);
  });

  it("with every Topic passed, offers only the Course Map", () => {
    const card = cardOf(workspace({ initial: [...closing, complete(null)] }));
    expect(card).not.toContain("data-what-comes-next");
    expect(card).toMatch(/<a[^>]*href="\/course"[^>]*>Course Map<\/a>/);
  });
});

describe("coming back to a Topic", () => {
  const initial: Line[] = [
    { role: "user", text: "Why is money today worth more?" },
    { role: "assistant", text: "Because it can earn interest." },
  ];

  it("draws Picking up where you left off as a centred divider after the last reply, with the Next chip under it and the message box ready", () => {
    const label = "Picking up where you left off · Step 6 of 10 · Concept";
    const next = { kind: "next", step: "your_turn", label: "Next: Your turn", advances: true } as const;
    const html = workspace({ initial: [...initial, { role: "item", kind: "picking_up", data: { step: "concept", number: 6, label } }], next });
    const divider = html.match(/<div[^>]*data-testid="picking-up-divider"[^>]*>.*?<\/div>/)?.[0];
    expect(divider).toContain('role="separator"');
    expect(divider).toContain(label);
    expect(html.indexOf(label)).toBeGreaterThan(html.indexOf("Because it can earn interest."));
    // One Next chip follows the divider, beside the two help chips.
    const chips = html.match(/<button[^>]*data-testid="next-chip"[^>]*>[^<]*<\/button>/g) ?? [];
    expect(chips).toHaveLength(1);
    expect(chips[0]).toContain("Next: Your turn →");
    expect(html.indexOf('data-testid="next-chip"')).toBeGreaterThan(html.indexOf(label));
    expect(html.match(/data-testid="help-chip"/g)).toHaveLength(2);
    expect(html).toContain('placeholder="Ask the Tutor"');
  });

  it("draws a Due Check's New Check divider, and New step · Explore", () => {
    const check = workspace({ initial: [...initial, { role: "item", kind: "due_check", data: { keys: ["pv-new"], label: "New Check · Check 3" } }] });
    expect(check).toMatch(/<div[^>]*data-testid="due-check-divider"[^>]*>.*?New Check · Check 3.*?<\/div>/);
    const explore = workspace({ initial: [...initial, { role: "item", kind: "due_check", data: { keys: ["explore"], label: "New step · Explore" } }] });
    expect(text(explore)).toContain("New step · Explore");
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

  it("caps what stands above the Widget panel (Topic bar, Review) and scrolls it inside itself, so the Widget panel keeps its height", () => {
    const html = workspace({ review });
    const above = tag(html, "above-widgets");
    expect(above).toMatch(/\bmax-h-/);
    expect(above).toMatch(/\boverflow-y-auto\b/);
    const inside = html.slice(html.indexOf('data-testid="above-widgets"'), html.indexOf('data-testid="widget-pane"'));
    expect(text(inside)).toContain("Spaced review · 2 due");
    expect(inside).toContain('data-testid="topic-bar"');
  });
});

describe("a quiz Check in the right panel", () => {
  const pane = (html: string) => html.slice(html.indexOf('data-testid="widget-pane"'));

  it("opens as a tab named Check k of N, selected automatically, showing the questions", () => {
    const html = pane(workspace({ quiz }));
    expect(html).toMatch(/aria-selected="true"[^>]*data-testid="check-tab"/);
    expect(text(html)).toContain("How many basis points?");
    expect(text(html)).toContain("Submit answers");
  });

  it("stays the selected tab when the Tutor has drawn Widgets, which keep their own tabs", () => {
    const initial: Line[] = [{ role: "assistant", text: fence(ANNUITY) }];
    const html = pane(workspace({ quiz, initial }));
    expect(html).toMatch(/aria-selected="true"[^>]*data-testid="check-tab"/);
    expect(html).toMatch(/<li[^>]*aria-selected="false"[^>]*>.*?What the annuity is worth today/);
    expect(text(html)).toContain("How many basis points?");
    expect(text(html)).not.toContain("Discount rate");
  });

  it("puts the quiz rule above the message box while the quiz is open, and the box stays usable", () => {
    const note = "Quiz open. Stuck? Ask the Tutor: it can explain with other numbers.";
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

describe("Check results in the conversation", () => {
  const conversation: Line[] = [
    { role: "user", text: "Ready." },
    { role: "assistant", text: "Your quiz is on the right, in the Check tab." },
  ];
  const card = (label: string, passed: boolean, check = 1): Line => ({ role: "item", kind: "check_result", data: { check, passed, label } });
  const cards = (html: string) => html.match(/<[^>]*data-testid="check-result-card"[^>]*>.*?<\/div>/g) ?? [];
  const toConcept = { kind: "next", step: "concept", label: "Next: Concept", advances: false } as const;
  const chips = (html: string) => html.match(/<button[^>]*data-testid="next-chip"[^>]*>[^<]*<\/button>/g) ?? [];
  /** The words as read: markup gone, apostrophes unescaped. */
  const words = (html = "") => text(html).replace(/&#x27;/g, "'");

  it("draws a passed quiz's card after the reply, with the Next chip under it naming the step not yet begun", () => {
    const html = workspace({ initial: [...conversation, card("2 of 3 — passed ✓ · let's look at question 3", true)], next: toConcept });
    expect(cards(html)).toHaveLength(1);
    expect(words(cards(html)[0])).toContain("2 of 3 — passed ✓ · let's look at question 3");
    // A card, not a message: no Tutor label or bubble of its own.
    expect(html.match(/data-testid="tutor-label"/g)).toHaveLength(1);
    expect(html.indexOf("2 of 3 — passed ✓")).toBeGreaterThan(html.indexOf("Your quiz is on the right"));
    expect(chips(html)).toHaveLength(1);
    expect(chips(html)[0]).toContain("Next: Concept →");
    expect(html.indexOf('data-testid="next-chip"')).toBeGreaterThan(html.indexOf("2 of 3 — passed ✓"));
  });

  it("draws a missed quiz's card, then the Tutor's follow-up with no Learner bubble, and no Next", () => {
    const initial: Line[] = [...conversation, card("1 of 3 — not passed yet · let's look at question 2", false), { role: "assistant", text: "Let's look at question 2." }];
    const html = workspace({ initial, next: null });
    expect(words(cards(html)[0])).toContain("1 of 3 — not passed yet · let's look at question 2");
    expect(html.indexOf("not passed yet")).toBeLessThan(html.indexOf("look at question 2."));
    expect(html.match(/bg-\[var\(--bubble\)\]/g)).toHaveLength(1);
    expect(chips(html)).toHaveLength(0);
  });

  it("draws a conversation Check's card: Check k — passed ✓, or Check k — not passed yet", () => {
    expect(words(cards(workspace({ initial: [...conversation, card("Check 2 — passed ✓", true, 2)] }))[0])).toContain("Check 2 — passed ✓");
    expect(words(cards(workspace({ initial: [...conversation, card("Check 2 — not passed yet", false, 2)] }))[0])).toContain("Check 2 — not passed yet");
  });

  it("after a miss, the Check tab shows the marking and Try Check k again →, with no questions to answer and no quiz note", () => {
    const missed = {
      attemptId: 1,
      checkId: "c",
      checkNumber: 1,
      checkCount: 2,
      attemptNo: 0,
      result: {
        correctCount: 0,
        shown: 1,
        needed: 1,
        passed: false,
        questions: [{ id: "q", prompt: "How many basis points?", choices, chosen: "b", answer: "a", correct: false, explanation: "One percent is 100 basis points.", verified: true }],
      },
    };
    const html = workspace({ initial: conversation, missed });
    const pane = html.slice(html.indexOf('data-testid="widget-pane"'));
    expect(pane).toMatch(/aria-selected="true"[^>]*data-testid="check-tab"/);
    expect(text(pane)).toContain("Your answer: Zero point two five");
    expect(text(pane)).toContain("Try Check 1 again →");
    expect(text(pane)).not.toContain("Submit answers");
    expect(text(html)).not.toContain("Quiz open.");
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
    expect([...row.matchAll(/<span class="block truncate">([^<]*)<\/span>/g)].map((m) => m[1])).toEqual(["Pick a rate", "What a home loan costs"]);
    // The newest drawing shows, in the updated Widget's tab.
    expect(text(panel)).toContain("Loan rate");
    expect(text(panel)).not.toContain("Discount rate");
    // Both replies' chips open the one Widget.
    const chat = text(html.slice(0, html.indexOf('data-testid="widget-pane"')));
    expect(chat.match(/Pick a rate/g)).toHaveLength(2);
  });

  it("shows a chip per Widget title only once there are two or more", () => {
    const two = text(renderToStaticMarkup(<WidgetPanel widgets={items} shown={items[1]} onPick={() => {}} />));
    expect(two).toContain("Long-term interest rates");
    expect(two).toContain("What the annuity is worth today");
    const one = renderToStaticMarkup(<WidgetPanel widgets={[items[1]]} shown={items[1]} onPick={() => {}} />);
    expect(one).not.toContain("Widgets in this Session");
    expect(text(one)).not.toContain("Long-term interest rates");
  });

  it("pages through its Widgets with a header (3 of 11 · title) instead of a strip of tabs, the long title shortened", () => {
    const long = `root = Widget("A very long title for a Widget that would never fit on one tab in the right panel", [history])
history = HistoryChart("mega-millions-2018/treasury-30-year")`;
    const many: WidgetItem[] = [...items, ...[3, 4, 5, 6].map((n) => ({ key: `m:${n}`, number: n, code: n === 6 ? long : CALC, complete: true }))];
    const html = renderToStaticMarkup(<WidgetPanel widgets={many} shown={many[0]} onPick={() => {}} />);
    const row = html.match(/<div[^>]*aria-label="Widgets in this Session"[^>]*>/)?.[0] ?? "";
    expect(row).not.toMatch(/\boverflow-x-auto\b/);
    expect(html).not.toMatch(/\bflex-nowrap\b/);
    expect(text(html)).toContain("1 of 6 · Long-term interest rates");
    const position = html.match(/<p[^>]*data-testid="pager-position"[^>]*>/)?.[0] ?? "";
    expect(position).toMatch(/\btruncate\b/);
    // The long title is in the All menu, cut short there too, with its full text on hover in the header when it is the current one.
    expect(html).toMatch(/<span class="block truncate">A very long title for a Widget/);
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

describe("Tell the Tutor what I found", () => {
  const TASKS = `root = Widget("Rates", [rate, steps])
$rate = 5
rate = Slider("rate", "Interest rate", 0, 10, 0.01, $rate, "percent")
steps = GuidedTasks([t1, t2])
t1 = GuidedTask("Set the rate to 3%", $rate == 3)
t2 = GuidedTask("Set the rate to 8%", $rate == 8)`;
  const initial: Line[] = [
    { role: "user", text: "Show me" },
    { role: "assistant", text: fence(TASKS) },
  ];
  const BUTTON = "Tell the Tutor what I found →";
  const allTicked = { Rates: { values: { $rate: 8 }, ticked: ["Set the rate to 3%", "Set the rate to 8%"] } };

  it("is hidden under a Widget with a Guided Task not yet ticked", () => {
    const html = workspace({ initial, shown: { sessionId: 7 }, widgetStates: { Rates: { values: { $rate: 3 }, ticked: ["Set the rate to 3%"] } } });
    expect(text(html)).toContain("Set the rate to 8%");
    expect(text(html)).not.toContain(BUTTON);
  });

  it("shows under the Widget once all its Guided Tasks are ticked", () => {
    const html = workspace({ initial, shown: { sessionId: 7 }, widgetStates: allTicked });
    expect(text(html)).toContain(BUTTON);
  });

  it("is not offered on a passed Topic's page, which sends no turns", () => {
    const html = workspace({ initial, shown: { sessionId: 7 }, passed: { title: "Present value", next: null }, widgetStates: allTicked });
    expect(text(html)).not.toContain(BUTTON);
  });
});

describe("the Topic bar", () => {
  const map = loadCourseMap();
  // Present value at Explore: Story, Check 1 (concept, your turn, Check) passed, Check 2's concept done.
  const atExplore: Progress = {
    currentTopicId: "present-value",
    topics: { "present-value": { step: "explore", passedChecks: ["pv-quiz-discounting"], revealShown: false, status: "in_progress" } },
  };
  const strip = stepSequence(map, atExplore, "present-value");
  const bar = (html: string) => html.match(/<nav[^>]*data-testid="topic-bar"[^>]*>.*?<\/nav>/)?.[0] ?? "";
  const groups = (html: string) => (bar(html).match(/<li[^>]*data-strip-group[^>]*>.*?<\/ol><\/li>/g) ?? []).map((g) => text(g).trim());

  it("replaces the status card: a slim bar with the Topic title stands at the top of the right column, with no summary", () => {
    const html = workspace({ strip });
    const above = html.slice(html.indexOf('data-testid="above-widgets"'), html.indexOf('data-testid="widget-pane"'));
    expect(above).toContain('data-testid="topic-bar"');
    expect(text(bar(html))).toContain("Present value");
    expect(html).not.toContain('aria-label="Where you stand"');
    expect(text(html)).not.toContain("Course Map · Foundation");
    expect(text(html)).not.toMatch(/Continue/);
  });

  it("stands in the right column, not the chat column, and the chat column starts with the thread", () => {
    const html = workspace({ strip });
    const frame = html.slice(html.indexOf('data-testid="workspace-frame"'));
    const right = frame.indexOf('data-testid="above-widgets"');
    const chat = frame.slice(0, right);
    expect(chat).toContain('data-testid="thread-viewport"');
    expect(chat).not.toContain('data-testid="topic-bar"');
    expect(frame.slice(right)).toContain('data-testid="topic-bar"');
    // The bar comes before the Widget panel in the right column, and after the chat in tab order.
    expect(frame.indexOf('data-testid="topic-bar"')).toBeLessThan(frame.indexOf('data-testid="widget-pane"'));
  });

  it("groups the Course Navigator's plain step names by Check", () => {
    expect(groups(workspace({ strip }))).toEqual([
      "Story",
      "Check 1: Concept Your turn Check",
      "Check 2: Concept Explore Your turn Check",
      "Reveal",
      "Principle",
    ]);
  });

  it("highlights the current step", () => {
    const current = bar(workspace({ strip })).match(/<[^>]*aria-current="step"[^>]*>[^<]*</g) ?? [];
    expect(current).toHaveLength(1);
    expect(current[0]).toContain("Explore");
    expect(current[0]).toContain('data-step-number="6"');
  });

  it("makes finished steps scroll the chat back to their divider; the Story goes to the Topic Start card", () => {
    const initial: Line[] = [
      { role: "assistant", text: "Once, a lottery winner had a choice." },
      { role: "item", kind: "step", data: { step: "concept", number: 2, label: "Step 2 of 10 · Concept" } },
      { role: "assistant", text: "Money today is worth more." },
      { role: "item", kind: "step", data: { step: "concept", number: 5, label: "Step 5 of 10 · Concept" } },
      { role: "assistant", text: "Now the jackpot." },
    ];
    const html = workspace({ strip, initial });
    const buttons = bar(html).match(/<button[^>]*data-scroll-to="[^"]*"[^>]*>[^<]*<\/button>/g) ?? [];
    expect(buttons.map((b) => b.match(/data-scroll-to="([^"]*)"/)![1])).toEqual(["topic-start", "step-2", "step-5"]);
    // Each target is in the thread: the dividers carry their step's anchor.
    expect(html).toMatch(/<div[^>]*id="step-2"[^>]*data-testid="step-divider"/);
    expect(html).toMatch(/<div[^>]*id="step-5"[^>]*data-testid="step-divider"/);
    // A finished step with no divider in this Session (steps 3 and 4), the current one and those ahead are not buttons.
    expect(bar(html)).not.toMatch(/<button[^>]*data-step-number="(3|4|6|7|8|9|10)"/);
  });

  it("is not drawn with no Topic", () => {
    expect(workspace({ place: null, strip: null })).not.toContain('data-testid="topic-bar"');
  });
});

describe("the Topic Start card", () => {
  const map = loadCourseMap();
  const fresh: Progress = { currentTopicId: null, topics: {} };
  const card = (topicId: string, progress: Progress = fresh) => {
    const item = topicStart(map, progress, topicId);
    if (!item) throw new Error(`no card for ${topicId}`);
    return workspace({ initial: [{ role: "item", ...item }] });
  };
  const startCard = (html: string) => html.match(/<section[^>]*data-testid="topic-start"[^>]*>.*?<\/section>/)?.[0] ?? "";

  it("opens a new Session's conversation with the title, the Subject, You'll learn and the number of Checks", () => {
    const html = card("present-value");
    const shown = text(startCard(html));
    expect(shown).toContain("Present value");
    expect(shown).toContain("Numbers &amp; time value");
    expect(shown).toContain("You’ll learn");
    expect(shown).toContain("See why money later is worth less than money now.");
    expect(shown).toContain("Find the interest rate at which two offers are worth the same.");
    expect(shown).toContain("2 Checks");
    // The card is the conversation's first item, scrolling with the chat, not something above it.
    const thread = html.slice(html.indexOf('data-testid="thread-viewport"'));
    expect(thread).toContain('data-testid="topic-start"');
  });

  it("lists each prerequisite as not passed yet with Study it first, which opens that Topic", () => {
    const shown = startCard(card("present-value"));
    expect(text(shown)).toContain("Before this");
    expect(text(shown)).toContain("Growth, compounding and logs");
    expect(text(shown)).toContain("not passed yet · Study it first");
    expect(shown).toMatch(/<a[^>]*data-jump="num-compounding"[^>]*>Study it first<\/a>/);
  });

  it("marks a passed prerequisite ✓ passed, with no Study it first", () => {
    const progress: Progress = { currentTopicId: null, topics: { "num-compounding": { step: "principle", passedChecks: [], revealShown: true, status: "passed" } } };
    const shown = text(startCard(card("present-value", progress)));
    expect(shown).toContain("Growth, compounding and logs ✓ passed");
    expect(shown).not.toContain("Study it first");
  });

  it("says a starting Topic needs nothing first, and leaves out You'll use when the Topic has no written-ahead Widgets", () => {
    const shown = text(startCard(card("num-percent-bps")));
    expect(shown).toContain("Nothing — this is a starting Topic.");
    expect(text(startCard(card("bond-pricing")))).not.toContain("You’ll use");
  });

  it("lists You'll use with the Topic's written-ahead Widget titles", () => {
    expect(text(startCard(card("num-percent-bps")))).not.toContain("You’ll use");
    expect(text(startCard(card("present-value")))).toContain("You’ll use: What the annuity is worth today");
  });

  it("names the Stage of a Topic with no Subject", () => {
    const later = map.topics.find((t) => t.stage === "follow")!;
    const shown = text(startCard(card(later.id)));
    expect(shown).toContain("Follow");
  });
});
