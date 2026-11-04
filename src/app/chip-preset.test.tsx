// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WIDGET_OPENED, type WrittenAhead } from "@/course/written-ahead";
import { recipeById } from "@/widgets/recipes";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { widgetsIn, type ThreadLine } from "./thread";
import { WidgetChip } from "./widget-panel";
import { useWidgetStates, WidgetStatesProvider, type WidgetStore } from "./widget-states";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Ready-made Widgets are opened already set (spec #229, ticket #242): the Widget item records its preset, and pressing an
// earlier chip puts those numbers back in the Widget store, so the chip reopens the numbers it was opened with.

const code = [
  'root = Widget("What the annuity is worth today", [rate, years])',
  "$rate = 5",
  "$years = 30",
  'rate = Slider("rate", "Discount rate", 0, 10, 0.01, $rate, "percent")',
  'years = Slider("years", "Years", 1, 30, 1, $years, "years")',
].join("\n");
const ahead: WrittenAhead[] = [{ id: "annuity-worth-today", title: "What the annuity is worth today", code }];

const lines: ThreadLine[] = [
  { id: "m0", role: "user", text: "Show me at 4%" },
  { id: "i1", role: "item", kind: WIDGET_OPENED, data: { id: "annuity-worth-today", title: "What the annuity is worth today", preset: { $rate: 4 } } },
  { id: "m2", role: "assistant", text: "At four percent." },
  { id: "m3", role: "user", text: "And at 9%?" },
  { id: "i4", role: "item", kind: WIDGET_OPENED, data: { id: "annuity-worth-today", title: "What the annuity is worth today", preset: { $rate: 9 } } },
  { id: "m5", role: "assistant", text: "At nine percent." },
];

let root: Root;
let host: HTMLElement;
let store!: WidgetStore;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("a Widget item's preset in the browser", () => {
  it("widgetsIn carries the preset of an opened Widget (over its declared settings), and the declared settings of a shown one", () => {
    const [first, second] = widgetsIn(lines, false, ahead);
    expect(first.preset).toEqual({ $rate: 4, $years: 30 });
    expect(second.preset).toEqual({ $rate: 9, $years: 30 });
    const built = recipeById("grow_money")!.build({
      title: "A SIP",
      inputs: { calculator: "sip", currency: "inr", held: { monthly: 1000, ratePercent: 10 }, slider: { input: "years", label: "Years", unit: "years", min: 1, max: 30, step: 1, start: 10 } },
      refs: {},
      facts: {},
    });
    if (!built.ok) throw new Error(built.error);
    const [shown] = widgetsIn([{ id: "s1", role: "item", kind: WIDGET_SHOWN, data: { id: "t", recipe: "grow_money", params: {}, title: built.title, code: built.code, source: "recipe" } }]);
    expect(shown.preset).toEqual({ $years: 10 });
  });

  it("an opened Widget without a preset carries none", () => {
    const [widget] = widgetsIn([{ id: "i1", role: "item", kind: WIDGET_OPENED, data: { id: "annuity-worth-today", title: "x" } }], false, ahead);
    expect(widget.preset).toBeUndefined();
  });
});

describe("pressing an earlier chip", () => {
  const Probe = () => {
    const s = useWidgetStates(7, { "annuity-worth-today": { values: { $rate: 9, $years: 30 }, ticked: [] } });
    useEffect(() => {
      store = s;
    }, [s]);
    const [first] = widgetsIn(lines, false, ahead);
    return (
      <WidgetStatesProvider store={s}>
        <WidgetChip item={first} active={false} onPick={() => {}} />
      </WidgetStatesProvider>
    );
  };

  it("puts that Widget's own numbers back in the Widget store, and picks the Widget", async () => {
    await act(async () => root.render(<Probe />));
    expect(store.saved("annuity-worth-today")?.values).toEqual({ $rate: 9, $years: 30 });
    const revision = store.revision("annuity-worth-today");
    await act(async () => host.querySelector<HTMLElement>('[data-testid="widget-chip"]')!.click());
    expect(store.saved("annuity-worth-today")?.values).toEqual({ $rate: 4, $years: 30 });
    expect(store.revision("annuity-worth-today")).toBe(revision + 1);
  });

  it("does nothing to the store for a chip with no preset", async () => {
    const plain = { key: "m:0", number: 1, code, complete: true, writtenAhead: "annuity-worth-today" };
    const Plain = () => {
      const s = useWidgetStates(7, { "annuity-worth-today": { values: { $rate: 9, $years: 30 }, ticked: [] } });
      useEffect(() => {
        store = s;
      }, [s]);
      return (
        <WidgetStatesProvider store={s}>
          <WidgetChip item={plain} active={false} onPick={() => {}} />
        </WidgetStatesProvider>
      );
    };
    await act(async () => root.render(<Plain />));
    await act(async () => host.querySelector<HTMLElement>('[data-testid="widget-chip"]')!.click());
    expect(store.saved("annuity-worth-today")?.values).toEqual({ $rate: 9, $years: 30 });
  });
});
