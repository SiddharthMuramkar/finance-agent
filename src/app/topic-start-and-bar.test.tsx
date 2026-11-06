// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCourseMap } from "@/course/map";
import { stepSequence, type StepSequence } from "@/course/navigator";
import { topicStart } from "@/course/topic-start";
import { Conversation, type Line } from "./conversation";
import { TopicBar } from "./workspace-parts";

// The Topic Start card (spec #119) stays the first item of the conversation while the Tutor's opener streams in,
// even when the reply is replayed whole (a resume or a refusal replaces the reply and the items inside it); and a
// finished step on the Topic bar's strip scrolls the chat back to it. Drawn in a browser-like page (happy-dom),
// since the opener starts and clicks happen only in the browser.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };
const start = topicStart(loadCourseMap(), { currentTopicId: null, topics: {} }, "present-value")!;

let root: Root;
let host: HTMLElement;

function streamOf(events: object[]) {
  return new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", { status: 200 });
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function openWith(events: object[]) {
  const requests: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/turn") {
        requests.push(JSON.parse(String(init?.body)));
        return streamOf(events);
      }
      return new Response("{}", { status: 200 });
    }),
  );
  await act(async () => {
    root.render(
      <Conversation initial={[{ role: "item", ...start }]} quiz={null} pending={null} review={noReview} shown={{ topicId: "present-value" }} />,
    );
  });
  // Let the opener's stream finish.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return requests;
}

describe("the Topic Start card while the opener streams", () => {
  it("starts the opener by itself under the card, and the card stays first", async () => {
    const requests = await openWith([{ type: "text", text: "Once, a lottery winner had a choice." }, { type: "done" }]);
    expect(requests).toEqual([expect.objectContaining({ opener: true })]);
    const thread = host.querySelector('[data-testid="thread-viewport"]')!;
    expect(thread.querySelector('[data-testid="topic-start"]')).not.toBeNull();
    expect(thread.textContent!.indexOf("Present value")).toBeLessThan(thread.textContent!.indexOf("Once, a lottery winner"));
  });

  it("keeps the card when the opener's reply is replayed whole", async () => {
    await openWith([{ type: "refusal", text: "Once, a lottery winner had a choice.", message: "The Tutor's last step was left out." }, { type: "done" }]);
    const thread = host.querySelector('[data-testid="thread-viewport"]')!;
    expect(thread.textContent).toContain("Once, a lottery winner had a choice.");
    expect(thread.querySelector('[data-testid="topic-start"]')).not.toBeNull();
  });
});

