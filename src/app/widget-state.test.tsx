// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetStates } from "@/widgets/widget-state";
import { Conversation, type Line } from "./conversation";

// Widget state (spec #119, "Widgets › Widget state"): in the Study Workspace a Widget draws with the slider values
// and ticked Guided Tasks saved for its Widget key in this Session, keeps them across a switch between Widget tabs,
// and saves what the Learner changes so a reload draws it too. Drawn in a browser-like page (happy-dom), as only
// the browser sets a Widget's starting values.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fence = (code: string) => ["```openui-lang", code, "```"].join("\n");

const rates = (title: string) =>
  [
    `root = Widget("${title}", [rate, steps])`,
    "$rate = 5",
    'rate = Slider("rate", "Interest rate", 0, 10, 0.25, $rate, "percent")',
    "steps = GuidedTasks([t1, t2])",
    't1 = GuidedTask("Set the rate to 3%", $rate == 3)',
    't2 = GuidedTask("Set the rate to 8%", $rate == 8)',
  ].join("\n");

const TWO_WIDGETS: Line[] = [
  { role: "user", text: "Show me." },
  { role: "assistant", text: fence(rates("First rates")) },
  { role: "user", text: "And another." },
  { role: "assistant", text: fence(rates("Second rates")) },
];

const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };

