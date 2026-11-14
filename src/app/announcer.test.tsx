// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider, useAnnounce } from "./announcer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

function Says({ words }: { words: string }) {
  const announce = useAnnounce();
  return <button onClick={() => announce(words)}>say</button>;
}

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const region = () => host.querySelector('[data-testid="app-announcer"]')!;

describe("the app announcer", () => {
  it("is one polite live region, and says what it is told", () => {
    act(() => root.render(<AnnouncerProvider><Says words="Saved to notes" /></AnnouncerProvider>));
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(region().getAttribute("aria-live")).toBe("polite");
    act(() => host.querySelector("button")!.click());
    act(() => void vi.advanceTimersByTime(100));
    expect(region().textContent).toBe("Saved to notes");
  });

  it("announces the same words again: the region is emptied before it is filled", () => {
    act(() => root.render(<AnnouncerProvider><Says words="Saved to notes" /></AnnouncerProvider>));
    const press = () => act(() => host.querySelector("button")!.click());
    press();
    act(() => void vi.advanceTimersByTime(100));
    expect(region().textContent).toBe("Saved to notes");
    press();
    expect(region().textContent).toBe("");
    act(() => void vi.advanceTimersByTime(100));
    expect(region().textContent).toBe("Saved to notes");
  });

  it("does nothing outside a provider", () => {
    act(() => root.render(<Says words="x" />));
    expect(() => act(() => host.querySelector("button")!.click())).not.toThrow();
  });
});
