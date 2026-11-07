// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { YourTopicsSection } from "./your-topics";

// Settings → Your Topics (B3b): the Topics with progress, each with its status Tag and a secondary Start over Button that opens the same confirm.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const topics = [
  { id: "percent", title: "Percent", status: "passed" as const },
  { id: "present-value", title: "Present value", status: "in_progress" as const },
];

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("Your Topics", () => {
  it("is the your-topics section with its heading", () => {
    const html = renderToStaticMarkup(<YourTopicsSection topics={topics} />);
    expect(html).toMatch(/<section[^>]*id="your-topics"[^>]*aria-labelledby="your-topics-heading"/);
    expect(html).toMatch(/<h2[^>]*id="your-topics-heading"[^>]*>Your Topics<\/h2>/);
  });

  it("lists each Topic in the order given with its status Tag and a secondary Start over Button", () => {
    const html = renderToStaticMarkup(<YourTopicsSection topics={topics} />);
    expect(html.indexOf("Percent")).toBeLessThan(html.indexOf("Present value"));
    expect(html).toMatch(/data-affordance="tag"[^>]*>Passed</);
    expect(html).toMatch(/data-affordance="tag"[^>]*>In progress</);
    expect([...html.matchAll(/class="btn btn-secondary[^"]*"[^>]*>Start over</g)]).toHaveLength(2);
    expect(html).not.toContain("btn-danger");
  });

  it("says so when no Topic has progress", () => {
    const html = renderToStaticMarkup(<YourTopicsSection topics={[]} />);
    expect(html).toContain("Topics you start will appear here.");
    expect(html).not.toContain("Start over");
  });

  it("Start over opens the confirm for that Topic only; Cancel closes it", async () => {
    await act(async () => root.render(<YourTopicsSection topics={topics} />));
    const start = [...host.querySelectorAll<HTMLButtonElement>("button")].filter((b) => b.textContent === "Start over");
    await act(async () => start[1].click());
    const forms = host.querySelectorAll("form");
    expect(forms).toHaveLength(1);
    expect(forms[0].getAttribute("action")).toBe("/api/topics/present-value/restart");
    expect(forms[0].textContent).toContain("This clears your Checks and progress for this Topic.");
    await act(async () => [...forms[0].querySelectorAll("button")].find((b) => b.textContent === "Cancel")!.click());
    expect(host.querySelector("form")).toBeNull();
  });

  it("opening the confirm focuses its Cancel; Cancel sends focus back to that Topic's Start over", async () => {
    await act(async () => root.render(<YourTopicsSection topics={topics} />));
    const start = [...host.querySelectorAll<HTMLButtonElement>("button")].filter((b) => b.textContent === "Start over");
    await act(async () => start[1].click());
    const cancel = [...host.querySelector("form")!.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!;
    expect(document.activeElement).toBe(cancel);
    await act(async () => cancel.click());
    expect(host.querySelector("form")).toBeNull();
    expect(document.activeElement).toBe(start[1]);
  });
});
