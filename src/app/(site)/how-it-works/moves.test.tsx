// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HowMoves } from "./moves";

// How it works' moves (Signal spec 7.3) in a browser-like page: each move's body plays with no request.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const fetchSpy = vi.fn();

beforeEach(async () => {
  vi.stubGlobal("fetch", fetchSpy);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<HowMoves />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === name)!;
const click = (el: HTMLElement) => act(async () => el.click());

describe("How it works' moves", () => {
  it("show four moves with a rail button each, and the Amazon story with its facts", () => {
    expect([...host.querySelectorAll("article h2")].map((h) => h.textContent)).toEqual(["Hear the story", "Learn the lingo", "Try it", "Value it"]);
    expect([...host.querySelectorAll(".v-rail button")].map((b) => b.textContent)).toEqual(["Hear the story", "Learn the lingo", "Try it", "Value it"]);
    expect(host.querySelector(".v-rail")?.textContent).toContain("Running example: Amazon, Feb 2000");
    expect(host.querySelector("#move-1 .v-dateline")?.textContent).toBe("February 2000.");
    expect(host.querySelector("#move-1 .v-facts")?.textContent).toContain("$1,117M");
  });

  it("turn the lingo card from price to value", async () => {
    expect(host.querySelector(".v-lingo-term")?.textContent).toBe("price");
    await click(button("value"));
    expect(host.querySelector(".v-lingo-term")?.textContent).toBe("value");
    expect(host.querySelector(".v-lingo")?.textContent).toContain("His story values the shares at $35.");
  });

  it("mark a wrong call with Not quite and its idea, then the right one with Right", async () => {
    await click(button("A price"));
    const feedback = host.querySelector(".v-call-feedback")!;
    expect(feedback.textContent).toContain("Not quite");
    expect(feedback.textContent).toContain("$35 is what his story says a share is worth: a value.");
    expect(button("A price").className).toContain("is-wrong");
    await click(button("A value"));
    expect(feedback.textContent).toContain("Right");
    expect(button("A price").className).not.toContain("is-wrong");
    expect(button("A value").className).toContain("is-right");
  });

  it("reveal what really happened beside the learner's own value", async () => {
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(slider.value).toBe("50");
    await click(button("Reveal what really happened"));
    const facts = host.querySelector("#move-4 .v-facts")!.textContent;
    expect(facts).toContain("Your value$50.00");
    expect(facts).toContain("His value$35.08");
    expect(facts).toContain("Price, 3 Feb 2000$84.00");
    expect(facts).toContain("Low, late 2000$14.88");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
