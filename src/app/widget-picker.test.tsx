// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenQuiz } from "@/learner/quiz";
import type { ThreadLine } from "./thread";
import { useWidgetHost, WidgetHost, type WidgetHostState } from "./widget-host";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

// What the Widget panel shows, through the real picker (useWidgetHost): the newest Widget, a new turn sending the panel
// back to it, a Widget drawn again in place, the Check tab, and a press on what is already showing.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fence = (title: string, label = `${title} rate`) =>
  ["```openui-lang", `root = Widget("${title}", [rate])`, "$rate = 5", `rate = Slider("rate", "${label}", 0, 10, 0.25, $rate, "percent")`, "```"].join("\n");
const reply = (id: string, title: string, label?: string): ThreadLine => ({ id, role: "assistant", text: `Here.\n\n${fence(title, label)}` });
const quiz: OpenQuiz = { attemptId: 1, checkId: "c", checkNumber: 1, checkCount: 2, attemptNo: 0, questions: [{ id: "q", prompt: "How many basis points?", choices: [{ id: "a", text: "Twenty-five" }] }] };

let root: Root;
let el: HTMLElement;
let host!: WidgetHostState;
const hold = (state: WidgetHostState) => {
  host = state;
};

/** The workspace's two halves: a chip per reply (where its Widget belongs), and the panel. */
function Page({ messages, quiz = null }: { messages: ThreadLine[]; quiz?: OpenQuiz | null }) {
  const state = useWidgetHost({ messages, running: false, explore: null, quiz });
  useEffect(() => hold(state));
  return (
    <>
      <div data-testid="chat">
        {messages.flatMap((m) => (m.role === "assistant" ? [<div key={m.id} data-reply={m.id}>{state.slot({ messageId: m.id, index: 0, code: "", complete: true })}</div>] : []))}
      </div>
      <aside data-testid="pane">
        <WidgetHost host={state} />
      </aside>
    </>
  );
}

beforeEach(() => {
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

const render = async (messages: ThreadLine[], q: OpenQuiz | null = null) => act(async () => root.render(<Page messages={messages} quiz={q} />));
const card = () => el.querySelector('[data-testid="widget-card"]')?.textContent ?? "";
const chip = (reply: string) => el.querySelector<HTMLElement>(`[data-reply="${reply}"] [data-testid="widget-chip"]`)!;
const showing = () => [...el.querySelectorAll<HTMLElement>('[data-testid="widget-chip"][data-state="showing"]')].map((c) => c.closest<HTMLElement>("[data-reply]")?.dataset.reply);
const current = () => el.querySelector('[data-testid="widget-filmstrip"] [aria-current="true"]')?.getAttribute("title");
const backToLatest = () => el.querySelector<HTMLElement>('[data-testid="back-to-latest"]');
const click = async (node: HTMLElement) => act(async () => node.click());

describe("what the Widget panel shows, through the real picker", () => {
  const two: ThreadLine[] = [{ id: "u1", role: "user", text: "Show me" }, reply("a1", "Alpha"), reply("a2", "Beta")];

  it("shows the newest Widget, and a new turn sends the panel back to the newest after the Learner picked an older one", async () => {
    await render(two);
    expect(card()).toContain("Beta rate");
    expect(showing()).toEqual(["a2"]);

    await click(chip("a1"));
    expect(card()).toContain("Alpha rate");
    expect(showing()).toEqual(["a1"]);
    expect(backToLatest()).not.toBeNull();

    // As each turn starts (onTurnStart), the pick is forgotten; the turn's reply brings a newer Widget, which shows.
    await act(async () => host.showNewest());
    await render([...two, { id: "u2", role: "user", text: "And another" }, reply("a3", "Gamma")]);
    expect(card()).toContain("Gamma rate");
    expect(showing()).toEqual(["a3"]);
    expect(current()).toBe("Gamma");
    expect(backToLatest()).toBeNull();
  });

  it("a new turn with no new Widget goes back to the newest one too", async () => {
    await render(two);
    await click(chip("a1"));
    await act(async () => host.showNewest());
    expect(card()).toContain("Beta rate");
    expect(showing()).toEqual(["a2"]);
  });

  it("shows a Widget drawn again in place in its first tab, as the newest: both its chips say Showing, and Back to latest returns to it", async () => {
    const lines: ThreadLine[] = [...two, reply("a3", "Alpha", "Alpha again rate")];
    await render(lines);
    expect(card()).toContain("Alpha again rate");
    expect(card()).not.toContain("Beta rate");
    expect(current()).toBe("Alpha");
    expect(showing()).toEqual(["a1", "a3"]);
    expect(host.picker.newestKey).toBe("a3:0");
    expect(backToLatest()).toBeNull();

    await click(chip("a2"));
    expect(card()).toContain("Beta rate");
    await click(backToLatest()!);
    expect(card()).toContain("Alpha again rate");
    expect(current()).toBe("Alpha");
  });

  it("shows the open quiz's Check, with no chip Showing, until the Learner picks a Widget; a new turn goes back to the Check", async () => {
    await render(two, quiz);
    const check = el.querySelector<HTMLElement>('[data-testid="check-card"]')!;
    expect(check.hidden).toBe(false);
    expect(card()).toBe("");
    expect(el.querySelector('[data-testid="check-tab"]')?.getAttribute("aria-current")).toBe("true");
    expect(showing()).toEqual([]);
    // The Check is not a Widget, so Back to latest does not show over it.
    expect(backToLatest()).toBeNull();

    await click(chip("a1"));
    expect(check.hidden).toBe(true);
    expect(card()).toContain("Alpha rate");
    expect(showing()).toEqual(["a1"]);

    await act(async () => host.showNewest());
    expect(check.hidden).toBe(false);
    expect(showing()).toEqual([]);
  });

  it("scrolls the panel to the top on every press of the chip already showing, without a timer between presses", async () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    Object.defineProperty(scroller, "scrollHeight", { value: 2000 });
    Object.defineProperty(scroller, "clientHeight", { value: 500 });
    el.append(scroller);
    const inner = scroller.appendChild(document.createElement("div"));
    const r = createRoot(inner);
    try {
      await act(async () => r.render(<Page messages={two} />));
      const a2 = () => inner.querySelector<HTMLElement>('[data-reply="a2"] [data-testid="widget-chip"]')!;
      expect(a2().dataset.state).toBe("showing");
      scroller.scrollTop = 300;
      await click(a2());
      expect(scroller.scrollTop).toBe(0);
      // A second press at once counts as a switch too.
      scroller.scrollTop = 300;
      await click(a2());
      expect(scroller.scrollTop).toBe(0);
    } finally {
      act(() => r.unmount());
    }
  });
});
