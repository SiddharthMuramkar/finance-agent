// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider, useAnnounce } from "./announcer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Speaker() {
  const announce = useAnnounce();
  return <button data-say onClick={() => announce("Hello")} />;
}

afterEach(() => vi.useRealTimers());

describe("the announcer timer after unmount", () => {
  it("leaves no timer behind and throws nothing when unmounted before it fires", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<AnnouncerProvider><Speaker /></AnnouncerProvider>));
    act(() => host.querySelector<HTMLButtonElement>("[data-say]")!.click());
    expect(vi.getTimerCount()).toBe(1);
    act(() => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    host.remove();
  });
});
