"use client";

import { createTheme, defaultLightTheme, ThemeProvider, type Theme } from "@openuidev/react-ui";
import { useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { THEME_KIND, isTheme, type ThemeId } from "@/app/theme";
import { markKeyFigures } from "./key-figure";

// OpenUI's component kit (charts, tables, tabs) drawn in our design tokens. Its colours read our CSS
// variables, so they switch with the Learner's theme by themselves; its type is in our font; its chart
// colours are ours, one palette per theme. The kit's components see this theme only when they come from the same package entry,
// "@openuidev/react-ui": the "/genui-lib" entry bundles a private copy of the theme context.

/**
 * Widgets' font: the body's Inter stack (ADR 0015). `.genui` inherits it; a `:root` token cannot name `--font-text`,
 * because that variable is set on `<body>`, not on `<html>`.
 */
export const FONT = 'var(--font-text, system-ui), -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const KIT_FONT = '"Inter", sans-serif';

/** The kit's colours as our tokens. One set serves every theme: our variables switch with the theme on <html>. */
const COLOURS: Theme = {
  background: "var(--bg)",
  foreground: "var(--field)",
  popoverBackground: "var(--field)",
  // Washes and lifts: ink at low strength, so they darken on the light page and lighten on the dark page.
  sunkLight: "color-mix(in srgb, var(--ink) 2%, transparent)",
  sunk: "color-mix(in srgb, var(--ink) 4%, transparent)",
  sunkDeep: "color-mix(in srgb, var(--ink) 8%, transparent)",
  elevatedLight: "color-mix(in srgb, var(--ink) 4%, transparent)",
  elevated: "color-mix(in srgb, var(--ink) 8%, transparent)",
  elevatedStrong: "color-mix(in srgb, var(--ink) 16%, transparent)",
  elevatedIntense: "color-mix(in srgb, var(--ink) 32%, transparent)",
  // The kit's own highlights, inverted fill and chat colours are black or white at a strength; here they are ink.
  highlightSubtle: "color-mix(in srgb, var(--ink) 2%, transparent)",
  highlight: "color-mix(in srgb, var(--ink) 4%, transparent)",
  highlightStrong: "color-mix(in srgb, var(--ink) 8%, transparent)",
  highlightIntense: "color-mix(in srgb, var(--ink) 30%, transparent)",
  invertedBackground: "var(--ink)",
  chatUserResponseBg: "var(--bubble)",
  chatUserResponseText: "var(--ink)",
  borderInteractiveEmphasis: "color-mix(in srgb, var(--ink) 40%, transparent)",
  textAccentSecondary: "color-mix(in srgb, var(--brand-ink) 70%, transparent)",
  textAccentTertiary: "color-mix(in srgb, var(--brand-ink) 40%, transparent)",
  textNeutralPrimary: "var(--ink)",
  textNeutralSecondary: "var(--muted)",
  textNeutralTertiary: "var(--muted)",
  textNeutralLink: "var(--brand)",
  textBrand: "var(--brand)",
  textAccentPrimary: "var(--brand-ink)",
  // Callout titles are ink. A family shows only as a thin edge, never as a fill or as coloured words (ADR 0015).
  textInfoPrimary: "var(--ink)",
  textInfoInverted: "var(--brand-ink)",
  textSuccessPrimary: "var(--ink)",
  textSuccessInverted: "var(--brand-ink)",
  textAlertPrimary: "var(--ink)",
  textAlertInverted: "var(--brand-ink)",
  textDangerPrimary: "var(--ink)",
  textDangerSecondary: "var(--coral-ink)",
  textDangerTertiary: "var(--coral-ink)",
  interactiveAccentDefault: "var(--brand-main)",
  interactiveAccentHover: "var(--brand-hover)",
  interactiveAccentPressed: "var(--brand-pressed)",
  interactiveAccentDisabled: "color-mix(in srgb, var(--brand-main) 40%, transparent)",
  infoBackground: "transparent",
  successBackground: "transparent",
  alertBackground: "transparent",
  dangerBackground: "transparent",
  borderDefault: "var(--border)",
  borderInteractive: "var(--border)",
  borderInteractiveSelected: "var(--brand-main)",
  borderAccent: "var(--brand-line)",
  borderAccentEmphasis: "var(--brand-main)",
  borderInfo: "var(--line)",
  borderInfoEmphasis: "var(--line-strong)",
  borderSuccess: "var(--mint)",
  borderSuccessEmphasis: "var(--mint-ink)",
  borderAlert: "var(--sun)",
  borderAlertEmphasis: "var(--sun-ink)",
  borderDanger: "var(--coral)",
  borderDangerEmphasis: "var(--coral-ink)",
};

/**
 * The same mapping, for globals.css to hold at :root (unlayered, so it beats the kit's own defaults, which follow the
 * system's light or dark setting). Portaled popovers then read our tokens, and the kit follows the Learner's `dark`
 * class only. A test keeps that block equal to this mapping.
 */
export function rootDeclarations(): Record<string, string> {
  return Object.fromEntries(Object.entries(COLOURS).map(([key, value]) => [kitVariable(key), String(value)]));
}

/** A kit weight above 500 becomes 500. 400 stays 400. */
const capWeight = (value: string) => value.replace(/^(?:560|600|700)(?=\s)/, "500");

/** The kit's type styles at its own sizes, in Inter, with no weight above 500 (ADR 0015). Code keeps its monospace face. */
const FONTS = {
  ...Object.fromEntries(
    Object.entries(defaultLightTheme).flatMap(([key, value]) => {
      if (typeof value !== "string") return [];
      if (value.includes(KIT_FONT)) return [[key, capWeight(value.replace(KIT_FONT, FONT))]];
      if (value.includes("SFMono")) return [[key, capWeight(value)]];
      return [];
    }),
  ),
  fontWeightMedium: "500",
  fontWeightBold: "500",
  fontWeightHeavy: "500",
  fontVariationRegular: "normal",
  fontVariationMedium: "normal",
} as Theme;

/**
 * The token behind each chart series, in order: ink-2, mint, sunflower, violet, coral, and the strong grey line (A5).
 * Mint stays the Learner's own series and sunflower history, as everywhere else. A series' mark is needed to read the
 * chart (WCAG 2.2 SC 1.4.11; a legend does not exempt it), so each must reach 3:1 against the chart's surface. Light's
 * mint, sunflower and coral fills do not (1.5 to 2.6:1), so the series take their -ink tokens; in Dark each -ink is its
 * fill. The contrast script checks every [series, surface] pair at 3:1 in both themes (issue #457, ADR 0015).
 */
export const CHART_SERIES = ["ink-2", "mint-ink", "sun-ink", "violet", "coral-ink", "line-strong"] as const;
/** The surfaces a kit chart sits on: the page, a wash band, a raised card, and the Widget frame. */
export const CHART_SURFACES = ["paper", "raised", "wash", "frame"] as const;

/**
 * Chart colours for each theme, as hex (charts set them as SVG attributes): CHART_SERIES resolved in that theme's block
 * in globals.css (a test checks it).
 */
const PALETTE: Record<ThemeId, string[]> = {
  light: ["#30353f", "#0b7a5a", "#8a5a00", "#8b5cf6", "#bd2f1e", "#868c97"],
  dark: ["#d1d1d6", "#66cdaa", "#e8be5c", "#b09af2", "#f28b7d", "#6e6e73"],
};

/** The chart colours of each theme, for the test that ties them to globals.css. */
export const CHART_PALETTES: Readonly<Record<ThemeId, readonly string[]>> = PALETTE;

/** Our tokens as OpenUI themes, one per page theme: the kit's colours, type and chart palette. */
export const GENUI_THEMES = Object.fromEntries(
  (Object.keys(PALETTE) as ThemeId[]).map((id) => [id, createTheme({ ...COLOURS, ...FONTS, defaultChartPalette: PALETTE[id] })]),
) as Record<ThemeId, Theme>;

/** A theme key's CSS variable, named as the kit names it: textNeutralPrimary is --openui-text-neutral-primary. */
export function kitVariable(key: string): string {
  const kebab = key
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z])/g, "$1-$2")
    .replace(/([a-z])(\d)/g, "$1-$2")
    .toLowerCase();
  return `--openui-${kebab}`;
}

