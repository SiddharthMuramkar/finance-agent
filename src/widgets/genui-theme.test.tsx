import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Renderer } from "@openuidev/react-lang";
import { openuiLibrary, useTheme } from "@openuidev/react-ui";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CHART_PALETTE, CHART_SERIES, CHART_SURFACES, FONT, GENUI_THEME, GenuiTheme, kitVariable, rootDeclarations } from "./genui-theme";
import { widgetLibrary } from "./library";

const kitStylesheet = readFileSync(createRequire(import.meta.url).resolve("@openuidev/react-ui/layered/styles/index.css"), "utf8");

/** Each series colour in a server-drawn kit chart, in series order. */
const seriesColours = (html: string) => [...html.matchAll(/--color-[\w-]+:(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());

/** A LineChart from OpenUI's own library with these series, drawn inside GenuiTheme. */
function kitChart(...series: string[]): string {
  const code = `root = Stack([c])\nc = LineChart(["a", "b"], [${series.join(", ")}])`;
  return renderToStaticMarkup(
    <GenuiTheme>
      <Renderer response={code} library={openuiLibrary} />
    </GenuiTheme>,
  );
}

/** What the kit's components read from the theme. */
function ThemeReport() {
  const { theme, mode } = useTheme();
  return <p data-mode={mode} data-ink={theme.textNeutralPrimary} data-font={theme.textBodyDefault} data-weight-axis={theme.fontVariationRegular} />;
}

describe("OpenUI's kit drawn in our tokens", () => {
  // The kit hands colours out from the middle of the list (getDistributedColors), so these name the picks for the
  // four-colour list: one series index 2 (blue), two series indexes 1 and 3 (ink, muted), three series indexes 1 to 3.
  it("draws one series in our blue, not the kit's", () => {
    const html = kitChart('Series("x", [1, 2])');
    expect(seriesColours(html)).toEqual(["#1f3fae"]);
    expect(html).not.toMatch(/#42a5f5/i);
  });

  it("gives two and three series colours from our list, in its order", () => {
    expect(seriesColours(kitChart('Series("x", [1, 2])', 'Series("y", [2, 3])'))).toEqual(["#0b0d12", "#5f6571"]);
    expect(seriesColours(kitChart('Series("x", [1, 2])', 'Series("y", [2, 3])', 'Series("z", [3, 4])'))).toEqual(["#0b0d12", "#1f3fae", "#5f6571"]);
  });

  it("is light on the server, with the kit's text in our ink and its type in our font", () => {
    const html = renderToStaticMarkup(
      <GenuiTheme>
        <ThemeReport />
      </GenuiTheme>,
    );
    expect(html).toContain('data-mode="light"');
    expect(html).toContain('data-ink="var(--ink)"');
    expect(html).toMatch(/data-font="400 16px\/1\.5 var\(--font-text, system-ui\), -apple-system/);
    expect(html).not.toContain("Inter");
    expect(html).toContain('data-weight-axis="normal"');
  });

  it("puts the kit's colours on the widget's wrapper, so a widget drawn on the server reads right before the page is live", () => {
    const html = renderToStaticMarkup(
      <GenuiTheme>
        <p>widget</p>
      </GenuiTheme>,
    );
    expect(html).toMatch(/^<div class="genui" style="[^"]*--openui-text-neutral-primary:var\(--ink\)/);
    expect(html).toMatch(/style="[^"]*--openui-border-default:var\(--border\)/);
  });

  it("sets only variables the kit's stylesheet reads", () => {
    for (const [key, value] of Object.entries(GENUI_THEME)) {
      if (Array.isArray(value)) continue; // chart palettes are read in code, not from CSS
      expect(kitStylesheet, key).toContain(`${kitVariable(key)}:`);
    }
  });

  it("keeps the kit's colours at :root in globals.css, equal to the widget wrapper's, so popovers agree", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const block = css.split(":root {").slice(1).map((rest) => rest.slice(0, rest.indexOf("}"))).find((b) => b.includes("--openui-")) ?? "";
    const declared = Object.fromEntries([...block.matchAll(/(--openui-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    expect(declared).toEqual(rootDeclarations());
  });

  it("the kit's callouts carry no family or accent fill", () => {
    const root = rootDeclarations();
    for (const family of ["info", "success", "alert", "danger"]) {
      expect(root[`--openui-${family}-background`], family).toBe("transparent");
      expect(root[`--openui-text-${family}-primary`], family).toBe("var(--ink)");
    }
    expect(root["--openui-border-info"]).toBe("var(--line)");
    expect(root["--openui-border-success"]).toBe("var(--gain)");
    expect(root["--openui-border-alert"]).toBe("var(--wait)");
    expect(root["--openui-border-danger"]).toBe("var(--loss)");
  });

  /** Every token of the :root block that sets the page's colours (--paper), with var(--other) followed to its literal. */
  const tokens = (() => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const block = css.split(":root {").slice(1).map((rest) => rest.slice(0, rest.indexOf("}"))).find((b) => b.includes("--paper:")) ?? "";
    const raw = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().toLowerCase()]));
    const resolve = (name: string, depth = 0): string | undefined => {
      const value = raw[name];
      const next = value?.match(/^var\(--([\w-]+)\)$/)?.[1];
      return next && depth < 8 ? resolve(next, depth + 1) : value;
    };
    return resolve;
  })();
  /** WCAG 2 contrast ratio of two hex colours. */
  const contrast = (a: string, b: string) => {
    const lum = (hex: string) =>
      [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  // WCAG 2.2 SC 1.4.11: a chart series' mark is needed to read the chart, and a legend does not exempt it, so every series
  // reaches 3:1 against the surface the chart sits on.
  it("paints each chart series in its token, at least 3:1 against the chart surface", () => {
    expect(CHART_PALETTE).toEqual(CHART_SERIES.map((token) => tokens(token)));
    for (const surface of CHART_SURFACES) {
      const under = tokens(surface)!;
      for (const colour of CHART_PALETTE) expect(contrast(colour, under), `${colour} on --${surface}`).toBeGreaterThanOrEqual(3);
    }
  });

  // Decision #17, spec §2.1: one theme, one palette; blue in the middle (one series is yours), neutrals around it, and no
  // green or red standing for a plain series.
  it("kit follows the tokens: one theme, and the chart series run line-strong, ink, blue, muted", () => {
    expect(GENUI_THEME.defaultChartPalette).toEqual(["#868c97", "#0b0d12", "#1f3fae", "#5f6571"]);
    for (const token of ["gain", "loss", "wait", "mint", "coral"]) expect(CHART_PALETTE, token).not.toContain(tokens(token));
  });

  it("sets Widgets in the app's Inter", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    expect(css).not.toContain("--font-widget");
    expect(css).not.toMatch(/\.genui \{\s*font-family/);
    expect(css).toContain(`font-family: ${FONT};`);
    expect(GENUI_THEME.fontWeightMedium).toBe("500");
    expect(GENUI_THEME.fontWeightBold).toBe("500");
    expect(GENUI_THEME.fontWeightHeavy).toBe("500");
    for (const [key, value] of Object.entries(GENUI_THEME)) {
      if (typeof value !== "string" || !/^text(?:Body|Heading|Label|Numbers|Code)/.test(key)) continue;
      expect(value, key).toMatch(/^(400|500) /);
      if (value.includes("SFMono")) expect(value).toContain("monospace");
      else expect(value).toContain(FONT);
    }
  });

  it("maps the kit's formerly fixed black and white colours to ink and the learner's bubble", () => {
    const root = rootDeclarations();
    expect(root["--openui-highlight"]).toBe("color-mix(in srgb, var(--ink) 4%, transparent)");
    expect(root["--openui-highlight-intense"]).toBe("color-mix(in srgb, var(--ink) 30%, transparent)");
    expect(root["--openui-inverted-background"]).toBe("var(--ink)");
    expect(root["--openui-chat-user-response-bg"]).toBe("var(--bubble)");
    expect(root["--openui-border-interactive-emphasis"]).toBe("color-mix(in srgb, var(--ink) 40%, transparent)");
    expect(root["--openui-text-accent-secondary"]).toBe("color-mix(in srgb, var(--brand-ink) 70%, transparent)");
  });

  // The widget library's kit components see GenuiTheme only when they come from "@openuidev/react-ui" itself:
  // its "/genui-lib" entry bundles a private copy of the theme context, and its charts stay in the kit's blue.
  // (LineChart, AreaChart and BarChart are drawn by the plot kit, in the plot palette, so a chart the kit still draws stands in.)
  it.skipIf(!("RadarChart" in widgetLibrary.components))("draws a kit chart in a widget in our palette", () => {
    const code = 'root = Widget("Illustration: two points", [c])\nc = RadarChart(["a", "b", "c"], [Series("x", [1, 2, 3])])';
    const html = renderToStaticMarkup(
      <GenuiTheme>
        <Renderer response={code} library={widgetLibrary} />
      </GenuiTheme>,
    );
    expect(seriesColours(html), 'import the kit from "@openuidev/react-ui", not "@openuidev/react-ui/genui-lib"').toEqual(["#1f3fae"]);
  });
});
