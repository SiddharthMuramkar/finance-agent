// @vitest-environment happy-dom
import { AssistantRuntimeProvider, useExternalStoreRuntime } from "@assistant-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STOPPED } from "@/tutor/session-item-kinds";
import { Conversation } from "./conversation";
import { LeftColumn } from "./left-column";
import { SessionItemView } from "./session-item-view";
import { convertMessage } from "./thread";
import { withoutOpenWidget, type TurnStream } from "./turn-stream";

// The composer: Send becomes Stop while a reply runs; Stop is its own request and never aborts the stream; a
// stopped reply ends with "stopped" then "done" (finished, no resume); progress labels show in the indicator.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };
const enc = new TextEncoder();
const line = (e: object) => enc.encode(JSON.stringify(e) + "\n");

let root: Root;
let host: HTMLElement;
let stream: ReadableStreamDefaultController<Uint8Array>;
let calls: { body: Record<string, unknown> }[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
      if (url === "/api/turn") calls.push({ body });
      if (body.stop) return { ok: true, status: 200, json: async () => ({ stopping: true }) };
      if (url !== "/api/turn") return { ok: true, status: 200, json: async () => ({}) };
      const readable = new ReadableStream<Uint8Array>({ start: (c) => void (stream = c) });
      return { ok: true, status: 200, body: readable };
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const push = (...events: object[]) => act(async () => void events.forEach((e) => stream.enqueue(line(e))));
const pause = () => act(async () => void (await new Promise((r) => setTimeout(r, 20))));
const byId = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

async function openWithRunningTurn() {
  await act(async () => {
    // A turn cut off while the page was closed resumes as the page opens: a reply is running without a Send press.
    root.render(<Conversation initial={[{ role: "user", text: "Why discount?" }]} quiz={null} pending={{ status: "cut_off", error: null }} review={noReview} />);
  });
  await pause();
}

describe("Stop", () => {
  it("replaces Send while a reply runs, and the reply ends on stopped then done with no resume", async () => {
    await openWithRunningTurn();
    expect(byId("stop-reply")?.textContent).toContain("Stop");
    expect(host.textContent).not.toContain("Send");

    await push({ type: "text", text: "A rupee today is worth more" });
    await act(async () => byId("stop-reply")!.click());
    await pause();
    // Stop is a separate request; the reply's own stream is not aborted.
    expect(calls.map((c) => Object.keys(c.body)[0])).toEqual(["resume", "stop"]);

    await push({ type: "stopped" }, { type: "done", elapsedMs: 10 });
    await act(async () => stream.close());
    await pause();
    expect(calls).toHaveLength(2); // finished: nothing resumed
    expect(byId("stopped-note")?.textContent).toBe("Stopped");
    expect(host.textContent).toContain("A rupee today is worth more");
    expect(byId("stop-reply")).toBeNull();
    expect(host.textContent).toContain("Send");
  });

  it("cuts an unfinished Widget from the kept reply", () => {
    expect(withoutOpenWidget("Look:\n```openui-lang\nroot = Stack([")).toBe("Look:");
    expect(withoutOpenWidget("Look:\n```openui")).toBe("Look:");
    expect(withoutOpenWidget("Plain words.")).toBe("Plain words.");
  });
});

describe("the progress label", () => {
  it("replaces the writing words, and the first text clears it; a ping changes nothing", async () => {
    await openWithRunningTurn();
    expect(byId("writing-indicator")?.textContent).toBe("Tutor is writing…");
    await push({ type: "ping" });
    expect(byId("writing-indicator")?.textContent).toBe("Tutor is writing…");
    await push({ type: "progress", label: "Looking up Case Data…" });
    expect(byId("writing-indicator")?.textContent).toBe("Looking up Case Data…");
    await push({ type: "text", text: "Here" });
    expect(byId("writing-indicator")).toBeNull();
    await push({ type: "done", elapsedMs: 1 });
    await act(async () => stream.close());
  });
});

function Column({ openQuestion }: { openQuestion?: string }) {
  const runtime = useExternalStoreRuntime({ messages: [], isRunning: false, convertMessage, onNew: async () => {} });
  const turn = {
    messages: [], running: false, refreshing: false, announcement: "", fixing: false, error: null, notice: null, canRetry: false, cutShort: false,
    waiting: null, progress: null, stopping: false, stop: () => {}, passage: null, setPassage: () => {}, send: async () => {}, appendItem: () => {}, runtime,
  } as TurnStream;
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <LeftColumn turn={turn} slot={() => null} quizOpen={false} openQuestion={openQuestion} />
    </AssistantRuntimeProvider>
  );
}

describe("the chat column", () => {
  it("keeps its scroll inside itself", () => {
    const html = renderToStaticMarkup(<Column />);
    const tag = html.match(/<div[^>]*data-testid="thread-viewport"[^>]*>/)?.[0] ?? "";
    const classes = (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(" ");
    for (const c of ["relative", "overflow-y-auto", "overscroll-contain", "[scrollbar-gutter:stable]"]) expect(classes).toContain(c);
  });

  it("pins the open question above the message box only when there is one", () => {
    expect(renderToStaticMarkup(<Column />)).not.toContain("open-question");
    const html = renderToStaticMarkup(<Column openQuestion="What rate did you find?" />);
    expect(html).toContain("What rate did you find?");
    expect(html.indexOf("open-question")).toBeLessThan(html.indexOf('aria-label="Message"'));
  });

  it("marks Attach a passage as a toggle", () => {
    expect(renderToStaticMarkup(<Column />)).toMatch(/aria-pressed="false"[^>]*>(<svg.*?<\/svg>)?<span class="hidden lg:inline">Attach a passage<\/span>/);
  });
});

describe("the Stopped item", () => {
  it("draws a small muted note", () => {
    const html = renderToStaticMarkup(<SessionItemView item={{ kind: STOPPED, data: {} }} />);
    expect(html).toMatch(/data-testid="stopped-note"[^>]*>Stopped</);
  });
});
