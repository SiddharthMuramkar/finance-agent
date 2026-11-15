// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tracked = vi.hoisted(() => vi.fn());
vi.mock("@vercel/analytics", () => ({ track: tracked }));

import { QUICK_TRY } from "@/tutor/session-item-kinds";
import { Conversation } from "./conversation";

// The turn stream, driven through the Study Workspace with a hand-fed /api/turn: one turn at a time, Widget Retry on a
// stalled turn, reply ids, and what the left column shows after an error, a cut-short reply and a busy wait.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };
const enc = new TextEncoder();
const BUSY = "A turn is in progress, perhaps on another device. Wait for it to finish, then send again.";
const NO_QUICK_TRY_ANSWER = "There is no Quick try answer to go over.";
/** A whole Widget that needs no data: one slider. */
const LOAN_COST = ["```openui-lang", 'root = Widget("Loan cost", [rate])', "$r = 5", 'rate = Slider("r", "Rate", 0, 20, 1, $r, "percent")', "```"].join("\n");

/** One /api/turn request: what it sent, its stream, and whether that stream is still open. */
type Call = { body: Record<string, unknown>; stream?: ReadableStreamDefaultController<Uint8Array>; open: boolean };

let root: Root;
let host: HTMLElement;
let calls: Call[];
/** Answers the next /api/turn requests give instead of a stream: a 409 body each. */
let refusals: object[];
/** Statuses the next /api/turn requests answer with instead of a stream, each with the server's own error words. */
let failures: number[];
/** Answers the next /api/turn requests give instead of a stream: a Spend cap's 429, with these limit words each. */
let limited: string[];
/** The most /api/turn streams open at once. */
let mostOpen: number;
/** Lets a Quick try's answer (/api/quick-try) come back when the test says. */
let answerQuickTry: (body: object) => void;

beforeEach(() => {
  calls = [];
  refusals = [];
  failures = [];
  limited = [];
  mostOpen = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
      if (url === "/api/quick-try") return new Promise((resolve) => (answerQuickTry = (answer) => resolve({ ok: true, status: 200, json: async () => answer })));
      if (url !== "/api/turn") return { ok: true, status: 200, json: async () => ({}) };
      if (body.stop) return { ok: true, status: 200, json: async () => ({ stopping: true }) };
      const call: Call = { body, open: false };
      calls.push(call);
      const refusal = refusals.shift();
      if (refusal) return { ok: false, status: 409, json: async () => refusal };
      const limit = limited.shift();
      if (limit) return { ok: false, status: 429, json: async () => ({ error: limit, limit: true }) };
      const failure = failures.shift();
      if (failure) return { ok: false, status: failure, json: async () => ({ error: "Send one kind of turn: request_id invalid_request_error" }) };
      call.open = true;
      mostOpen = Math.max(mostOpen, calls.filter((c) => c.open).length);
      const readable = new ReadableStream<Uint8Array>({ start: (c) => void (call.stream = c), cancel: () => void (call.open = false) });
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  tracked.mockReset();
});

/** Lets the page catch up: with fake timers on, it moves the clock by `ms` too. */
const settle = (ms = 20) => act(async () => void (vi.isFakeTimers() ? await vi.advanceTimersByTimeAsync(ms) : await new Promise((r) => setTimeout(r, ms))));
const push = (call: Call, ...events: object[]) => act(async () => void events.forEach((e) => call.stream!.enqueue(enc.encode(JSON.stringify(e) + "\n"))));
/** Sends the events in one network chunk, as a burst arrives: the page reads them all before it renders again. */
const burst = (call: Call, ...events: object[]) => act(async () => void call.stream!.enqueue(enc.encode(events.map((e) => JSON.stringify(e) + "\n").join(""))));
const end = async (call: Call) => {
  await act(async () => {
    call.open = false;
    call.stream!.close();
  });
  await settle();
};
const kinds = () => calls.map((c) => Object.keys(c.body)[0]);
const byId = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === name) ?? null;

