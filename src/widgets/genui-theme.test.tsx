import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Renderer } from "@openuidev/react-lang";
import { openuiLibrary, useTheme } from "@openuidev/react-ui";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { THEMES } from "@/app/theme";
import { CHART_PALETTES, CHART_SERIES, CHART_SURFACES, GENUI_THEMES, GenuiTheme, kitVariable, rootDeclarations } from "./genui-theme";
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
  // six-colour Light list: one series index 3, two series indexes 2 and 4, three series indexes 2 to 4.
  it("draws one series in our palette, not the kit's blue", () => {
    const html = kitChart('Series("x", [1, 2])');
    expect(seriesColours(html)).toEqual(["#8b5cf6"]);
    expect(html).not.toMatch(/#42a5f5/i);
  });

  it("gives two and three series colours from our list, in its order", () => {
    expect(seriesColours(kitChart('Series("x", [1, 2])', 'Series("y", [2, 3])'))).toEqual(["#8a5a00", "#bd2f1e"]);
    expect(seriesColours(kitChart('Series("x", [1, 2])', 'Series("y", [2, 3])', 'Series("z", [3, 4])'))).toEqual(["#8a5a00", "#8b5cf6", "#bd2f1e"]);
  });

  it("is light on the server, with the kit's text in our ink and its type in our font", () => {
    const html = renderToStaticMarkup(
      <GenuiTheme>
        <ThemeReport />
      </GenuiTheme>,
    );
    expect(html).toContain('data-mode="light"');
    expect(html).toContain('data-ink="var(--ink)"');
    expect(html).toMatch(/data-font="[^"]*-apple-system, system-ui/);
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

  it("sets only variables the kit's stylesheet reads, in every theme", () => {
    for (const theme of Object.values(GENUI_THEMES)) {
      for (const [key, value] of Object.entries(theme)) {
        if (Array.isArray(value)) continue; // chart palettes are read in code, not from CSS
        expect(kitStylesheet, key).toContain(`${kitVariable(key)}:`);
      }
    }
  });

  it("keeps the kit's colours at :root in globals.css, equal to the widget wrapper's, so popovers and the dark class agree", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const block = css.match(/:root,\s*:root\.dark \{([^}]*)\}/)?.[1] ?? "";
    const declared = Object.fromEntries([...block.matchAll(/(--openui-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    expect(declared).toEqual(rootDeclarations());
  });

  it("maps the callout families to the accents: mint for success, sunflower for alerts, coral for danger, blue for info", () => {
    const root = rootDeclarations();
    expect(root["--openui-text-info-primary"]).toBe("var(--brand)");
    expect(root["--openui-text-success-primary"]).toBe("var(--mint-ink)");
    expect(root["--openui-text-alert-primary"]).toBe("var(--sun-ink)");
    expect(root["--openui-text-danger-primary"]).toBe("var(--coral-ink)");
    for (const family of ["info", "success", "alert", "danger"]) {
      expect(root[`--openui-${family}-background`], family).toBeDefined();
      expect(root[`--openui-border-${family}`], family).toBeDefined();
      expect(root[`--openui-border-${family}-emphasis`], family).toBeDefined();
    }
  });

  /** The declarations of one theme's block in globals.css: Light's is the plain :root block, the others are named by data-theme. */
  const themeBlock = (id: string) => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const selector = id === "light" ? ":root" : ":root.dark";
    // The block that sets the page's colours (--bg); the kit's mapping block at :root.dark does not.
    const blocks = css.split(`${selector} {`).slice(1).map((rest) => rest.slice(0, rest.indexOf("}")));
    return (blocks.find((block) => block.includes("--bg:")) ?? "").toLowerCase();
  };

  it("takes every chart colour of each theme from that theme's own block in globals.css", () => {
    for (const id of THEMES) {
      const block = themeBlock(id);
      for (const colour of CHART_PALETTES[id]) {
        expect(block, `${id} ${colour}`).toContain(colour);
      }
    }
  });

  /** A token's literal hex in one theme's block. */
  const tokenHex = (block: string, token: string) => new RegExp(`--${token}:\\s*(#[0-9a-f]{6})`).exec(block)?.[1];
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

  // Issue #457, WCAG 2.2 SC 1.4.11: a chart series' mark is needed to read the chart, and a legend does not exempt it, so
  // every series reaches 3:1 against the surface the chart sits on. Light's mint, sunflower and coral fills do not (1.5 to
  // 2.6:1), so Light's series take their -ink tokens; in Dark each -ink is its fill.
  it("paints each chart series in its token, at least 3:1 against the chart surface in both themes", () => {
    for (const id of THEMES) {
      const block = themeBlock(id);
      expect(CHART_PALETTES[id], id).toEqual(CHART_SERIES.map((token) => tokenHex(block, token)));
      for (const surface of CHART_SURFACES) {
        const under = tokenHex(block, surface)!;
        for (const colour of CHART_PALETTES[id]) expect(contrast(colour, under), `${id}: ${colour} on --${surface}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("kit follows the tokens: two themes, and Light's chart series run brand-main, mint-ink, sun-ink, violet, coral-ink", () => {
    expect(Object.keys(GENUI_THEMES).sort()).toEqual(["dark", "light"]);
    expect(GENUI_THEMES.light.defaultChartPalette!.slice(0, 5)).toEqual(["#2f5bea", "#0b7a5a", "#8a5a00", "#8b5cf6", "#bd2f1e"]);
    const palettes = THEMES.map((id) => JSON.stringify(GENUI_THEMES[id].defaultChartPalette));
    expect(new Set(palettes).size).toBe(THEMES.length);
    expect(GENUI_THEMES.dark.defaultChartPalette!.slice(0, 5)).toEqual(["#4466d8", "#66cdaa", "#e8be5c", "#b09af2", "#f28b7d"]);
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
    expect(seriesColours(html), 'import the kit from "@openuidev/react-ui", not "@openuidev/react-ui/genui-lib"').toEqual(["#8b5cf6"]);
  });
});
