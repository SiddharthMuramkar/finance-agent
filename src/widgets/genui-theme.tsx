"use client";

import { createTheme, defaultLightTheme, ThemeProvider, type Theme } from "@openuidev/react-ui";
import { useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
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
  // Callout titles are navy or ink, never the kit's indigo or brown. Only a danger callout is red.
  textInfoPrimary: "var(--brand)",
  textInfoInverted: "var(--brand-ink)",
  textSuccessPrimary: "var(--mint-ink)",
  textSuccessInverted: "var(--brand-ink)",
  textAlertPrimary: "var(--sun-ink)",
  textAlertInverted: "var(--brand-ink)",
  textDangerPrimary: "var(--coral-ink)",
  textDangerSecondary: "var(--coral-ink)",
  textDangerTertiary: "var(--coral-ink)",
  interactiveAccentDefault: "var(--brand-main)",
  interactiveAccentHover: "var(--brand-hover)",
  interactiveAccentPressed: "var(--brand-pressed)",
  interactiveAccentDisabled: "color-mix(in srgb, var(--brand-main) 40%, transparent)",
  infoBackground: "var(--brand-soft)",
  successBackground: "var(--mint-tint)",
  alertBackground: "var(--sun-tint)",
  dangerBackground: "var(--coral-tint)",
  borderDefault: "var(--border)",
  borderInteractive: "var(--border)",
  borderInteractiveSelected: "var(--brand-main)",
  borderAccent: "var(--brand-line)",
  borderAccentEmphasis: "var(--brand-main)",
  borderInfo: "var(--brand-line)",
  borderInfoEmphasis: "var(--brand-main)",
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
 * globals.css (a test checks it). The series order is the spec's: brand-main, mint, sunflower, violet, coral, edge.
 * Mint stays the Learner's own series and sunflower history, as everywhere else.
 */
const PALETTE: Record<ThemeId, string[]> = {
  light: ["#2f5bea", "#12b886", "#ffc233", "#8b5cf6", "#ff6b57", "#6677a3"],
  dark: ["#4466d8", "#66cdaa", "#e8be5c", "#b09af2", "#f28b7d", "#6b7aae"],
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
  const root = useRef<HTMLDivElement>(null);
  // The kit's accordion trigger is a button we do not render, so we name it for the affordance audit ourselves; globals.css gives it the raised edge.
  // A layout effect, so the trigger is named before the first paint and an audit never sees it bare.
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    const tag = () => host.querySelectorAll(".openui-accordion-trigger:not([data-affordance])").forEach((el) => el.setAttribute("data-affordance", "button"));
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
