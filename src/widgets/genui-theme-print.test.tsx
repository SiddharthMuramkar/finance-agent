// @vitest-environment happy-dom
import { Renderer } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenuiTheme } from "./genui-theme";

/** Each series colour in a drawn kit chart, in series order. */
const seriesColours = (html: string) => [...html.matchAll(/stroke="(#[0-9a-f]{6})"/gi)].map((m) => m[1].toLowerCase());

describe("GenuiTheme on paper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.theme;
    document.body.innerHTML = "";
  });

  /** Draws a kit chart client-side with matchMedia stubbed; returns the host and a switch for print. */
  async function drawChart(printing: boolean) {
    const listeners = new Set<(e: { matches: boolean }) => void>();
    const state = { printing };
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() {
        return query === "print" && state.printing;
      },
      media: query,
      addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.delete(fn),
    }));
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    HTMLCanvasElement.prototype.getContext = (() => ({ font: "", measureText: () => ({ width: 10 }) })) as never;
    const host = document.createElement("div");
    document.body.append(host);
    const code = 'root = Stack([c])\nc = LineChart(["a", "b"], [Series("x", [1, 2])])';
    await act(async () => {
      createRoot(host).render(createElement(GenuiTheme, null, createElement(Renderer, { response: code, library: openuiLibrary })));
    });
    return {
      host,
      setPrinting: async (on: boolean) => {
        state.printing = on;
        await act(async () => listeners.forEach((fn) => fn({ matches: on })));
      },
    };
  }

  it("draws charts in the Light palette while printing, even in Dark, and goes back to Dark after", async () => {
    document.documentElement.dataset.theme = "dark";
    const { host, setPrinting } = await drawChart(false);
    expect(seriesColours(host.innerHTML)).toEqual(["#b09af2"]);
    await setPrinting(true);
    expect(seriesColours(host.innerHTML)).toEqual(["#8b5cf6"]);
    await setPrinting(false);
    expect(seriesColours(host.innerHTML)).toEqual(["#b09af2"]);
  });
});