// The colours inline on the wrapper too, so a widget drawn on the server (the Notes page) has readable
// text before the page is live and the kit's theme is set; the kit's own defaults follow the system setting.
const COLOUR_STYLE = Object.fromEntries(Object.entries(COLOURS).map(([key, value]) => [kitVariable(key), value])) as CSSProperties;

function watchHtmlTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  return () => observer.disconnect();
}
/** The theme on <html>. With no data-theme (the /dev/widgets harness toggles only the class) the `dark` class decides. */
function htmlTheme(): ThemeId {
  const root = document.documentElement;
  const named = root.dataset.theme;
  if (isTheme(named)) return named;
  return root.classList.contains("dark") ? "dark" : "light";
}
const lightOnServer = (): ThemeId => "light";

/** Whether the page is being printed: globals.css's `@media print` forces Light's tokens, but charts set hex colours as SVG attributes, so they must switch too. */
function watchPrinting(onChange: () => void) {
  const query = typeof window.matchMedia === "function" ? window.matchMedia("print") : null;
  query?.addEventListener("change", onChange);
  window.addEventListener("beforeprint", onChange);
  window.addEventListener("afterprint", onChange);
  return () => {
    query?.removeEventListener("change", onChange);
    window.removeEventListener("beforeprint", onChange);
    window.removeEventListener("afterprint", onChange);
  };
}
const isPrinting = () => typeof window.matchMedia === "function" && window.matchMedia("print").matches;

/** The page's theme: `data-theme` on <html>, which the head script and the theme toggle set. Light on the server. */
export function useHtmlTheme(): ThemeId {
  return useSyncExternalStore(watchHtmlTheme, htmlTheme, lightOnServer);
}

/**
 * Draws a widget's OpenUI kit parts in our tokens, in the page's theme (never the computer's setting). The kit's variables are
 * set on this `.genui` element, and on any popover the kit opens outside it.
 */
export function GenuiTheme({ children }: { children: ReactNode }) {
  const pageTheme = useHtmlTheme();
  const printing = useSyncExternalStore(watchPrinting, isPrinting, () => false);
  // Paper is always Light, whatever the page theme (spec: "Printing stays in Light").
  const theme: ThemeId = printing ? "light" : pageTheme;
  const kitTheme = GENUI_THEMES[theme];
  const root = useRef<HTMLDivElement>(null);
  // The kit's accordion trigger is a button we do not render, so we name it for the affordance audit ourselves; globals.css gives it the flat edge.
  // A layout effect, so the trigger is named before the first paint and an audit never sees it bare.
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    const tag = () => {
      host.querySelectorAll(".openui-accordion-trigger:not([data-affordance])").forEach((el) => el.setAttribute("data-affordance", "button"));
      markKeyFigures(host);
    };
    tag();
    const watch = new MutationObserver(tag);
    watch.observe(host, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, []);
  return (
    <div ref={root} className="genui" style={COLOUR_STYLE}>
      <ThemeProvider mode={THEME_KIND[theme]} cssSelector=".genui" lightTheme={kitTheme} darkTheme={kitTheme}>
        {children}
      </ThemeProvider>
    </div>
  );
}