let root: Root;
let host: HTMLElement;
let posts: unknown[];
/** The turn requests the page sent, each answered at once with a finished turn. */
let turns: Record<string, unknown>[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  posts = [];
  turns = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/widget-state") posts.push(JSON.parse(String(init?.body)));
      if (url === "/api/turn") {
        turns.push(JSON.parse(String(init?.body)));
        return new Response(`${JSON.stringify({ type: "text", text: "Noted." })}\n${JSON.stringify({ type: "done", stopReason: "end_turn" })}\n`, { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
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
  vi.useRealTimers();
});

async function open(initial: Line[], widgetStates?: WidgetStates, sessionId: number | null = 7) {
  await act(async () => {
    root.render(
      <Conversation
        initial={initial}
        quiz={null}
        pending={null}
        review={noReview}
        place={{ stage: "foundation", title: "Percent" }}
        shown={sessionId === null ? { topicId: "percent" } : { sessionId }}
        widgetStates={widgetStates}
      />,
    );
  });
}

const card = () => host.querySelector('[data-testid="widget-card"]')!;
const slider = () => card().querySelector<HTMLInputElement>('input[type="range"][aria-label="Interest rate"]')!;
const ticks = () => [...card().querySelectorAll("[data-state]")].map((li) => li.getAttribute("data-state"));
const title = () => card().querySelector("h3")?.textContent;
const tab = (name: string) => [...host.querySelectorAll<HTMLElement>('[aria-label="Widgets in this Session"] [role=option]')].find((o) => o.querySelector(".truncate")?.textContent === name)!;

async function click(button: HTMLElement) {
  await act(async () => button.click());
}

/** Moves the rate slider's range to an exact value, as a Learner does. */
async function setRate(value: number) {
  const box = card().querySelector<HTMLInputElement>('input[type="range"][aria-label="Interest rate"]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(box, String(value));
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function afterSaving() {
  await act(async () => vi.advanceTimersByTime(1000));
}

describe("a Widget in the Study Workspace with saved Widget state", () => {
  it("draws its sliders at the saved values and its saved Guided Tasks ticked", async () => {
    await open([{ role: "assistant", text: fence(rates("Rates")) }], { Rates: { values: { $rate: 2.5 }, ticked: ["Set the rate to 3%"] } });
    expect(slider().value).toBe("2.5");
    expect(ticks()).toEqual(["done", "current"]);
  });

  it("goes back to the starting values in its code on Reset, not to the saved ones", async () => {
    await open([{ role: "assistant", text: fence(rates("Rates")) }], { Rates: { values: { $rate: 2.5 }, ticked: [] } });
    const reset = [...card().querySelectorAll("button")].find((b) => b.textContent === "Reset")!;
    await click(reset);
    // Reset slides the slider home in about a quarter of a second.
    await act(async () => vi.advanceTimersByTime(400));
    expect(slider().value).toBe("5");
  });

  it("draws with its starting values and no ticks when nothing is saved under its key", async () => {
    await open([{ role: "assistant", text: fence(rates("Rates")) }], { Other: { values: { $rate: 2.5 }, ticked: ["Set the rate to 3%"] } });
    expect(slider().value).toBe("5");
    expect(ticks()).toEqual(["current", "todo"]);
  });

  it("keeps a saved value the Learner typed between two steps, rather than moving it onto a step", async () => {
    const loan = [
      'root = Widget("Loan", [amount, steps])',
      "$amount = 5000000",
      'amount = Slider("amount", "Loan amount", 500000, 20000000, 100000, $amount, "inr")',
      "steps = GuidedTasks([big])",
      'big = GuidedTask("Set the loan to 1 crore", $amount == 10000000)',
    ].join("\n");
    await open([{ role: "assistant", text: fence(loan) }], { Loan: { values: { $amount: 5050000 }, ticked: [] } });
    await afterSaving();
    expect(card().querySelector<HTMLInputElement>('input[type="range"][aria-label="Loan amount"]')!.value).toBe("5050000");
    expect(posts).not.toContainEqual(expect.objectContaining({ values: { $amount: 5100000 } }));
  });

  it("keeps two Widgets of a Session apart by their titles", async () => {
    await open(TWO_WIDGETS, {
      "First rates": { values: { $rate: 1 }, ticked: [] },
      "Second rates": { values: { $rate: 8 }, ticked: ["Set the rate to 3%", "Set the rate to 8%"] },
    });
    expect(title()).toBe("Second rates");
    expect(slider().value).toBe("8");
    expect(ticks()).toEqual(["done", "done"]);
    await click(tab("First rates"));
    expect(slider().value).toBe("1");
    expect(ticks()).toEqual(["current", "todo"]);
  });
});

describe("the Learner's work on a Widget", () => {
  it("is kept when they switch to another Widget's tab and back", async () => {
    await open(TWO_WIDGETS);
    await setRate(3);
    expect(ticks()).toEqual(["done", "current"]);
    await click(tab("First rates"));
    expect(title()).toBe("First rates");
    expect(slider().value).toBe("5");
    await click(tab("Second rates"));
    expect(slider().value).toBe("3");
    expect(ticks()).toEqual(["done", "current"]);
  });

  it("is saved with the Session under the Widget's title, for a reload to draw", async () => {
    await open(TWO_WIDGETS);
    await setRate(3);
    await afterSaving();
    expect(posts.at(-1)).toEqual({ sessionId: 7, widgetKey: "Second rates", values: { $rate: 3 }, ticked: ["Set the rate to 3%"] });
    // A reload draws what was saved.
    act(() => root.unmount());
    root = createRoot(host);
    await open(TWO_WIDGETS, { "Second rates": posts.at(-1) as WidgetStates[string] });
    expect(slider().value).toBe("3");
    expect(ticks()).toEqual(["done", "current"]);
  });

  it("waits for the Session before the first turn has made it, then saves to it", async () => {
    await open(TWO_WIDGETS, undefined, null);
    await setRate(3);
    await afterSaving();
    expect(posts).toEqual([]);
    await open(TWO_WIDGETS, undefined, 9);
    await afterSaving();
    expect(posts.at(-1)).toEqual({ sessionId: 9, widgetKey: "Second rates", values: { $rate: 3 }, ticked: ["Set the rate to 3%"] });
  });
});

describe("what the Tutor is sent of the Widgets", () => {
  const tellButton = () => host.querySelector<HTMLButtonElement>('[data-testid="tell-the-tutor"]');

  it("goes with a chip's message: the slider values and ticks the page has now, before any save", async () => {
    await open(TWO_WIDGETS);
    await setRate(3);
    const chip = [...host.querySelectorAll<HTMLButtonElement>('[data-testid="choice"]')][0];
    await click(chip);
    expect(turns.at(-1)).toMatchObject({ message: "Show me.", widgets: { "Second rates": { values: { $rate: 3 }, ticked: ["Set the rate to 3%"] } } });
  });

  it("offers Tell the Tutor what I found the moment the last Guided Task ticks, and pressing it sends a widget report", async () => {
    await open(TWO_WIDGETS);
    await setRate(3);
    expect(tellButton()).toBeNull();
    await setRate(8);
    expect(tellButton()?.textContent).toBe("Tell the Tutor what I found →");
    await click(tellButton()!);
    expect(turns.at(-1)).toMatchObject({ widgetReport: "Second rates", widgets: { "Second rates": { values: { $rate: 8 } } } });
    // Code writes the message: no Learner bubble is drawn for it.
    expect(host.textContent).not.toContain("I set");
  });
});

describe("the explore Widget at the reveal", () => {
  // At the reveal the page hands the explore Widget its code with the reveal task added (writtenAheadFor), which is
  // not the old code with more after it, so the Widget is drawn afresh: it must start from the Learner's work so far.
  const before = rates("What the annuity is worth today");
  const revealed = `${before.replace("GuidedTasks([t1, t2])", "GuidedTasks([t1, t2, revealTask])")}\nrevealTask = GuidedTask("Set the rate to 3.25%", $rate == 3.25)`;

  async function exploreWith(code: string) {
    await act(async () => {
      root.render(
        <Conversation
          initial={[]}
          quiz={null}
          pending={null}
          review={noReview}
          place={{ stage: "foundation", title: "Present value" }}
          shown={{ sessionId: 7 }}
          explore={{ id: "annuity-worth-today", code }}
        />,
      );
    });
  }

  it("keeps the rate the Learner set and the tasks they ticked when the reveal task joins it", async () => {
    await exploreWith(before);
    await setRate(3);
    expect(ticks()).toEqual(["done", "current"]);
    await exploreWith(revealed);
    expect(slider().value).toBe("3");
    expect(ticks()).toEqual(["done", "current", "todo"]);
  });
});