async function open(props: Partial<Parameters<typeof Conversation>[0]> = {}) {
  await act(async () => {
    // A turn cut off while the page was closed resumes as the page opens.
    root.render(<Conversation initial={[{ role: "user", text: "Why discount?" }]} quiz={null} pending={{ status: "cut_off", error: null }} review={noReview} {...props} />);
  });
  await settle();
}

describe("one turn at a time", () => {
  it("opens with a cut-off turn and a due drill: the resume runs first, then the drill", async () => {
    await open({ drill: true });
    expect(kinds()).toEqual(["resume"]);

    await push(calls[0], { type: "text", text: "A rupee today is worth more." }, { type: "done", elapsedMs: 1 });
    await end(calls[0]);
    expect(kinds()).toEqual(["resume", "drill"]);
    expect(mostOpen).toBe(1);
  });

  it("Widget Retry on a stalled turn lets go of its stream and resumes it in place, never beside it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await open();
    // The reply stalls inside a Widget: after 12 seconds with no token the chip offers Retry.
    await push(calls[0], { type: "text", text: 'Look:\n```openui-lang\nroot = Widget("Loan cost", [rate])\n' });
    await settle(12_500);
    const retry = byId("widget-retry");
    expect(retry).not.toBeNull();

    await act(async () => retry!.click());
    await settle();
    expect(calls[0].open).toBe(false);
    expect(kinds()).toEqual(["resume", "resume"]);
    expect(mostOpen).toBe(1);
    // Still the one turn: Stop stays, no second reply bubble is drawn.
    expect(byId("stop-reply")).not.toBeNull();

    await push(calls[1], { type: "replay", text: "Look: the whole reply, drawn again." }, { type: "done", elapsedMs: 1 });
    await end(calls[1]);
    expect(host.textContent).toContain("Look: the whole reply, drawn again.");
    expect(host.textContent).not.toContain("Loan cost");
    expect(byId("stop-reply")).toBeNull();
    expect(kinds()).toEqual(["resume", "resume"]);
  });

  it("Widget Retry while the server's turn still runs: waits for it, then draws the reply with no busy notice left", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await open();
    await push(calls[0], { type: "text", text: 'Look:\n```openui-lang\nroot = Widget("Loan cost", [rate])\n' });
    await settle(12_500);
    // The server's turn keeps running, so the resume is refused until it ends.
    refusals.push({ error: BUSY });
    await act(async () => byId("widget-retry")!.click());
    await settle();
    expect(kinds()).toEqual(["resume", "resume"]);
    expect(byId("turn-notice")?.textContent).toBe(BUSY);

    await settle(3_100);
    expect(kinds()).toEqual(["resume", "resume", "resume"]);
    await push(calls[2], { type: "replay", text: "Look: the whole reply, drawn again." }, { type: "done", elapsedMs: 1 });
    await end(calls[2]);
    expect(host.textContent).toContain("Look: the whole reply, drawn again.");
    expect(byId("turn-notice")).toBeNull();
  });

  it("drops a Quick try's follow-up whose answer came back while a turn ran: that turn's reply leaves nothing to go over", async () => {
    const quickTry = { key: "qt:1:1:word-1", checkId: "c2", skillId: "wording", prompt: "A rate goes from 2% to 3%. True or false: rates rose 50%.", kind: "truth" };
    await open({ pending: null, initial: [{ role: "user", text: "Rates?" }, { role: "assistant", text: "Try this one." }, { role: "item", kind: QUICK_TRY, data: quickTry }] });
    await act(async () => byId("quick-try-true")!.click());
    // The Learner presses a Choice while the answer is still on the way.
    await act(async () => button("Show me")!.click());
    await settle();
    expect(kinds()).toEqual(["message"]);

    await act(async () => answerQuickTry({ items: [], followUp: true }));
    await settle();
    expect(kinds()).toEqual(["message"]);

    // As the server does: once a reply follows the Quick try's result, a follow-up is refused.
    refusals.push({ error: NO_QUICK_TRY_ANSWER });
    await push(calls[0], { type: "text", text: "Here is how." }, { type: "done", elapsedMs: 1 });
    await end(calls[0]);
    expect(kinds()).toEqual(["message"]);
    expect(byId("turn-error")).toBeNull();
    expect(host.textContent).toContain("Here is how.");
  });

  it("keeps a turn code asked for waiting while the turn before it failed: its error and Retry stay, and it starts after the Retry", async () => {
    await open({ drill: true });
    expect(kinds()).toEqual(["resume"]);
    await push(calls[0], { type: "error", kind: "error", message: "Something went wrong on our side. Everything so far is saved. Press Retry. Reference: T7K2Q9" });
    await end(calls[0]);
    expect(kinds()).toEqual(["resume"]);
    expect(byId("turn-error")?.textContent).toBe("Something went wrong on our side. Everything so far is saved. Press Retry. Reference: T7K2Q9");
    expect(button("Retry")).not.toBeNull();

    await act(async () => button("Retry")!.click());
    await settle();
    expect(kinds()).toEqual(["resume", "resume"]);
    await push(calls[1], { type: "replay", text: "A rupee today is worth more." }, { type: "done", elapsedMs: 1 });
    await end(calls[1]);
    expect(kinds()).toEqual(["resume", "resume", "drill"]);
    expect(mostOpen).toBe(1);
  });

  it("keeps a turn code asked for waiting while the reply before it was cut short: Finish this reply stays, and it starts after that", async () => {
    await open({ drill: true });
    await push(calls[0], { type: "text", text: "A rupee today is worth" }, { type: "cut_short", message: "Cut short." }, { type: "done", elapsedMs: 1 });
    await end(calls[0]);
    expect(kinds()).toEqual(["resume"]);
    expect(byId("finish-reply")).not.toBeNull();

    await act(async () => byId("finish-reply")!.click());
    await settle();
    await push(calls[1], { type: "text", text: " more." }, { type: "done", elapsedMs: 1 });
    await end(calls[1]);
    expect(kinds()).toEqual(["resume", "finish", "drill"]);
  });

  it("gives two turns started in the same millisecond replies of their own", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    await open();
    await push(calls[0], { type: "text", text: "A rupee today is worth more." }, { type: "cut_short", message: "Cut short." }, { type: "done", elapsedMs: 1 });
    await end(calls[0]);

    await act(async () => byId("finish-reply")!.click());
    await settle();
    await push(calls[1], { type: "text", text: "It can earn interest meanwhile." }, { type: "done", elapsedMs: 1 });
    await end(calls[1]);

    const shown = host.textContent!;
    expect(shown.split("It can earn interest meanwhile.")).toHaveLength(2);
    expect(shown).not.toContain("A rupee today is worth more.It can earn interest meanwhile.");
    expect(shown).toContain("A rupee today is worth more.");
  });

  it("gives a page opened again reply ids of its own, so a Widget is timed from its own drawing, not the last visit's", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    await open();
    // The first visit's reply starts a Widget, and the Learner leaves before it is done.
    await push(calls[0], { type: "text", text: 'Look:\n```openui-lang\nroot = Widget("Loan cost", [rate])\n' });
    await settle();
    act(() => root.unmount());
    root = createRoot(host);

    // A minute later they come back, and the resumed reply draws its Widget whole.
    now.mockReturnValue(61_000);
    await open();
    await push(calls[1], { type: "replay", text: `Look:\n${LOAN_COST}` }, { type: "done", elapsedMs: 1 });
    await end(calls[1]);
    const pixel = tracked.mock.calls.find((c) => c[0] === "widget_first_pixel");
    expect(pixel?.[1]).toMatchObject({ ms: 0 });
  });
});

