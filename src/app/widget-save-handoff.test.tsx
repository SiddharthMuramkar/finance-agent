// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { AnnouncerProvider } from "./announcer";
import { SaveToNotes } from "./save-to-notes";
import { widgetsIn, type ThreadLine } from "./thread";
import { useWidgetHost } from "./widget-host";
import { DRAWING_TIMEOUT_MS, WidgetChip, type WidgetItem } from "./widget-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const CODE = 'root = Widget("Rates", [])';
const ref = { sessionId: 4, turnSeq: 2 };
const SHOWN = { id: "t1", recipe: "grow_money", params: {}, title: "Rates", code: CODE, source: "recipe" };

describe("Widget Retry", () => {
  it("draws the reply again through the page when a Widget did not arrive", async () => {
    const retry = vi.fn();
    const messages: ThreadLine[] = [
      { id: "u1", role: "user", text: "Show me" },
      { id: "a1", role: "assistant", text: "Here.\n\n```openui-lang\nroot = Widget(\"Rates\", [", ref },
    ];
    function Page() {
      const state = useWidgetHost({ messages, running: true, explore: null, onRetry: retry });
      return <>{state.slot({ messageId: "a1", index: 0, code: "", complete: false })}</>;
    }
    await act(async () => root.render(<Page />));
    await act(async () => void vi.advanceTimersByTime(DRAWING_TIMEOUT_MS + 1));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="widget-retry"]')!.click());
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("the 12 second guard", () => {
  it("counts from the last token, not from mount", async () => {
    const at = (code: string): WidgetItem => ({ key: "m:0", number: 1, code, complete: false });
    await act(async () => root.render(<WidgetChip item={at("root = W")} active={false} onPick={() => {}} />));
    await act(async () => void vi.advanceTimersByTime(DRAWING_TIMEOUT_MS - 1000));
    await act(async () => root.render(<WidgetChip item={at("root = Widget(")} active={false} onPick={() => {}} />));
    await act(async () => void vi.advanceTimersByTime(DRAWING_TIMEOUT_MS - 1000));
    expect(host.querySelector('[data-testid="widget-timeout"]')).toBeNull();
    await act(async () => void vi.advanceTimersByTime(1100));
    expect(host.querySelector('[data-testid="widget-timeout"]')).not.toBeNull();
  });
});

describe("a Widget show_widget drew", () => {
  it("carries a Save to notes target after the reply's own Widgets", () => {
    const fence = '```openui-lang\nroot = Widget("Own", [])\n```';
    const lines: ThreadLine[] = [
      { id: "u1", role: "user", text: "Show me" },
      { id: "s1", role: "item", kind: WIDGET_SHOWN, data: SHOWN },
      { id: "a1", role: "assistant", text: `Here.\n\n${fence}`, ref },
    ];
    const shown = widgetsIn(lines).find((w) => w.key === "s1:0");
    expect(shown?.save).toEqual({ kind: "widget", ...ref, widgetIndex: 1 });
  });

  it("has none while the reply is still being written", () => {
    const lines: ThreadLine[] = [
      { id: "u1", role: "user", text: "Show me" },
      { id: "s1", role: "item", kind: WIDGET_SHOWN, data: SHOWN },
    ];
    expect(widgetsIn(lines, true)[0].save).toBeUndefined();
  });
});

describe("Save to notes", () => {
  const target = { kind: "reply", sessionId: 1, turnSeq: 0 } as const;
  const button = (name: RegExp) => [...host.querySelectorAll("button")].find((b) => name.test(b.textContent ?? ""))!;
  const mount = () => act(() => root.render(<AnnouncerProvider><SaveToNotes target={target} what="reply" /></AnnouncerProvider>));

  it("keeps keyboard focus on the control when it changes to Saved", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: 7, topicId: "pv" })));
    mount();
    const save = button(/Save to Notebook/);
    save.focus();
    await act(async () => save.click());
    await act(async () => void vi.advanceTimersByTimeAsync(10));
    expect(host.textContent).toContain("Saved to Notebook ✓");
    expect(host.contains(document.activeElement)).toBe(true);
  });

  it("a failed Undo leaves the note saved, Undo usable and a short error", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "DELETE" ? new Response("no", { status: 500 }) : Response.json({ id: 7, topicId: "pv" })));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await act(async () => button(/Save to Notebook/).click());
    await act(async () => void vi.advanceTimersByTimeAsync(10));
    await act(async () => button(/Undo/).click());
    await act(async () => void vi.advanceTimersByTimeAsync(10));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not undo");
    expect(host.querySelector("[data-save-state]")?.getAttribute("data-save-state")).toBe("saved");
    expect(button(/Undo/).hasAttribute("disabled")).toBe(false);
  });
});
