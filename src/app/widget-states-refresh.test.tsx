// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useWidgetStates, type WidgetStore } from "./widget-states";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// router.refresh() after a turn hands the page a fresh `initial` for the same Session: the Learner's slider values stay.
describe("Widget state across a router.refresh()", () => {
  it("keeps the same store and the Learner's values when the page re-reads the same Session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    let store!: WidgetStore;
    const Probe = ({ initial }: { initial: Record<string, { values: Record<string, number>; ticked: string[] }> }) => {
      store = useWidgetStates(7, initial);
      return null;
    };
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe initial={{ w: { values: { rate: 3 }, ticked: [] } }} />));
    const first = store;
    first.save("w", { values: { rate: 5 } });
    await act(async () => root.render(<Probe initial={{ w: { values: { rate: 3 }, ticked: [] } }} />));
    expect(store).toBe(first);
    expect(store.saved("w")?.values).toEqual({ rate: 5 });
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });
});
