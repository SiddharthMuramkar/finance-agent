// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Conversation } from "./conversation";

// Appendix B.7: primary is used once per view, for the one thing to do next (#478). The real /study view, drawn whole:
// at the Story step with a StoryScene Widget in the panel and the Next chip under the reply, and again once the
// Learner has typed in the message box. At every moment at most one enabled primary button shows.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };
const NEXT = { kind: "next", step: "concept", label: "Next: Concept", advances: true } as const;
const SCENE = [
  "```openui-lang",
  'root = Widget("Meena\'s month", [scene])',
  'scene = StoryScene([{id: "meena", emoji: "cook", name: "Meena", role: "chai stall owner"}], [{who: "narrator", says: "Meena runs a chai stall.", emoji: "hot-beverage"}, {who: "meena", says: "So the month ended in a loss.", emoji: "worried-face"}], "A month at the stall")',
  "```",
].join("\n");

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
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

const pause = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));

/** The labels of the enabled raised primaries on screen. */
const enabledPrimaries = () =>
  [...host.querySelectorAll<HTMLButtonElement>("button.btn-primary")].filter((b) => !b.disabled).map((b) => b.textContent?.trim());

async function openStoryStep() {
  await act(async () => {
    root.render(
      <Conversation
        initial={[{ role: "assistant", text: `Meena runs a chai stall.\n\n${SCENE}\n\nWhat do you think happened that month?` }]}
        quiz={null}
        pending={null}
        review={noReview}
        next={NEXT}
        place={{ stage: "foundation", title: "Income statement" }}
      />,
    );
  });
  await pause();
}

async function type(words: string) {
  const box = host.querySelector<HTMLTextAreaElement>("textarea[aria-label='Message']")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, words);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await pause();
}

describe("one primary on /study (Appendix B.7, #478)", () => {
  it("at the Story step with a StoryScene Widget, the Next chip is the one enabled primary", async () => {
    await openStoryStep();
    expect(host.querySelector('[data-testid="story-scene"]'), "the StoryScene Widget is drawn").not.toBeNull();
    expect(host.querySelector('[data-testid="story-next"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="next-chip"]')).not.toBeNull();
    expect(enabledPrimaries()).toEqual(["Next: Concept →"]);
  });

  it("on the StoryScene's last beat, Replay is not a second primary", async () => {
    await openStoryStep();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="story-next"]')!.click());
    expect(host.querySelector('[data-testid="story-replay"]')).not.toBeNull();
    expect(enabledPrimaries()).toEqual(["Next: Concept →"]);
  });

  it("once the Learner types, Send is the one enabled primary and the Next chip steps back to secondary", async () => {
    await openStoryStep();
    await type("Was it a loss?");
    expect(enabledPrimaries()).toEqual(["Send"]);
    const next = host.querySelector<HTMLButtonElement>('[data-testid="next-chip"]')!;
    expect(next.classList.contains("btn-secondary")).toBe(true);

    // Emptied again: the Next chip is the main move once more.
    await type("");
    expect(enabledPrimaries()).toEqual(["Next: Concept →"]);
  });
});