describe("where streamed lines go", () => {
  it("keeps text that arrives with a step divider in one burst before the divider, and the rest after it", async () => {
    await open();
    await burst(
      calls[0],
      { type: "text", text: "That finishes the Concept." },
      { type: "text", text: " Well done." },
      { type: "item", item: { kind: "step", data: { number: 3, label: "Step 3 · Explore" } } },
      { type: "text", text: "Now move the slider." },
      { type: "done", elapsedMs: 1 },
    );
    await end(calls[0]);
    const shown = host.textContent!;
    expect(shown).toContain("That finishes the Concept. Well done.");
    expect(shown.indexOf("Well done.")).toBeLessThan(shown.indexOf("Step 3 · Explore"));
    expect(shown.indexOf("Step 3 · Explore")).toBeLessThan(shown.indexOf("Now move the slider."));
  });
});

describe("the Widget state the turn stream is given", () => {
  it("takes the values a widget_state event pushes, and the next turn request carries them", async () => {
    await open();
    await push(calls[0], { type: "widget_state", widgetKey: "rates", values: { $rate: 8 } }, { type: "error", kind: "error", message: "Something went wrong on our side. Everything so far is saved. Press Retry. Reference: T7K2Q9" });
    await end(calls[0]);
    await act(async () => button("Retry")!.click());
    await settle();
    expect(calls[1].body.widgets).toEqual({ rates: { values: { $rate: 8 }, ticked: [] } });
  });
});

