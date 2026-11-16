// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InsightPick, type InsightPickView } from "./insight-pick";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

// The Insight settled by a tap (#88), for a screen reader too (review F24): the marking and a failed tap land in live
// regions that are there before their text, a network error is said, and the tapped choice says it is the one picked.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PICK: InsightPickView = {
  question: "What had to change?",
  choices: [
    { id: "a", text: "Only a lower cost of capital" },
    { id: "b", text: "Far more sales" },
  ],
};

let root: Root;
let el: HTMLElement;
beforeEach(async () => {
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root.render(<InsightPick pick={PICK} />));
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

const choice = (text: string) => [...el.querySelectorAll<HTMLButtonElement>('[data-testid="insight-pick-choice"]')].find((b) => b.textContent === text)!;
const tap = async (text: string) => act(async () => choice(text).click());

describe("the Insight pick", () => {
  it("has its live regions in place before anything is said", () => {
    expect(el.querySelector('[role="status"]')?.textContent).toBe("");
    expect(el.querySelector('[role="alert"]')?.textContent).toBe("");
  });

  it("says the marking in the status region and marks the tapped choice pressed", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ released: "hint_1", fix: "Not alone.", hint: "Try sales." })));
    await tap("Only a lower cost of capital");
    expect(el.querySelector('[role="status"]')?.textContent).toContain("Not alone.");
    expect(choice("Only a lower cost of capital").getAttribute("aria-pressed")).toBe("true");
    expect(choice("Far more sales").getAttribute("aria-pressed")).toBe("false");
  });

  it("says a tap that could not be sent as an alert, and the choices stay to tap again", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await tap("Far more sales");
    expect(el.querySelector('[role="alert"]')?.textContent).toBe("That tap could not be marked. Try again.");
    expect(choice("Far more sales").disabled).toBe(false);
  });
});
