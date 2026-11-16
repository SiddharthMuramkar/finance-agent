// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssignmentTutor } from "./assignment-tutor";

// The AI Tutor in the Assignment (#110), for a screen reader too (review G25): each reply lands in a polite log and each
// problem in an alert, both in place before their text, so a screen reader announces them.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let el: HTMLElement;
beforeEach(async () => {
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root.render(<AssignmentTutor />));
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

const log = () => el.querySelector('[role="log"]')!;
const alert = () => el.querySelector('[role="alert"]')!;

async function ask(message: string) {
  const box = el.querySelector<HTMLTextAreaElement>("#assignment-tutor-message")!;
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setValue.call(box, message);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => el.querySelector("form")!.requestSubmit());
}

describe("the Assignment Tutor's live regions", () => {
  it("has its polite log and its alert in place before anything is said", () => {
    expect(log().getAttribute("aria-live")).toBe("polite");
    expect(log().textContent).toBe("");
    expect(alert().textContent).toBe("");
  });

  it("puts each reply in the log, and clears the problem when a reply comes", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "You have reached today's limit." }), { status: 429 }));
    await ask("What do you make of my figures?");
    expect(alert().textContent).toBe("You have reached today's limit.");

    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ reply: "Your operating margin of 45% is far above.\nWhat story does it assume?" })));
    await ask("And now?");
    expect(log().querySelectorAll('[data-assignment-said="reply"]')).toHaveLength(1);
    expect(log().textContent).toContain("What story does it assume?");
    expect(alert().textContent).toBe("");
  });

  it("says a message that could not be sent as an alert", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await ask("What do you make of my figures?");
    expect(alert().textContent).toBe("The Tutor could not answer. Try again.");
    expect(log().textContent).toBe("");
  });
});