describe("what the left column shows after a turn", () => {
  it("a streamed error: shows it and offers Retry, which resumes the turn", async () => {
    await open();
    await push(calls[0], { type: "error", kind: "error", message: "Something went wrong on our side. Everything so far is saved. Press Retry. Reference: T7K2Q9" });
    await end(calls[0]);
    expect(byId("turn-error")?.textContent).toBe("Something went wrong on our side. Everything so far is saved. Press Retry. Reference: T7K2Q9");
    // No provider words were sent (Show developer details is off), so none show.
    expect(byId("failed-turn-details")).toBeNull();
    expect(byId("stop-reply")).toBeNull();

    await act(async () => button("Retry")!.click());
    await settle();
    expect(kinds()).toEqual(["resume", "resume"]);
    // A new turn clears the error and the Retry.
    expect(byId("turn-error")).toBeNull();
    expect(button("Retry")).toBeNull();
  });

  it("a cut-short reply: offers Finish this reply once the turn ends, which sends finish", async () => {
    await open();
    await push(calls[0], { type: "text", text: "A rupee today is worth" }, { type: "cut_short", message: "Cut short." });
    expect(byId("finish-reply")).toBeNull();
    await push(calls[0], { type: "done", elapsedMs: 1 });
    await end(calls[0]);
    expect(host.textContent).toContain("The reply was cut short.");

    await act(async () => byId("finish-reply")!.click());
    await settle();
    expect(kinds()).toEqual(["resume", "finish"]);
    expect(byId("finish-reply")).toBeNull();
  });

  it("a resume refused while the turn still runs elsewhere: says so and asks again every 3 seconds, then streams", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    refusals.push({ error: BUSY });
    await open();
    expect(kinds()).toEqual(["resume"]);
    expect(byId("turn-notice")?.textContent).toBe(BUSY);
    expect(byId("stop-reply")).not.toBeNull();

    await settle(2_900);
    expect(kinds()).toEqual(["resume"]);
    await settle(200);
    expect(kinds()).toEqual(["resume", "resume"]);

    await push(calls[1], { type: "replay", text: "A rupee today is worth more." }, { type: "done", elapsedMs: 1 });
    await end(calls[1]);
    expect(host.textContent).toContain("A rupee today is worth more.");
    expect(byId("stop-reply")).toBeNull();
    expect(byId("turn-error")).toBeNull();
    // The turn it waited for has ended: the busy notice goes with it.
    expect(byId("turn-notice")).toBeNull();
  });

  it("a stream that ends with no done: resumes on its own, and the saved text replaces what was shown", async () => {
    await open();
    await push(calls[0], { type: "text", text: "A rupee tod" });
    await end(calls[0]);
    expect(kinds()).toEqual(["resume", "resume"]);

    await push(calls[1], { type: "replay", text: "A rupee today is worth more." }, { type: "done", elapsedMs: 1 });
    await end(calls[1]);
    expect(host.textContent).toContain("A rupee today is worth more.");
    expect(host.textContent).not.toContain("A rupee tod ");
    expect(byId("stop-reply")).toBeNull();
  });
});

