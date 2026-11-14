// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tracked = vi.hoisted(() => vi.fn());
vi.mock("@vercel/analytics", () => ({ track: tracked }));

import { DRAWING_TIMEOUT_MS, WidgetChip, WidgetRetryContext, type WidgetItem } from "./widget-panel";
import { track } from "./analytics";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const item = (complete: boolean): WidgetItem => ({ key: "m:0", number: 1, code: 'root = Widget("Rates", [])', complete });
const chip = () => host.querySelector('[data-testid="widget-chip"]');

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
  vi.unstubAllEnvs();
});

describe("12 second chip guard", () => {
  it("keeps drawing until 12 seconds, then offers Retry instead of a spinner", async () => {
    await act(async () => root.render(<WidgetChip item={item(false)} active={false} onPick={() => {}} />));
    await act(async () => void vi.advanceTimersByTime(DRAWING_TIMEOUT_MS - 1));
    expect(chip()?.getAttribute("data-state")).toBe("drawing");
    await act(async () => void vi.advanceTimersByTime(2));
    expect(chip()).toBeNull();
    expect(host.textContent).toContain("did not arrive");
    expect(host.querySelector('[data-testid="widget-retry"]')).not.toBeNull();
  });

  it("Retry asks the page to draw it again and waits another 12 seconds", async () => {
    const again = vi.fn();
    await act(async () =>
      root.render(
        <WidgetRetryContext.Provider value={again}>
          <WidgetChip item={item(false)} active={false} onPick={() => {}} />
        </WidgetRetryContext.Provider>,
      ),
    );
    await act(async () => void vi.advanceTimersByTime(DRAWING_TIMEOUT_MS + 1));
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="widget-retry"]')!.click());
    expect(again).toHaveBeenCalledWith("m:0");
    expect(chip()?.getAttribute("data-state")).toBe("drawing");
  });

  it("a Widget that arrives in time never times out", async () => {
    await act(async () => root.render(<WidgetChip item={item(false)} active={false} onPick={() => {}} />));
    await act(async () => void vi.advanceTimersByTime(5000));
    await act(async () => root.render(<WidgetChip item={item(true)} active={false} onPick={() => {}} />));
    await act(async () => void vi.advanceTimersByTime(20000));
    expect(chip()?.getAttribute("data-state")).toBe("idle");
  });
});

describe("analytics wrapper", () => {
  it("does nothing under tests and never throws", () => {
    tracked.mockReset();
    tracked.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => track("widget_timeout", { lane: "fence" })).not.toThrow();
    expect(tracked).not.toHaveBeenCalled();
  });

  it("passes the event name and props to Vercel outside tests, and swallows its errors", () => {
    vi.stubEnv("NODE_ENV", "production");
    tracked.mockReset();
    track("turn_first_text", { ms: 420 });
    expect(tracked).toHaveBeenCalledWith("turn_first_text", { ms: 420 });
    tracked.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => track("widget_fallback", { recipe: "x" })).not.toThrow();
  });
});
