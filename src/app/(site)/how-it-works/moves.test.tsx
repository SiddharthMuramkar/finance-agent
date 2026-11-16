// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
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
    expect([...host.querySelectorAll("article h2")].map((h) => h.textContent)).toEqual(["Meet the moment", "Learn the lingo", "Try it", "Value it"]);
    expect([...host.querySelectorAll(".v-rail button")].map((b) => b.textContent)).toEqual(["Meet the moment", "Learn the lingo", "Try it", "Value it"]);
    expect(host.querySelector(".v-rail")?.textContent).toContain("Running example: Amazon, Feb 2000");
    expect(host.querySelector("#move-1 .v-dateline")?.textContent).toBe("February 2000.");
    expect(host.querySelector("#move-1 .v-facts")?.textContent).toContain("$1,117M");
  });

  // Signal spec 7.3: the rail marks the move in view. The mark sits on the move's list item (a Button may not carry
  // aria-current: the raised-look gate, css.test.ts), and site.css draws the current look from that same attribute.
  it("mark on the rail the move in view, one at a time, as the page scrolls", async () => {
    const tops = [0, 2000, 3000, 4000];
    host.querySelectorAll<HTMLElement>("article.v-move").forEach((article, i) => {
      article.getBoundingClientRect = () => ({ top: tops[i] }) as DOMRect;
    });
    const current = async () => {
      await act(async () => {
        window.dispatchEvent(new Event("scroll"));
        await new Promise((done) => setTimeout(done, 50));
      });
      return [...host.querySelectorAll('.v-rail li[aria-current="step"]')].map((li) => li.textContent);
    };
    expect(await current()).toEqual(["Meet the moment"]);
    tops[1] = 100;
    expect(await current()).toEqual(["Learn the lingo"]);
    expect(host.querySelector(".v-rail button[aria-current]")).toBeNull();
    expect(readFileSync("src/app/(site)/site.css", "utf8")).toMatch(/\.v-rail li\[aria-current="step"\] button \{[^}]*font-weight: 600/);
  });

  it("turn the lingo card from price to value", async () => {
    expect(host.querySelector(".v-lingo-term")?.textContent).toBe("price");
    await click(button("value"));
    expect(host.querySelector(".v-lingo-term")?.textContent).toBe("value");
    expect(host.querySelector(".v-lingo")?.textContent).toContain("One published valuation puts the shares at $35.");
  });

  it("mark a wrong call with Not quite and its idea, then the right one with Right", async () => {
    await click(button("A price"));
    const feedback = host.querySelector(".v-call-feedback")!;
    expect(feedback.textContent).toContain("Not quite");
    expect(feedback.textContent).toContain("$35 is what one published valuation says a share is worth: a value.");
    expect(button("A price").className).toContain("is-wrong");
    await click(button("A value"));
    expect(feedback.textContent).toContain("Right");
    expect(button("A price").className).not.toContain("is-wrong");
    expect(button("A value").className).toContain("is-right");
  });

  // Its label also holds the <output> showing the value, and an <output> is labelable too: a label with no `for` names its
  // first labelable element, so the slider is named by `for` and its id (9: every control has a name).
  it("name the value slider by its label", () => {
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(slider.id).not.toBe("");
    expect(host.querySelector(`label[for="${slider.id}"]`)?.textContent).toContain("Your value for one share");
  });

  it("reveal what really happened beside the learner's own value", async () => {
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(slider.value).toBe("50");
    await click(button("Reveal what really happened"));
    const facts = host.querySelector("#move-4 .v-facts")!.textContent;
    expect(facts).toContain("Your value$50.00");
    expect(facts).toContain("Published value$35.08");
    expect(facts).toContain("Price, 3 Feb 2000$84.00");
    expect(facts).toContain("Low, late 2000$14.88");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