describe("a finished step on the Topic bar", () => {
  it("scrolls the chat back to that step's divider, and the Story to the Topic Start card", async () => {
    const map = loadCourseMap();
    const progress = {
      currentTopicId: "present-value",
      topics: { "present-value": { step: "your_turn" as const, passedChecks: [], revealShown: false, status: "in_progress" as const } },
    };
    const initial: Line[] = [
      { role: "item", ...topicStart(map, progress, "present-value")! },
      { role: "assistant", text: "Once, a lottery winner had a choice." },
      { role: "item", kind: "step", data: { step: "concept", number: 2, label: "Step 2 of 10 · Concept" } },
      { role: "assistant", text: "Money today is worth more." },
      { role: "item", kind: "step", data: { step: "your_turn", number: 3, label: "Step 3 of 10 · Your turn" } },
      { role: "assistant", text: "Your turn: what is $100 next year worth today?" },
    ];
    const scrolled: (string | null)[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.getAttribute("data-testid"));
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await act(async () => {
      root.render(
        <Conversation
          initial={initial}
          strip={stepSequence(map, progress, "present-value")}
          quiz={null}
          pending={null}
          review={noReview}
          place={{ stage: "foundation", title: "Present value" }}
        />,
      );
    });
    const bar = host.querySelector('[data-testid="topic-bar"]')!;
    const press = (number: number) => act(() => (bar.querySelector(`button[data-step-number="${number}"]`) as HTMLButtonElement).click());
    await press(2);
    expect(scrolled).toEqual(["step-divider"]);
    expect(host.querySelector("#step-2")?.textContent).toContain("Step 2 of 10 · Concept");
    await press(1);
    expect(scrolled).toEqual(["step-divider", "topic-start"]);
    // The current step (Your turn, step 3) is highlighted, not a button.
    expect(bar.querySelector('button[data-step-number="3"]')).toBeNull();
    expect(bar.querySelector('[aria-current="step"]')?.textContent).toBe("Your turn");
    // A finished step is a small raised Chip (spec A3b), so it reads as a button.
    expect(bar.querySelector('button[data-step-number="1"]')?.getAttribute("data-affordance")).toBe("chip");
  });

  it("draws the strip on one line that scrolls sideways, every Check in the one list, and brings the current step into view (#313)", async () => {
    const map = loadCourseMap();
    const id = "num-percent-bps";
    const progress = { currentTopicId: id, topics: { [id]: { step: "your_turn" as const, passedChecks: [], revealShown: false, status: "in_progress" as const } } };
    const strip = stepSequence(map, progress, id)!;
    expect(strip.groups.filter((g) => g.check).length).toBe(4);
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await act(async () => {
      root.render(
        <Conversation
          initial={[{ role: "assistant", text: "Hello." }]}
          strip={strip}
          quiz={null}
          pending={null}
          review={noReview}
          place={{ stage: "foundation", title: "Percent, percentage points and basis points" }}
        />,
      );
    });
    const list = host.querySelector('[data-testid="topic-bar"] ol[aria-label="Steps in this Topic"]')!;
    expect(list.className).not.toMatch(/\bflex-wrap\b/);
    expect(list.className).toMatch(/\bflex-nowrap\b/);
    expect(list.className).toMatch(/\boverflow-x-auto\b/);
    for (const inner of list.querySelectorAll("ol")) expect(inner.className).not.toMatch(/\bflex-wrap\b/);
    expect([...list.querySelectorAll(":scope > li")].filter((li) => li.textContent!.startsWith("Check ")).length).toBe(4);
    // The strip scrolls only itself to the current step: scrollIntoView would also move the page and the column.
    expect(scrolled).toEqual([]);
    expect(list.querySelector('[aria-current="step"]')).not.toBeNull();
  });

  it("centres the current step in the strip on mount, and again when the current step moves (#313)", async () => {
    const map = loadCourseMap();
    const id = "num-percent-bps";
    const at = (step: "concept" | "your_turn") =>
      stepSequence(map, { currentTopicId: id, topics: { [id]: { step, passedChecks: [], revealShown: false, status: "in_progress" as const } } }, id)!;
    const first = at("concept");
    const second = at("your_turn");
    expect(second.current).not.toBe(first.current);
    // A fake layout (happy-dom lays nothing out): the strip is 200 px wide at x = 10; step n sits 60·n px into
    // its content, 40 px wide, and moves left as the strip scrolls. Centred means scrollLeft = 60·n − (200 − 40) / 2.
    const original = Element.prototype.getBoundingClientRect;
    const rect = (left: number, width: number) => ({ left, width, top: 0, height: 20, right: left + width, bottom: 20, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.getAttribute("aria-label") === "Steps in this Topic") return rect(10, 200);
      if (this.getAttribute("aria-current") === "step") {
        const ol = this.closest('ol[aria-label="Steps in this Topic"]')!;
        return rect(10 + 60 * Number(this.getAttribute("data-step-number")) - ol.scrollLeft, 40);
      }
      return rect(0, 0);
    };
    try {
      const draw = (strip: StepSequence) => act(() => root.render(<TopicBar title="Percent, percentage points and basis points" strip={strip} marked={new Set()} />));
      const list = () => host.querySelector<HTMLOListElement>('ol[aria-label="Steps in this Topic"]')!;
      await draw(first);
      expect(list().scrollLeft).toBe(60 * (first.current! + 1) - 80);
      await draw(second);
      expect(list().scrollLeft).toBe(60 * (second.current! + 1) - 80);
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });

  it("the Study page's Topic bar carries the shown Topic's ⋯ Topic options button (B3b)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await act(async () => {
      root.render(
        <Conversation
          initial={[{ role: "assistant", text: "Hello." }]}
          quiz={null}
          pending={null}
          review={noReview}
          place={{ stage: "foundation", topicId: "present-value", title: "Present value" }}
        />,
      );
    });
    const bar = host.querySelector('[data-testid="topic-bar"]')!;
    expect(bar.getAttribute("aria-label")).toBe("Topic progress");
    const options = bar.querySelector<HTMLButtonElement>('button[aria-label="Topic options"]');
    expect(options).not.toBeNull();
    await act(async () => options!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click());
    expect(host.querySelector('[data-testid="restart-confirm"]')?.getAttribute("action")).toBe("/api/topics/present-value/restart");
  });
});
