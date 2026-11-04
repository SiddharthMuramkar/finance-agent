"use client";

import { createTheme, defaultLightTheme, ThemeProvider, type Theme } from "@openuidev/react-ui";
import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { THEME_KIND, isTheme, type ThemeId } from "@/app/theme";

// OpenUI's component kit (charts, tables, tabs) drawn in our design tokens. Its colours read our CSS
// variables, so they switch with the Learner's theme by themselves; its type is in our font; its chart
// colours are ours, one palette per theme. The kit's components see this theme only when they come from the same package entry,
// "@openuidev/react-ui": the "/genui-lib" entry bundles a private copy of the theme context.

/** The page's font (body in globals.css). The kit's own, Inter, is not loaded here. */
const FONT = '-apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif';
const KIT_FONT = '"Inter", sans-serif';

/** The kit's colours as our tokens. One set serves every theme: our variables switch with the theme on <html>. */
const COLOURS: Theme = {
  background: "var(--bg)",
  foreground: "var(--field)",
  popoverBackground: "var(--field)",
  // Washes and lifts: ink at low strength, so they darken on paper and lighten on the dark page.
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
  // Callout titles are navy or ink, never the kit's indigo or brown. Only a danger callout is red.
  textInfoPrimary: "var(--brand)",
  textInfoInverted: "var(--brand-ink)",
  textSuccessPrimary: "var(--ink)",
  textSuccessInverted: "var(--brand-ink)",
  textAlertPrimary: "var(--ink)",
  textAlertInverted: "var(--brand-ink)",
  textDangerPrimary: "var(--danger)",
  textDangerSecondary: "var(--danger)",
  textDangerTertiary: "var(--danger)",
  interactiveAccentDefault: "var(--brand)",
  interactiveAccentHover: "var(--brand-hover)",
  interactiveAccentPressed: "var(--brand-pressed)",
  interactiveAccentDisabled: "color-mix(in srgb, var(--brand) 40%, transparent)",
  infoBackground: "var(--brand-tint)",
  successBackground: "var(--hairline)",
  alertBackground: "var(--hairline)",
  dangerBackground: "color-mix(in srgb, var(--danger) 8%, transparent)",
  borderDefault: "var(--border)",
  borderInteractive: "var(--border)",
  borderInteractiveSelected: "var(--brand)",
  borderAccent: "var(--brand-line)",
  borderAccentEmphasis: "var(--brand)",
  borderInfo: "var(--brand-line)",
  borderInfoEmphasis: "var(--brand)",
  borderSuccess: "var(--border)",
  borderSuccessEmphasis: "var(--ink)",
  borderAlert: "var(--border)",
  borderAlertEmphasis: "var(--ink)",
  borderDanger: "var(--danger)",
  borderDangerEmphasis: "var(--danger)",
};

/**
 * The same mapping, for globals.css to hold at :root (unlayered, so it beats the kit's own defaults, which follow the
 * system's light or dark setting). Portaled popovers then read our tokens, and the kit follows the Learner's `dark`
 * class only. A test keeps that block equal to this mapping.
 */
export function rootDeclarations(): Record<string, string> {
  return Object.fromEntries(Object.entries(COLOURS).map(([key, value]) => [kitVariable(key), String(value)]));
}

/** The kit's type styles at its own sizes, in our font, without Inter's weight axis. */
const FONTS = {
  ...Object.fromEntries(
    Object.entries(defaultLightTheme).flatMap(([key, value]) => (typeof value === "string" && value.includes(KIT_FONT) ? [[key, value.replace(KIT_FONT, FONT)]] : [])),
  ),
  fontVariationRegular: "normal",
  fontVariationMedium: "normal",
} as Theme;

/**
 * Chart colours for each theme, as hex (charts set them as SVG attributes), each taken from that theme's block in
 * globals.css (a test checks it). The kit hands them out from the middle of the list: one series is the brand colour,
 * two are the learner's accent and the sourced-history accent, three are accent, brand and sourced, and more reach the
 * quieter colours at either end. In each list the order is: learner tag text, muted, learner accent, brand, sourced
 * accent, brand line, sourced tag text. Light's list is the one it always had. Paper uses its softer learner rule
 * colour for the third, because its learner accent is too close to its blue.
 */
const PALETTE: Record<ThemeId, string[]> = {
  light: ["#0b4f4a", "#79716b", "#00786f", "#002366", "#e17100", "#6699ff", "#7b3306"],
  paper: ["#2f5f68", "#66617f", "#56949f", "#286983", "#94580f", "#b1c2c8", "#7d4a12"],
  midnight: ["#abe8dd", "#a6adc8", "#94e2d5", "#89b4fa", "#fab387", "#465579", "#fcc29f"],
  forest: ["#b8cd9a", "#b3bcb2", "#a7c080", "#7fbbb3", "#dbbc7f", "#4d6768", "#e2c999"],
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
  return root.classList.contains("dark") ? "midnight" : "light";
}
const lightOnServer = (): ThemeId => "light";

/** The page's theme: `data-theme` on <html>, which the head script and the theme menu set. Light on the server. */
export function useHtmlTheme(): ThemeId {
  return useSyncExternalStore(watchHtmlTheme, htmlTheme, lightOnServer);
}

/**
 * Draws a widget's OpenUI kit parts in our tokens, in the page's theme (never the computer's setting). The kit's variables are
 * set on this `.genui` element, and on any popover the kit opens outside it.
 */
export function GenuiTheme({ children }: { children: ReactNode }) {
  const theme = useHtmlTheme();
  const kitTheme = GENUI_THEMES[theme];
  return (
    <div className="genui" style={COLOUR_STYLE}>
      <ThemeProvider mode={THEME_KIND[theme]} cssSelector=".genui" lightTheme={kitTheme} darkTheme={kitTheme}>
        {children}
      </ThemeProvider>
    </div>
  );
}
