// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRIMER, primerItem } from "@/course/primers";
import { spineMap } from "@/course/spine-fixture";
import { QuickTryContext, type QuickTryHost } from "./quick-try-view";
import { SessionItemView } from "./session-item-view";

// A Primer in the conversation (spec 2026-11-12, C3), from the Spine fixture's Primer: at most three lines, one Lingo
// term as a card, one Quick try to tap, the Elective that teaches it in depth, and "I know this".

const map = spineMap();
const topic = map.topic("spine-01-worth")!;
const { data } = primerItem(map, topic, topic.primers![0], "worth-check", 3)!;
const host = (over: Partial<QuickTryHost> = {}): QuickTryHost => ({ locked: false, answered: new Map(), answer: async () => null, ...over });
const draw = (stored: object = data, value: QuickTryHost | null = host()) =>
  renderToStaticMarkup(
    <QuickTryContext.Provider value={value}>
      <SessionItemView item={{ kind: PRIMER, data: stored as Record<string, unknown> }} />
    </QuickTryContext.Provider>,
  );

describe("a Primer", () => {
  it("draws its lines, its term as a card, its Quick try's choices, its Elective and I know this", () => {
    const html = draw();
    expect(html).toContain('data-testid="primer"');
    expect(html).toContain("What a margin keeps");
    expect(html).toContain("A margin is the share of each sale a company keeps.");
    expect(html).toMatch(/data-testid="primer-term"[^>]*>.*operating margin.*What the company keeps from each sale before tax\./);
    expect(html).toContain("A shop sells more but keeps the same share of each sale. What happened to its margin?");
    expect(html.match(/data-testid="quick-try-choice"/g)).toHaveLength(2);
    expect(html).toMatch(/data-testid="primer-elective"[^>]*>In depth: <a href="\/course"[^>]*>The income statement \(coming\)<\/a>/);
    expect(html).toContain(">I know this<");
  });

  it("folds to one line once passed over, and offers I know this no more", () => {
    const html = draw({ ...data, primer: { ...data.primer, passed: true } });
    expect(html).toContain('data-passed="true"');
    expect(html).toContain("Passed over. In depth:");
    expect(html).not.toContain("quick-try-choice");
    expect(html).not.toContain("I know this");
  });

  it("offers no I know this once its Quick try is answered, or with no host (read-only)", () => {
    expect(draw(data, host({ answered: new Map([[data.key, { choice: "same", answer: "same" }]]) }))).not.toContain("I know this");
    expect(draw(data, null)).not.toContain("I know this");
  });

  it("draws nothing for a broken row", () => {
    expect(draw({ key: "qt:1:p:x", prompt: "Q", kind: "choice", choices: [] })).toBe("");
  });
});

describe("pressing I know this", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the Primer's key and folds it", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    await act(async () =>
      root.render(
        <QuickTryContext.Provider value={host()}>
          <SessionItemView item={{ kind: PRIMER, data: data as unknown as Record<string, unknown> }} />
        </QuickTryContext.Provider>,
      ),
    );
    const button = el.querySelector<HTMLButtonElement>('[data-testid="primer-know-this"]')!;
    await act(async () => button.click());
    expect(fetchMock).toHaveBeenCalledWith("/api/primer", expect.objectContaining({ method: "POST", body: JSON.stringify({ key: data.key }) }));
    expect(el.querySelector('[data-testid="primer"]')?.getAttribute("data-passed")).toBe("true");
    act(() => root.unmount());
    el.remove();
  });
});
