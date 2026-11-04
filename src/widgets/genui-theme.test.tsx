import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Renderer } from "@openuidev/react-lang";
import { openuiLibrary, useTheme } from "@openuidev/react-ui";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GENUI_THEMES, GenuiTheme, kitVariable, rootDeclarations } from "./genui-theme";
import { widgetLibrary } from "./library";

const kitStylesheet = readFileSync(createRequire(import.meta.url).resolve("@openuidev/react-ui/layered/styles/index.css"), "utf8");
const ourTokens = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").toLowerCase();

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
  it("draws one series in our navy, not the kit's blue", () => {
    const html = kitChart('Series("x", [1, 2])');
    expect(seriesColours(html)).toEqual(["#002366"]);
    expect(html).not.toMatch(/#42a5f5/i);
  });

  it("gives two series teal and amber, and three teal, navy and amber", () => {
    expect(seriesColours(kitChart('Series("x", [1, 2])', 'Series("y", [2, 3])'))).toEqual(["#00786f", "#e17100"]);
    expect(seriesColours(kitChart('Series("x", [1, 2])', 'Series("y", [2, 3])', 'Series("z", [3, 4])'))).toEqual(["#00786f", "#002366", "#e17100"]);
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

  it("sets only variables the kit's stylesheet reads, in both modes", () => {
    for (const theme of [GENUI_THEMES.light, GENUI_THEMES.dark]) {
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

  it("maps the callout families to navy and ink, not the kit's indigo, with only danger in red", () => {
    const root = rootDeclarations();
    expect(root["--openui-text-info-primary"]).toBe("var(--brand)");
    expect(root["--openui-text-success-primary"]).toBe("var(--ink)");
    expect(root["--openui-text-alert-primary"]).toBe("var(--ink)");
    expect(root["--openui-text-danger-primary"]).toBe("var(--danger)");
    for (const family of ["info", "success", "alert", "danger"]) {
      expect(root[`--openui-${family}-background`], family).toBeDefined();
      expect(root[`--openui-border-${family}`], family).toBeDefined();
      expect(root[`--openui-border-${family}-emphasis`], family).toBeDefined();
    }
  });

  it("takes every chart colour from our design tokens, with the dark palette led by the dark-mode teal, navy and amber", () => {
    for (const colour of [...GENUI_THEMES.light.defaultChartPalette!, ...GENUI_THEMES.dark.defaultChartPalette!]) expect(ourTokens).toContain(colour);
    expect(GENUI_THEMES.dark.defaultChartPalette!.slice(2, 5)).toEqual(["#00d5be", "#6699ff", "#ffb900"]);
  });

  // The widget library's kit components see GenuiTheme only when they come from "@openuidev/react-ui" itself:
  // its "/genui-lib" entry bundles a private copy of the theme context, and its charts stay in the kit's blue.
  it.skipIf(!("LineChart" in widgetLibrary.components))("draws a kit chart in a widget in our palette", () => {
    const code = 'root = Widget("Illustration: two points", [c])\nc = LineChart(["a", "b"], [Series("x", [1, 2])])';
    const html = renderToStaticMarkup(
      <GenuiTheme>
        <Renderer response={code} library={widgetLibrary} />
      </GenuiTheme>,
    );
    expect(seriesColours(html), 'import the kit from "@openuidev/react-ui", not "@openuidev/react-ui/genui-lib"').toEqual(["#002366"]);
  });
});
