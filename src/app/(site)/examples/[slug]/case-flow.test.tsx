// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exampleBySlug } from "@/site/examples";
import { CaseFlow, progressStates } from "./case-flow";

// The case page's flow (Signal spec 7.5, QA rows 19 to 21) on the Amazon example, with the real Signal widget mounted. The
// learner's call is the widget's onCall (spec 5.6): the first preset or lever move in the levers widget, or the first chip
// tap in a widget with a "Your call".

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const amazon = exampleBySlug("amazon-2000")!;
let root: Root;
let host: HTMLElement;

async function mount(example = amazon) {
  await act(async () => root.render(<CaseFlow example={example} />));
}

beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await mount();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const steps = () => [...host.querySelectorAll(".v-prog li")].map((li) => li.className || "upcoming");
const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
const widget = () => host.querySelector<HTMLElement>('[data-testid="case-widget"] [data-widget]')!;

describe("the case page's flow", () => {
  it("opens with the answer and the ending locked, at step 2", () => {
    expect(steps()).toEqual(["done", "now", "upcoming", "upcoming"]);
    expect(host.querySelector(".answer")?.textContent).toContain("The Tutor explains after your call.");
    expect(host.querySelector(".ending")?.textContent).toContain("Make your call first. This step shows what happened next.");
    expect(widget().getAttribute("data-case")).toBe("amazon-2000");
  });

  it("shows the answer and a ready ending after the call, at step 3, then reveals what happened", async () => {
    await act(async () => widget().querySelector<HTMLButtonElement>(".sig-presets button")!.click());
    expect(steps()).toEqual(["done", "done", "now", "upcoming"]);
    expect(host.querySelector(".answer")?.textContent).toContain("Because value comes from the cash it makes later");
    expect(host.querySelector(".ending")?.textContent).toContain("Your call is in. Ready for what happened next?");
    await act(async () => button("Reveal what really happened")!.click());
    expect(steps()).toEqual(["done", "done", "done", "done"]);
    const reveal = host.querySelector('[data-testid="case-reveal"]')!.textContent!;
    for (const figure of ["$35.08", "$91.50", "$14.88"]) expect(reveal).toContain(figure);
    expect(reveal).toContain("Sources: Damodaran’s published valuation of Amazon, 2000.");
  });

  it("counts the first chip tap in a widget's Your call as the call", async () => {
    await mount(exampleBySlug("kerala-bumper-2024")!);
    expect(widget().getAttribute("data-case")).toBe("kerala-bumper-2024");
    expect(steps()).toEqual(["done", "now", "upcoming", "upcoming"]);
    await act(async () => widget().querySelector<HTMLButtonElement>("fieldset button")!.click());
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
    expect(exampleBySlug("rbi-repo-cut-2025")!.endingKind).toBe("rule");
  });

  // #116: the everyday Examples are dated Indian Moments, and the reveal names each Source with its link and the As-of date.
  it.each([
    ["kerala-bumper-2024", "As of 9 Oct 2024.", "https://www.thehindu.com/"],
    ["rbi-repo-cut-2025", "As of 6 Jun 2025.", "https://www.rbi.org.in/"],
  ])("reveals %s with its As-of date and linked Sources", async (slug, asOf, href) => {
    await mount(exampleBySlug(slug)!);
    await act(async () => button("Skip to the ending")!.click());
    const reveal = host.querySelector<HTMLElement>('[data-testid="case-reveal"]')!;
    expect(reveal.textContent).toContain(asOf);
    const links = [...reveal.querySelectorAll<HTMLAnchorElement>("a[href]")];
    expect(links.some((a) => a.href.startsWith(href))).toBe(true);
    for (const a of links) expect(a.getAttribute("rel")).toContain("noopener");
  });
});
