// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenQuiz } from "@/learner/quiz";
import type { ThreadLine } from "./thread";
import { CHECK_VIEW, EXPLORE_KEY, REVIEW_VIEW } from "./widget-panel";
import { useWidgetHost, WidgetHost, type WidgetHostState } from "./widget-host";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

// The Widget panel's one 'what is open' state (#81): a Widget, a Check, a Review or the explore Widget opens and closes
// through it, and on a phone Back closes what is open. On a laptop (and a tablet) Back is left alone.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fence = (title: string) =>
  ["```openui-lang", `root = Widget("${title}", [rate])`, "$rate = 5", `rate = Slider("rate", "${title} rate", 0, 10, 0.25, $rate, "percent")`, "```"].join("\n");
const reply = (id: string, title: string): ThreadLine => ({ id, role: "assistant", text: `Here.\n\n${fence(title)}` });
const quiz: OpenQuiz = { attemptId: 1, checkId: "c", checkNumber: 1, checkCount: 2, attemptNo: 0, questions: [{ id: "q", prompt: "How many basis points?", choices: [{ id: "a", text: "Twenty-five" }] }] };
const two: ThreadLine[] = [{ id: "u1", role: "user", text: "Show me" }, reply("a1", "Alpha"), reply("a2", "Beta")];
const explore = { code: fence("Explore me"), id: "t1-explore" };

let root: Root;
let el: HTMLElement;
let host!: WidgetHostState;

function Page({ quiz = null, review = false }: { quiz?: OpenQuiz | null; review?: boolean }) {
  const state = useWidgetHost({ messages: two, running: false, explore, quiz, review });
  useEffect(() => {
    host = state;
  });
  return (
    <>
      <div data-testid="chat">
        {two.flatMap((m) => (m.role === "assistant" ? [<div key={m.id} data-reply={m.id}>{state.slot({ messageId: m.id, index: 0, code: "", complete: true })}</div>] : []))}
      </div>
      <WidgetHost host={state} />
    </>
  );
}

/** A screen of this width, by the matchMedia queries the screen-size rule asks. */
const screenOf = (width: number) =>
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: width >= Number(query.match(/(\d+)px/)?.[1]),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

beforeEach(() => {
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const render = async (props: { quiz?: OpenQuiz | null; review?: boolean } = {}) => act(async () => root.render(<Page {...props} />));
const chip = (reply: string) => el.querySelector<HTMLElement>(`[data-reply="${reply}"] [data-testid="widget-chip"]`)!;
const run = async (f: () => void) => act(async () => f());

describe("the panel's one 'what is open' state", () => {
  beforeEach(() => screenOf(1512));

  it("starts with nothing open, and a chip opens its Widget; close closes it and keeps what it showed", async () => {
    await render();
    expect(host.open).toBe(false);
    await run(() => chip("a1").click());
    expect(host.open).toBe(true);
    expect(host.picker.view).toBe("a1:0");
    await run(() => host.close());
    expect(host.open).toBe(false);
    expect(host.picker.view).toBe("a1:0");
  });

  it("opens the Check, a Review and the explore Widget the same way", async () => {
    await render({ quiz, review: true });
    await run(() => host.openView("a2:0"));
    expect([host.open, host.picker.view]).toEqual([true, "a2:0"]);
    await run(() => host.openView(CHECK_VIEW));
    expect(host.picker.view).toBe(CHECK_VIEW);
    expect(el.querySelector('[data-testid="check-card"]')?.hasAttribute("hidden")).toBe(false);
    await run(() => host.openView(REVIEW_VIEW));
    expect(host.picker.view).toBe(REVIEW_VIEW);
    await run(() => host.openView(EXPLORE_KEY));
    expect(host.picker.view).toBe(EXPLORE_KEY);
    await run(() => host.close());
    expect(host.open).toBe(false);
  });

  it("shows no Review when there is none to open", async () => {
    await render();
    const before = host.picker.view;
    await run(() => host.openView(REVIEW_VIEW));
    expect(host.picker.view).not.toBe(REVIEW_VIEW);
    expect(host.picker.view).toBe(before);
  });

  it("on a laptop and a tablet, opening and closing leaves Back (the browser history) alone", async () => {
    for (const width of [1512, 1024, 768]) {
      screenOf(width);
      const push = vi.spyOn(window.history, "pushState");
      const back = vi.spyOn(window.history, "back");
      await render();
      await run(() => chip("a1").click());
      await run(() => host.close());
      expect([width, push.mock.calls.length, back.mock.calls.length]).toEqual([width, 0, 0]);
      expect(host.open).toBe(false);
      vi.restoreAllMocks();
    }
  });
});

describe("on a phone, Back closes what is open", () => {
  beforeEach(() => screenOf(390));

  it("opening adds one Back step that keeps the page's own history state; Back closes the view", async () => {
    window.history.replaceState({ __next: "tree" }, "");
    const push = vi.spyOn(window.history, "pushState");
    await render();
    await run(() => chip("a1").click());
    expect(host.open).toBe(true);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toMatchObject({ __next: "tree" });
    // A second pick while open (the pager) adds no further step.
    await run(() => host.openView("a2:0"));
    expect(push).toHaveBeenCalledTimes(1);

    await run(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { __next: "tree" } })));
    expect(host.open).toBe(false);
  });

  it("closing from the panel goes Back, so the step it added is gone", async () => {
    await render();
    await run(() => chip("a1").click());
    const back = vi.spyOn(window.history, "back").mockImplementation(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await run(() => host.close());
    expect(back).toHaveBeenCalledTimes(1);
    expect(host.open).toBe(false);
  });

  it("a phone turned past the breakpoint with the view open still closes it on Back, and the step goes with it", async () => {
    window.history.replaceState({ __next: "tree" }, "");
    await render();
    await run(() => chip("a1").click());
    screenOf(1512);
    await render();
    expect(host.open).toBe(true);
    await run(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { __next: "tree" } })));
    expect(host.open).toBe(false);
  });

  it("a page reloaded on the open view's step takes the step as its own: no second step, and Back or close uses it up", async () => {
    window.history.replaceState({ __next: "tree", panelOpen: true }, "");
    const push = vi.spyOn(window.history, "pushState");
    await render();
    expect(host.open).toBe(false);
    await run(() => chip("a1").click());
    expect(push).not.toHaveBeenCalled();
    const back = vi.spyOn(window.history, "back").mockImplementation(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await run(() => host.close());
    expect([back.mock.calls.length, host.open]).toEqual([1, false]);
  });

  it("a double tap on close goes Back once, never twice (which would leave the page)", async () => {
    window.history.replaceState({ __next: "tree" }, "");
    await render();
    await run(() => chip("a1").click());
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    await run(() => {
      host.close();
      host.close();
    });
    expect(back).toHaveBeenCalledTimes(1);
    await run(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { __next: "tree" } })));
    expect(host.open).toBe(false);
  });

  it("a Back that is not its own step (nothing open) closes nothing and opens nothing", async () => {
    window.history.replaceState({ __next: "tree" }, "");
    await render();
    await run(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(host.open).toBe(false);
  });
});
