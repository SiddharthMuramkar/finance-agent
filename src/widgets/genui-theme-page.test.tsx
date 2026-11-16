// @vitest-environment happy-dom
import { useTheme } from "@openuidev/react-ui";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GenuiTheme } from "./genui-theme";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Charts take their colours from the page's theme (ADR 0019): the kit's chart palette is each CHART_SERIES token as the
// page resolves it now, so a theme that re-steps a token re-colours every chart.

/** The palette the kit's charts read from the theme, shown as an attribute. */
function PaletteReport() {
  const { theme } = useTheme();
  return <p data-palette={(theme.defaultChartPalette ?? []).join(" ")} />;
}

let root: Root;
let host: HTMLElement;
const html = document.documentElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  html.removeAttribute("style");
  html.removeAttribute("data-theme");
});

/** Sets the four series tokens on <html>, as a theme's token block would. */
const paint = (series: [string, string, string, string]) =>
  ["line-strong", "ink", "blue", "muted"].forEach((token, i) => html.style.setProperty(`--${token}`, series[i]));
const palette = () => host.querySelector("p")?.getAttribute("data-palette");

describe("a kit chart's colours", () => {
  it("are the page's series tokens", async () => {
    paint(["#868c97", "#0b0d12", "#1f3fae", "#5f6571"]);
    await act(async () => root.render(<GenuiTheme><PaletteReport /></GenuiTheme>));
    expect(palette()).toBe("#868c97 #0b0d12 #1f3fae #5f6571");
  });

  it("follow the page when its theme changes", async () => {
    paint(["#868c97", "#0b0d12", "#1f3fae", "#5f6571"]);
    await act(async () => root.render(<GenuiTheme><PaletteReport /></GenuiTheme>));
    await act(async () => {
      paint(["#7d8592", "#f2f4f8", "#8aa4ff", "#a3a9b4"]);
      html.setAttribute("data-theme", "dark");
      await new Promise((done) => setTimeout(done, 0));
    });
    expect(palette()).toBe("#7d8592 #f2f4f8 #8aa4ff #a3a9b4");
  });
});
