import { AssistantRuntimeProvider, useExternalStoreRuntime } from "@assistant-ui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LeftColumn } from "./left-column";
import { convertMessage, type ThreadLine } from "./thread";
import type { TurnPhase, TurnStream } from "./turn-stream";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

// The message box and what shows around it while a turn runs (Seam 2: static markup from given turn state).

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

type Given = Partial<Omit<TurnStream, "runtime">>;
type Running = Extract<TurnPhase, { kind: "running" }>;
type Ended = Extract<TurnPhase, { kind: "ended" }>;

/** A turn running, as the turn stream reports it. */
const running = (change: Partial<Running> = {}): TurnPhase => ({ kind: "running", waiting: null, progress: null, stopping: false, notice: null, error: null, ...change });
/** A turn that has ended, with what it left on screen. */
const ended = (change: Partial<Ended> = {}): TurnPhase => ({ kind: "ended", notice: null, error: null, retry: false, cutShort: false, ...change });

function Column({ given }: { given: Given }) {
  const messages: ThreadLine[] = given.messages ?? [];
  const phase: TurnPhase = given.phase ?? { kind: "opened", notice: null, error: null, retry: false };
  const runtime = useExternalStoreRuntime({ messages, isRunning: phase.kind === "running", convertMessage, onNew: async () => {} });
  const turn: TurnStream = {
    messages,
    phase,
    refreshing: false,
    stop: () => {},
    passage: null,
    setPassage: () => {},
    send: async () => {},
    sendWhenIdle: () => {},
    sendIfIdle: () => {},
    retry: () => {},
    appendItem: () => {},
    ...given,
    runtime,
  };
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <LeftColumn turn={turn} slot={() => null} quizOpen={false} next={NEXT} />
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
    expect(chip(column({ messages: replied, phase: running() }))).toBe(false);
    expect(chip(column({ messages: replied, refreshing: true }))).toBe(false);
    expect(chip(column({ messages: replied, phase: ended({ retry: true, error: "The Tutor could not answer (500)." }) }))).toBe(false);
  });
});

describe("a reply cut off at its length limit", () => {
  const cut: ThreadLine[] = [
    { id: "u", role: "user", text: "Why discount?" },
    { id: "a", role: "assistant", text: "A rupee today is worth" },
  ];

  it("offers Finish this reply, and the word Continue appears nowhere", () => {
    const html = column({ messages: cut, phase: ended({ cutShort: true }) });
    expect(text(html)).toContain("The reply was cut short.");
    expect(html).toMatch(/<button[^>]*data-testid="finish-reply"[^>]*>Finish this reply<\/button>/);
    expect(html).not.toMatch(/Continue/);
  });

  it("offers nothing to finish while the turn runs", () => {
    expect(column({ messages: cut, phase: running() })).not.toContain("finish-reply");
  });
});

