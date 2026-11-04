// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chips } from "./workspace-parts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("the Next and help chips", () => {
  it("show a spinner on the chip pressed and hold the others still, sending once", () => {
    const onNext = vi.fn();
    const onSay = vi.fn();
    act(() => root.render(<Chips offer={{ kind: "next", step: "concept", label: "Next: Concept", advances: true }} onNext={onNext} onSay={onSay} />));
    const next = host.querySelector<HTMLButtonElement>('[data-testid="next-chip"]')!;
    expect(next.getAttribute("aria-busy")).toBeNull();
    act(() => next.click());
    act(() => next.click());
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(next.getAttribute("aria-busy")).toBe("true");
    expect(next.querySelector('[data-testid="spinner"]')).not.toBeNull();
    for (const chip of host.querySelectorAll<HTMLButtonElement>('[data-testid="help-chip"]')) expect(chip.disabled).toBe(true);
  });

  it("do the same for a help chip, which still posts its words", () => {
    const onSay = vi.fn();
    act(() => root.render(<Chips offer={null} onNext={() => {}} onSay={onSay} />));
    const [first] = host.querySelectorAll<HTMLButtonElement>('[data-testid="help-chip"]');
    act(() => first.click());
    expect(onSay).toHaveBeenCalledWith("Go deeper.");
    expect(first.getAttribute("aria-busy")).toBe("true");
  });
});
