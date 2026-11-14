// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const tracked = vi.hoisted(() => vi.fn());
vi.mock("@vercel/analytics", () => ({ track: tracked }));

import { recipeById } from "@/widgets/recipes";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import type { ThreadLine } from "./thread";
import { useWidgetHost, WidgetHost, withSources } from "./widget-host";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const built = recipeById("history_case")!.build({ title: "Gold in rupees", inputs: {}, refs: { dataset: "reference/gold-inr-10g" }, facts: {} });
if (!built.ok) throw new Error(built.error);
const shownData = (source: string) => ({ id: "toolu_1", recipe: "history_case", params: {}, title: built.title, code: built.code, source });
const lines = (source: string): ThreadLine[] => [
  { id: "m0", role: "user", text: "Show me gold" },
  { id: "i1", role: "item", kind: WIDGET_SHOWN, data: shownData(source) },
];

function Harness({ messages }: { messages: ThreadLine[] }) {
  const host = useWidgetHost({ messages, running: false, explore: null });
  return <WidgetHost host={host} />;
}

afterEach(() => {
  vi.unstubAllEnvs();
  tracked.mockReset();
  document.body.innerHTML = "";
});

describe("Widget timing lane", () => {
  it("withSources tags a shown Widget with its source and leaves the rest alone", () => {
    const widgets = [{ key: "i1:0", number: 1, code: built.code, complete: true }];
    expect(withSources(widgets, lines("compose"))[0].source).toBe("compose");
    expect(withSources(widgets, [])[0].source).toBeUndefined();
  });

  it("widget_first_pixel carries the shown item's source as its lane", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    await act(async () => root.render(<Harness messages={lines("recipe")} />));
    const pixel = tracked.mock.calls.find((c) => c[0] === "widget_first_pixel");
    expect(pixel?.[1]).toMatchObject({ lane: "recipe" });
    await act(async () => root.unmount());
  });
});
