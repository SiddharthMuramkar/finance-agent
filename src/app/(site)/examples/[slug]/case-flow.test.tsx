// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exampleBySlug } from "@/site/examples";
import { CaseFlow, progressStates } from "./case-flow";

// The case page's flow (Signal spec 7.5, QA rows 19 to 21) on the Amazon example. The widget is the slice's stub, so the
// learner's call is the `signal:call` event a widget sends, or a tap on a chip in its "Your call" fieldset.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const amazon = exampleBySlug("amazon-2000")!;
let root: Root;
let host: HTMLElement;

beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<CaseFlow example={amazon} />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const steps = () => [...host.querySelectorAll(".v-prog li")].map((li) => li.className || "upcoming");
const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
const widget = () => host.querySelector<HTMLElement>('[data-testid="case-widget"] [data-testid="signal-widget"]')!;

describe("the case page's flow", () => {
  it("opens with the answer and the ending locked, at step 2", () => {
    expect(steps()).toEqual(["done", "now", "upcoming", "upcoming"]);
    expect(host.querySelector(".answer")?.textContent).toContain("The Tutor explains after your call.");
    expect(host.querySelector(".ending")?.textContent).toContain("Make your call first. This step shows what happened next.");
    expect(widget().getAttribute("data-case")).toBe("amazon-2000");
  });

  it("shows the answer and a ready ending after the call, at step 3, then reveals what happened", async () => {
    await act(async () => widget().dispatchEvent(new CustomEvent("signal:call", { bubbles: true, detail: { verdict: null } })));
    expect(steps()).toEqual(["done", "done", "now", "upcoming"]);
    expect(host.querySelector(".answer")?.textContent).toContain("Because value comes from the cash it makes later");
    expect(host.querySelector(".ending")?.textContent).toContain("Your call is in. Ready for what happened next?");
    await act(async () => button("Reveal what really happened")!.click());
    expect(steps()).toEqual(["done", "done", "done", "done"]);
    const reveal = host.querySelector('[data-testid="case-reveal"]')!.textContent!;
    for (const figure of ["$35.08", "$91.50", "$14.88"]) expect(reveal).toContain(figure);
    expect(reveal).toContain("Sources: Damodaran’s published valuation of Amazon, 2000.");
  });

  it("counts a chip tap in the widget's Your call as the call", async () => {
    const fieldset = document.createElement("fieldset");
    const chip = document.createElement("button");
    fieldset.append(chip);
    widget().append(fieldset);
    await act(async () => {
      chip.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(steps()).toEqual(["done", "done", "now", "upcoming"]);
  });

  it("skips to the ending with the answer still waiting", async () => {
    await act(async () => button("Skip to the ending")!.click());
    expect(steps()).toEqual(["done", "done", "done", "done"]);
    expect(host.querySelector(".answer")?.textContent).toContain("The Tutor explains after your call.");
    expect(host.querySelector('[data-testid="case-reveal"]')).not.toBeNull();
  });

  it("says the rule the Topic leaves you with for a rule ending", () => {
    expect(progressStates("load")).toEqual(["done", "now", "upcoming", "upcoming"]);
    expect(exampleBySlug("rates-up-1")!.endingKind).toBe("rule");
  });
});
