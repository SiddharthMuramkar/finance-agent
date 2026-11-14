// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider } from "./announcer";
import { SAVED_HOLD_MS, SaveToNotes, SaveToNotesView } from "./save-to-notes";

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

const target = { kind: "reply", sessionId: 1, turnSeq: 0 } as const;
const announcer = () => host.querySelector('[data-testid="app-announcer"]')!;
const control = () => host.querySelector('[data-testid="save-to-notes"]')!;
const button = (name: RegExp) => [...host.querySelectorAll("button")].find((b) => name.test(b.textContent ?? ""))!;
const settle = async (ms = 100) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

function mount() {
  act(() => root.render(<AnnouncerProvider><SaveToNotes target={target} what="reply" /></AnnouncerProvider>));
}

describe("Save to Notebook as a state machine", () => {
  it("goes idle, Saving… with a spinner, Saved to Notebook ✓ for 1.6s, then Save to Notebook with a quiet Saved badge and Open Notebook", async () => {
    let finish!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (finish = r))));
    mount();
    expect(control().getAttribute("data-save-state")).toBe("idle");
    expect(button(/Save to Notebook/).textContent).toBe("Save to Notebook");

    act(() => button(/Save to Notebook/).click());
    expect(control().getAttribute("data-save-state")).toBe("saving");
    expect(button(/Saving…/).getAttribute("aria-busy")).toBe("true");
    expect(control().querySelector('[data-testid="spinner"]')).not.toBeNull();

    await act(async () => finish(Response.json({ id: 7, topicId: "present-value" })));
    await settle(10);
    expect(control().getAttribute("data-save-state")).toBe("saved");
    expect(control().textContent).toContain("Saved to Notebook ✓");
    expect(control().querySelector('[data-testid="saved-badge"]')).toBeNull();

    await settle(SAVED_HOLD_MS);
    expect(control().textContent).not.toContain("Saved to Notebook ✓");
    expect(button(/Save to Notebook/)).toBeDefined();
    expect(control().querySelector('[data-testid="saved-badge"]')?.textContent).toBe("Saved");
    expect(control().querySelector('a[href="/notebook#note-present-value"]')?.textContent).toBe("Open Notebook");
  });

  it("puts no role=status in the message and announces Saved to Notebook exactly once through the app announcer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: 7, topicId: "present-value" })));
    mount();
    act(() => button(/Save to Notebook/).click());
    await settle(SAVED_HOLD_MS + 200);
    expect(control().querySelector('[role="status"]')).toBeNull();
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(announcer().textContent).toBe("Saved to Notebook");
  });

  it("on failure shows a visible role=alert and a Retry that saves again", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 500 })).mockResolvedValueOnce(Response.json({ id: 8, topicId: "present-value" }));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    act(() => button(/Save to Notebook/).click());
    await settle(10);
    const alert = control().querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("Could not save. Try again.");
    expect(announcer().textContent).toBe("");
    act(() => button(/Retry/).click());
    await settle(10);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(control().textContent).toContain("Saved to Notebook ✓");
    expect(control().querySelector('[role="alert"]')).toBeNull();
  });
});

describe("the Save to Notebook view", () => {
  const noop = () => {};
  it("renders no live region of its own in any state", () => {
    for (const state of [{ status: "idle" }, { status: "saving" }, { status: "saved", id: 1, topicId: "t" }, { status: "saved", id: 1, topicId: "t", settled: true }] as const) {
      expect(renderToStaticMarkup(<SaveToNotesView state={state} what="reply" onSave={noop} onUndo={noop} />)).not.toContain("role=");
    }
    expect(renderToStaticMarkup(<SaveToNotesView state={{ status: "failed", message: "Could not save. Try again." }} what="reply" onSave={noop} onUndo={noop} />)).toContain('role="alert"');
  });
});
