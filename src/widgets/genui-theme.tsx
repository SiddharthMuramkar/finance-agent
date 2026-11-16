"use client";

import { createTheme, defaultLightTheme, ThemeProvider, type Theme } from "@openuidev/react-ui";
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { markKeyFigures } from "./key-figure";

// OpenUI's component kit (charts, tables, tabs) drawn in our design tokens, in the app's one Light theme (decision #17).
// Its colours read our CSS variables; its type is in our font; its chart colours are ours, one palette. The kit's
// components see this theme only when they come from the same package entry, "@openuidev/react-ui": the "/genui-lib"
// entry bundles a private copy of the theme context.

/**
 * Widgets' font: the body's Inter stack. `.genui` inherits it; a `:root` token cannot name `--font-text`,
 * because that variable is set on `<body>`, not on `<html>`.
 */
export const FONT = 'var(--font-text, system-ui), -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const KIT_FONT = '"Inter", sans-serif';

/** The kit's colours as our tokens. */
const COLOURS: Theme = {
  background: "var(--bg)",
  foreground: "var(--field)",
  popoverBackground: "var(--field)",
  // Washes and lifts: ink at low strength, so they darken the page a little.
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
  textDangerSecondary: "var(--loss-ink)",
  textDangerTertiary: "var(--loss-ink)",
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
  borderSuccess: "var(--gain)",
  borderSuccessEmphasis: "var(--gain-ink)",
  borderAlert: "var(--wait)",
  borderAlertEmphasis: "var(--wait-ink)",
  borderDanger: "var(--loss)",
  borderDangerEmphasis: "var(--loss-ink)",
};

/**
 * The same mapping, for globals.css to hold at :root (unlayered, so it beats the kit's own defaults, which follow the
 * system's light or dark setting). Portaled popovers then read our tokens. A test keeps that block equal to this mapping.
 */
export function rootDeclarations(): Record<string, string> {
  return Object.fromEntries(Object.entries(COLOURS).map(([key, value]) => [kitVariable(key), String(value)]));
}

/** A kit weight above 500 becomes 500. 400 stays 400. */
const capWeight = (value: string) => value.replace(/^(?:560|600|700)(?=\s)/, "500");

/** The kit's type styles at its own sizes, in Inter, with no weight above 500. Code keeps its monospace face. */
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
 * The token behind each chart series, in order (decision #17, spec §2.1): the kit hands colours out from the middle of
 * the list, so one series is blue, two are ink (the record) and muted, three are ink, blue and muted, and a fourth adds the
 * strong grey line. Green and red never stand for a plain series: on a chart they mean gain and loss, so a recipe that
 * needs them names them itself. A series' mark is needed to read the chart (WCAG 2.2 SC 1.4.11; a legend does not exempt
 * it), so each reaches 3:1 against the chart's surface; the contrast script checks every [series, surface] pair.
 */
export const CHART_SERIES = ["line-strong", "ink", "blue", "muted"] as const;
/** The surfaces a kit chart sits on: the page, a wash band, a raised card, and the Widget frame. */
export const CHART_SURFACES = ["paper", "raised", "wash", "frame"] as const;

/**
 * The chart colours before the page is read (on the server, and while hydrating): each CHART_SERIES token by name, so
 * the colour is the page's own token and no literal colour lives outside the token block (ADR 0019).
 */
export const CHART_PALETTE: readonly string[] = CHART_SERIES.map((token) => `var(--${token})`);

/**
 * The chart colours as the page resolves them now (charts set them as SVG attributes, where a colour is safest resolved):
 * each CHART_SERIES token read from <html>'s computed style, so a chart follows the page's theme. A token the page does
 * not set keeps its var().
 */
export function pageChartPalette(style: Pick<CSSStyleDeclaration, "getPropertyValue">): string[] {
  return CHART_SERIES.map((token, i) => style.getPropertyValue(`--${token}`).trim() || CHART_PALETTE[i]);
}

/** Our tokens as an OpenUI theme: the kit's colours, type and a chart palette. */
const themeWith = (palette: readonly string[]): Theme => createTheme({ ...COLOURS, ...FONTS, defaultChartPalette: [...palette] });
export const GENUI_THEME: Theme = themeWith(CHART_PALETTE);

// The page's chart palette as a store: read again whenever <html>'s theme attributes change (the theme switch sets
// data-theme on it, ADR 0019). Joined into one string, so an unchanged palette is the same snapshot.
const subscribePalette = (changed: () => void) => {
  const watch = new MutationObserver(changed);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
  return () => watch.disconnect();
};
const readPalette = () => pageChartPalette(getComputedStyle(document.documentElement)).join("|");
const serverPalette = () => CHART_PALETTE.join("|");

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

/**
 * Draws a widget's OpenUI kit parts in our tokens, in Light (never the computer's setting). The kit's variables are set on
 * this `.genui` element, and on any popover the kit opens outside it.
 */
export function GenuiTheme({ children }: { children: ReactNode }) {
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
  const palette = useSyncExternalStore(subscribePalette, readPalette, serverPalette);
  const theme = useMemo(() => (palette === serverPalette() ? GENUI_THEME : themeWith(palette.split("|"))), [palette]);
  return (
    <div ref={root} className="genui" style={COLOUR_STYLE}>
      <ThemeProvider mode="light" cssSelector=".genui" lightTheme={theme}>
        {children}
      </ThemeProvider>
    </div>
  );
}