describe("a tab left idle while Clerk runs (issue #33)", () => {
  it("a turn refused 401 for an expired session token is sent once more after Clerk renews it, and streams", async () => {
    const getToken = vi.fn(async () => "fresh");
    vi.stubGlobal("Clerk", { session: { getToken } });
    failures = [401];
    await open();
    expect(getToken).toHaveBeenCalledWith({ skipCache: true });
    expect(kinds()).toEqual(["resume", "resume"]);
    await push(calls[1], { type: "replay", text: "A rupee today is worth more." }, { type: "done", elapsedMs: 1 });
    await end(calls[1]);
    expect(host.textContent).toContain("A rupee today is worth more.");
    expect(byId("turn-error")).toBeNull();
  });
});

describe("a Spend cap", () => {
  const LIMIT = "You have reached today's limit for the Tutor. It comes back at midnight, India time. Your Widgets still work.";

  it("shows the limit words from a 429, takes the message back, sends it once and offers no Retry", async () => {
    await open({ pending: null, initial: [{ role: "user", text: "Rates?" }, { role: "assistant", text: "Here is the idea." }] });
    limited.push(LIMIT);
    await act(async () => button("Show me")!.click());
    await settle(50);
    expect(kinds()).toEqual(["message"]);
    expect(calls[0].body).toMatchObject({ message: "Show me." });
    expect(byId("turn-error")?.textContent).toBe(LIMIT);
    expect(button("Retry")).toBeNull();
    expect(host.textContent).not.toContain("Show me.");
  });

  it("a resume past the resume limit shows the limit words once, keeps the conversation and offers no Retry", async () => {
    const TRIES = "This reply has used all its tries, so the Tutor stops it here. Send a new message to carry on.";
    limited.push(TRIES);
    // The page opens on a cut-off turn, so it resumes it at once.
    await open();
    await settle(50);
    expect(kinds()).toEqual(["resume"]);
    expect(byId("turn-error")?.textContent).toBe(TRIES);
    expect(button("Retry")).toBeNull();
    expect(host.textContent).toContain("Why discount?");
  });
});

describe("a failure in plain words (A3)", () => {
  const PLAIN = "Something went wrong on our side. Everything so far is saved. Press Retry.";

  it("an /api/turn answer that is not a stream shows the plain sentence, never its status or the server's words", async () => {
    failures = [400];
    await open();
    expect(byId("turn-error")?.textContent).toBe(PLAIN);
    for (const word of ["400", "invalid_request_error", "request_id"]) expect(host.textContent).not.toContain(word);
    expect(button("Retry")).not.toBeNull();
  });

  it("shows what the provider said under Under the hood when the server sent it (Show developer details on)", async () => {
    await open();
    const provider = { message: "messages.27.content.0: Invalid `signature` in `thinking` block.", requestId: "req_011CVwXyZ", status: 400 };
    await push(calls[0], { type: "error", kind: "error", message: `${PLAIN} Reference: T7K2Q9`, provider });
    await end(calls[0]);
    expect(byId("turn-error")?.textContent).toBe(`${PLAIN} Reference: T7K2Q9`);
    const details = byId("failed-turn-details");
    expect(details?.textContent).toContain("req_011CVwXyZ");
    expect(details?.textContent).toContain("Status 400");
    expect(details?.textContent).toContain(provider.message);
  });

  it("a page opened on a failed turn shows its error, and the provider's words only when the page was given them", async () => {
    const provider = { message: "messages.27.content.0: Invalid `signature`", requestId: "req_1", status: 400 };
    await open({ pending: { status: "failed", error: `${PLAIN} Reference: T7K2Q9` } });
    expect(byId("turn-error")?.textContent).toBe(`${PLAIN} Reference: T7K2Q9`);
    expect(byId("failed-turn-details")).toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    await open({ pending: { status: "failed", error: `${PLAIN} Reference: T7K2Q9`, provider } });
    expect(byId("failed-turn-details")?.textContent).toContain("req_1");
  });
});
