import { AssistantRuntimeProvider, useExternalStoreRuntime } from "@assistant-ui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LeftColumn } from "./left-column";
import { convertMessage, type ThreadLine } from "./thread";
import type { TurnStream } from "./turn-stream";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

// The message box and what shows around it while a turn runs (Seam 2: static markup from given turn state).

const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

type Given = Partial<Omit<TurnStream, "runtime">>;

function Column({ given }: { given: Given }) {
  const messages: ThreadLine[] = given.messages ?? [];
  const running = given.running ?? false;
  const runtime = useExternalStoreRuntime({ messages, isRunning: running, convertMessage, onNew: async () => {} });
  const turn: TurnStream = {
    messages,
    running,
    refreshing: false,
    announcement: "",
    fixing: false,
    error: null,
    notice: null,
    canRetry: false,
    cutShort: false,
    waiting: null,
    passage: null,
    setPassage: () => {},
    send: async () => {},
    ...given,
    runtime,
  };
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <LeftColumn turn={turn} slot={() => null} place={null} review={noReview} quizOpen={false} explore={null} next={NEXT} />
    </AssistantRuntimeProvider>
  );
}

const column = (given: Given = {}) => renderToStaticMarkup(<Column given={given} />);

/** The Next on offer in every column here; whether its chip shows depends on the turn's state. */
const NEXT = { kind: "next", step: "concept", label: "Next: Concept", advances: true } as const;

describe("the Next chip and the turn's state", () => {
  const replied: ThreadLine[] = [
    { id: "u", role: "user", text: "Hi" },
    { id: "a", role: "assistant", text: "Once, a lottery winner had a choice." },
  ];
  const chip = (html: string) => html.includes('data-testid="next-chip"');

  it("shows under the finished reply once the page has re-read the Learner's place", () => {
    expect(chip(column({ messages: replied }))).toBe(true);
  });

  it("is hidden while a turn runs, until the page has the new place after it, and while Retry is offered", () => {
    expect(chip(column({ messages: replied, running: true }))).toBe(false);
    expect(chip(column({ messages: replied, refreshing: true }))).toBe(false);
    expect(chip(column({ messages: replied, canRetry: true, error: "The Tutor could not answer (500)." }))).toBe(false);
  });
});

describe("a reply cut off at its length limit", () => {
  const cut: ThreadLine[] = [
    { id: "u", role: "user", text: "Why discount?" },
    { id: "a", role: "assistant", text: "A rupee today is worth" },
  ];

  it("offers Finish this reply, and the word Continue appears nowhere", () => {
    const html = column({ messages: cut, cutShort: true });
    expect(text(html)).toContain("The reply was cut short.");
    expect(html).toMatch(/<button[^>]*data-testid="finish-reply"[^>]*>Finish this reply<\/button>/);
    expect(html).not.toMatch(/Continue/);
  });

  it("offers nothing to finish while the turn runs", () => {
    expect(column({ messages: cut, cutShort: true, running: true })).not.toContain("finish-reply");
  });
});

describe("the writing indicator", () => {
  it("says the Tutor is writing from Send until the first words arrive", () => {
    const html = column({ running: true, waiting: "writing" });
    expect(html).toMatch(/data-testid="writing-indicator"[^>]*>Tutor is writing…</);
  });

  it("says it is still working once the wait passes 8 seconds", () => {
    const html = column({ running: true, waiting: "slow" });
    expect(html).toMatch(/data-testid="writing-indicator"[^>]*>Still working on it…</);
    expect(text(html)).not.toContain("Tutor is writing");
  });

  it("is gone once the reply streams in, and when no turn runs", () => {
    const streaming = column({
      running: true,
      waiting: null,
      messages: [
        { id: "u", role: "user", text: "What is a basis point?" },
        { id: "a", role: "assistant", text: "A basis point is" },
      ],
    });
    expect(streaming).not.toContain("writing-indicator");
    expect(column()).not.toContain("writing-indicator");
  });
});

const sendButtons = (html: string) => html.match(/<button[^>]*>Send<\/button>/g) ?? [];
const messageBox = (html: string) => html.match(/<textarea[^>]*aria-label="Message"[^>]*>/)?.[0] ?? "";

describe("drafting during a turn", () => {
  it("keeps the message box editable while a turn runs, with Send off", () => {
    const html = column({ running: true, waiting: "writing" });
    expect(messageBox(html)).not.toBe("");
    expect(messageBox(html)).not.toContain("disabled");
    expect(sendButtons(html)).toHaveLength(1);
    expect(sendButtons(html)[0]).toContain('disabled=""');
  });

  it("keeps Send off while the box is empty", () => {
    expect(sendButtons(column())[0]).toContain('disabled=""');
  });
});

describe("Attach a passage", () => {
  it("sits beside the message box, and there is only one Send on screen", () => {
    const html = column();
    expect(text(html)).toContain("Attach a passage");
    expect(sendButtons(html)).toHaveLength(1);
    expect(text(html)).not.toContain("Send passage");
    expect(html).not.toContain("paste-panel");
    expect(html).not.toContain("attach-box");
  });

  it("opens a small passage box above the message box, sent by the same Send", () => {
    const html = column({ passage: "Pets.com raised $82.5 million in its IPO." });
    expect(html).toMatch(/data-testid="attach-box"/);
    expect(html).toMatch(/<textarea[^>]*aria-label="Passage to attach"[^>]*>Pets\.com raised \$82\.5 million in its IPO\.<\/textarea>/);
    expect(html.indexOf("attach-box")).toBeLessThan(html.indexOf('aria-label="Message"'));
    expect(text(html)).toContain("Remove passage");
    expect(sendButtons(html)).toHaveLength(1);
  });

  it("shows a sent passage in the thread as its short label", () => {
    const html = column({
      messages: [{ id: "u", role: "user", text: 'What does this show?\n\n(Pasted passage, 8 words: "Pets.com raised $82.5 million in its …")' }],
    });
    expect(text(html)).toContain("(Pasted passage, 8 words:");
  });
});
