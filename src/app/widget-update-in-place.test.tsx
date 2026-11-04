// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storeOf, useWidgetStates, WidgetStatesProvider, type WidgetStore } from "./widget-states";
import { WidgetWithSave } from "./widget-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A Widget the Tutor updates (a widget_state event) moves its sliders in place and leaves ticked Guided Tasks alone.

const code = [
  'root = Widget("Rates", [rate, steps])',
  "$rate = 5",
  'rate = Slider("rate", "Interest rate", 0, 10, 0.25, $rate, "percent")',
  "steps = GuidedTasks([t1])",
  't1 = GuidedTask("Set the rate to 3%", $rate == 3)',
].join("\n");

let root: Root;
let host: HTMLElement;
let store!: WidgetStore;
const hold = (s: WidgetStore) => {
  store = s;
};

const Probe = () => {
  const s = useWidgetStates(7, { rates: { values: { "$rate": 3 }, ticked: ["Set the rate to 3%"] } });
  useEffect(() => hold(s), [s]);
  const store = s;
  return (
    <WidgetStatesProvider store={store}>
      <WidgetWithSave item={{ code, complete: true, writtenAhead: "rates", key: "k" }} />
    </WidgetStatesProvider>
  );
};
const slider = () => host.querySelector<HTMLInputElement>('input[type="range"][aria-label="Interest rate"]')!;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("widget_state in place", () => {
  it("starts at the saved value", () => {
    expect(slider().value).toBe("3");
  });

  it("moves the slider when the server pushes values, and keeps ticked tasks", async () => {
    await act(async () => store.push("rates", { "$rate": 8 }));
    expect(slider().value).toBe("8");
    expect(store.saved("rates")).toEqual({ values: { "$rate": 8 }, ticked: ["Set the rate to 3%"] });
    expect(store.revision("rates")).toBe(1);
  });

  it("does not remount for a push of the values already shown", async () => {
    await act(async () => store.push("rates", { "$rate": 3 }));
    expect(store.revision("rates")).toBe(0);
  });

  it("replaces a pending save of the same key (one post, with the pushed values)", async () => {
    store.save("rates", { values: { "$rate": 4 } });
    await act(async () => store.push("rates", { "$rate": 9 }));
    await act(async () => void vi.advanceTimersByTime(500));
    const posts = vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(posts).toHaveLength(1);
    expect(posts[0].values).toEqual({ "$rate": 9 });
  });

  it("is reachable from the store's all function (what the turn stream is given)", () => {
    expect(storeOf(store.all)).toBe(store);
    expect(storeOf(undefined)).toBeUndefined();
  });
});
