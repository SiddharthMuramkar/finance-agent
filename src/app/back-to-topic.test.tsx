// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollBackToTopic } from "./session-item-view";

// The off-topic block's "Back to <Topic>" goes to the step's anchor, else the latest Teaching Step divider, else the end of the thread.

afterEach(() => {
  document.body.innerHTML = "";
});

function spyOn(el: HTMLElement) {
  const scrolled = vi.fn();
  el.scrollIntoView = scrolled;
  return scrolled;
}

describe("scrollBackToTopic", () => {
  it("goes to the anchor when it is on the page", () => {
    document.body.innerHTML = `<div id="step-2"></div><div data-testid="step-divider"></div><button id="from"></button>`;
    const anchor = spyOn(document.getElementById("step-2")!);
    const divider = spyOn(document.querySelector<HTMLElement>('[data-testid="step-divider"]')!);
    scrollBackToTopic("step-2", document.getElementById("from")!);
    expect(anchor).toHaveBeenCalled();
    expect(divider).not.toHaveBeenCalled();
  });

  it("falls back to the latest step divider when the anchor is missing", () => {
    document.body.innerHTML = `<div data-testid="step-divider"></div><div data-testid="step-divider"></div><button id="from"></button>`;
    const [first, last] = [...document.querySelectorAll<HTMLElement>('[data-testid="step-divider"]')].map(spyOn);
    scrollBackToTopic("step-9", document.getElementById("from")!);
    expect(first).not.toHaveBeenCalled();
    expect(last).toHaveBeenCalled();
  });

  it("falls back to the end of the thread when there is no divider either", () => {
    document.body.innerHTML = `<div data-testid="thread-viewport"></div><button id="from"></button>`;
    const viewport = document.querySelector<HTMLElement>('[data-testid="thread-viewport"]')!;
    const scrollTo = vi.fn();
    viewport.scrollTo = scrollTo;
    scrollBackToTopic("step-9", document.getElementById("from")!);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });

  it("scrolls the block itself into view as a last resort", () => {
    document.body.innerHTML = `<button id="from"></button>`;
    const from = document.getElementById("from")!;
    const scrolled = spyOn(from);
    scrollBackToTopic("step-9", from);
    expect(scrolled).toHaveBeenCalled();
  });
});