describe("the writing indicator", () => {
  it("says the Tutor is writing from Send until the first words arrive", () => {
    const html = column({ phase: running({ waiting: "writing" }) });
    expect(html).toMatch(/data-testid="writing-indicator"[^>]*>Tutor is writing…</);
  });

  it("says it is still working once the wait passes 8 seconds", () => {
    const html = column({ phase: running({ waiting: "slow" }) });
    expect(html).toMatch(/data-testid="writing-indicator"[^>]*>Still working on it…</);
    expect(text(html)).not.toContain("Tutor is writing");
  });

  it("is gone once the reply streams in, and when no turn runs", () => {
    const streaming = column({
      phase: running(),
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
  it("keeps the message box editable while a turn runs, with Send turned into Stop", () => {
    const html = column({ phase: running({ waiting: "writing" }) });
    expect(messageBox(html)).not.toBe("");
    expect(messageBox(html)).not.toContain("disabled");
    expect(sendButtons(html)).toHaveLength(0);
    expect(html).toContain('data-testid="stop-reply"');
  });

  it("keeps Send off while the box is empty", () => {
    expect(sendButtons(column())[0]).toContain('disabled=""');
  });
});

describe("Attach a passage", () => {
  it("sits beside the message box, and there is only one Send on screen", () => {
    const html = column();
    expect(html).toContain('aria-label="Attach a passage"');
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
    expect(html).toContain('aria-label="Remove passage"');
    // A single input of its own: the app's text field (a strong edge, the accent and halo on focus).
    expect(html).toMatch(/<textarea[^>]*aria-label="Passage to attach"[^>]*class="field\b/);
    expect(sendButtons(html)).toHaveLength(1);
  });

  it("shows a sent passage in the thread as its short label", () => {
    const html = column({
      messages: [{ id: "u", role: "user", text: 'What does this show?\n\n(Pasted passage, 8 words: "Pets.com raised $82.5 million in its …")' }],
    });
    expect(text(html)).toContain("(Pasted passage, 8 words:");
  });
});

describe("the composer: one field with Attach and Send inside", () => {
  const tag = (html: string, re: RegExp) => html.match(re)?.[0] ?? "";
  const form = (html: string) => tag(html, /<form[^>]*>/);

  it("is one .field-shell around a bare message box: Attach on the left, then the message box, then Send", () => {
    const html = column();
    const shell = form(html);
    expect(shell).toMatch(/class="[^"]*\bfield-shell\b/);
    // 1 + 5 + 32 + 5 + 1 = 44px: the controls sit 5px inside the edge, at the bottom as the box grows.
    expect(shell).toContain("p-[5px]");
    expect(shell).toContain("items-end");
    expect(shell).not.toContain("composer-field");
    const inside = html.slice(html.indexOf("<form"), html.indexOf("</form>"));
    const attach = inside.indexOf('aria-label="Attach a passage"');
    const box = inside.indexOf('aria-label="Message"');
    const send = inside.indexOf(">Send</button>");
    expect(attach).toBeGreaterThan(-1);
    expect(attach).toBeLessThan(box);
    expect(box).toBeLessThan(send);
    const textarea = tag(html, /<textarea[^>]*aria-label="Message"[^>]*>/);
    expect(textarea).toMatch(/class="[^"]*\bfield-bare\b/);
    expect(textarea).toContain("text-[length:var(--text-chat)]");
    expect(textarea).toContain("leading-[var(--lh-chat)]");
    // The halo is the field's, not a ring of the box's own.
    expect(textarea).not.toMatch(/ring-|rounded|border-\[/);
  });

  it("draws Attach as a 32px icon button with its name and tooltip, a toggle, and no words", () => {
    for (const [passage, name, pressed] of [[null, "Attach a passage", "false"], ["", "Remove passage", "true"]] as const) {
      const html = column({ passage });
      const button = tag(html, new RegExp(`<button[^>]*aria-label="${name}"[^>]*>.*?</button>`));
      expect(button).toContain('data-affordance="icon"');
      expect(button).toContain(`title="${name}"`);
      expect(button).toContain(`aria-pressed="${pressed}"`);
      expect(button).toMatch(/class="btn btn-icon\b[^"]*\bshrink-0\b/);
      expect(text(button).trim()).toBe("");
      expect(button).toMatch(/<svg[^>]*aria-hidden="true"[^>]*viewBox="0 0 24 24"/);
    }
  });

  it("draws an empty box's Send as the small primary, off, with its reason as the tooltip", () => {
    const send = tag(column(), /<button[^>]*>Send<\/button>/);
    for (const cls of ["btn-primary", "btn-sm", "shrink-0", "whitespace-nowrap"]) expect(send).toContain(cls);
    expect(send).toContain('disabled=""');
    expect(send).toContain('title="Type a message to send"');
  });

  it("keeps Stop small, inside the field, on one line and unshrunk", () => {
    const html = column({ phase: running() });
    const stop = tag(html, /<button[^>]*data-testid="stop-reply"[^>]*>/);
    for (const cls of ["btn-secondary", "btn-sm", "shrink-0", "whitespace-nowrap"]) expect(stop).toContain(cls);
    expect(html.indexOf('data-testid="stop-reply"')).toBeLessThan(html.indexOf("</form>"));
  });

  it("lets the message box shrink instead of pushing the buttons", () => {
    expect(tag(column(), /<textarea[^>]*aria-label="Message"[^>]*>/)).toContain("min-w-0");
  });

  it("renders the message box one row high before the page wakes up (a bare textarea is two rows)", () => {
    // Auto-grow sizes the box only once the page's script runs; until then the server's markup decides its height, and
    // a textarea with no rows is two rows tall, so the row starts out twice the height of Send (CI #317, 1512×982).
    expect(tag(column(), /<textarea[^>]*aria-label="Message"[^>]*>/)).toContain('rows="1"');
  });
});
