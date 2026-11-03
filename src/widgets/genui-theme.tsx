"use client";

import { createTheme, defaultLightTheme, ThemeProvider, type Theme } from "@openuidev/react-ui";
import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

// OpenUI's component kit (charts, tables, tabs) drawn in our design tokens. Its colours read our CSS
// variables, so they switch with the Learner's dark mode by themselves; its type is in our font; its chart
// colours are ours. The kit's components see this theme only when they come from the same package entry,
// "@openuidev/react-ui": the "/genui-lib" entry bundles a private copy of the theme context.

/** The page's font (body in globals.css). The kit's own, Inter, is not loaded here. */
const FONT = '-apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif';
const KIT_FONT = '"Inter", sans-serif';

/** The kit's colours as our tokens. One set serves both modes: our variables switch under the `dark` class. */
const COLOURS: Theme = {
  background: "var(--bg)",
  foreground: "var(--field)",
  popoverBackground: "var(--field)",
  textNeutralPrimary: "var(--ink)",
  textNeutralSecondary: "var(--muted)",
  textNeutralLink: "var(--brand)",
  textBrand: "var(--brand)",
  textAccentPrimary: "var(--brand-ink)",
  textDangerPrimary: "var(--danger)",
  interactiveAccentDefault: "var(--brand)",
  interactiveAccentHover: "var(--brand-hover)",
  interactiveAccentPressed: "var(--brand)",
  interactiveAccentDisabled: "color-mix(in srgb, var(--brand) 40%, transparent)",
  borderDefault: "var(--border)",
  borderInteractive: "var(--border)",
  borderAccent: "var(--brand-line)",
  borderAccentEmphasis: "var(--brand)",
};

/** The kit's type styles at its own sizes, in our font, without Inter's weight axis. */
const FONTS = {
  ...Object.fromEntries(
    Object.entries(defaultLightTheme).flatMap(([key, value]) => (typeof value === "string" && value.includes(KIT_FONT) ? [[key, value.replace(KIT_FONT, FONT)]] : [])),
  ),
  fontVariationRegular: "normal",
  fontVariationMedium: "normal",
} as Theme;

/**
 * Chart colours for each mode, as hex (charts set them as SVG attributes), from globals.css. The kit hands
 * them out from the middle of the list: one series is navy, two are teal and amber, three are teal, navy
 * and amber, and more reach the quieter colours at either end.
 */
const PALETTE = {
  light: ["#0b4f4a", "#79716b", "#00786f", "#002366", "#e17100", "#6699ff", "#7b3306"],
  dark: ["#96f7e4", "#a6a09b", "#00d5be", "#6699ff", "#ffb900", "#c2cde2", "#fee685"],
};

/** Our tokens as OpenUI themes, one per mode: the kit's colours, type and chart palette. */
export const GENUI_THEMES = {
  light: createTheme({ ...COLOURS, ...FONTS, defaultChartPalette: PALETTE.light }),
  dark: createTheme({ ...COLOURS, ...FONTS, defaultChartPalette: PALETTE.dark }),
};

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

function watchHtmlClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const htmlIsDark = () => document.documentElement.classList.contains("dark");
const lightOnServer = () => false;

/** True while the page is in dark mode: the `dark` class on <html>, which the Learner's toggle sets. False on the server. */
export function useHtmlDark(): boolean {
  return useSyncExternalStore(watchHtmlClass, htmlIsDark, lightOnServer);
}

/**
 * Draws a widget's OpenUI kit parts in our tokens, light or dark to match the page. The kit's variables are
 * set on this `.genui` element, and on any popover the kit opens outside it.
 */
export function GenuiTheme({ children }: { children: ReactNode }) {
  const mode = useHtmlDark() ? "dark" : "light";
  return (
    <div className="genui" style={COLOUR_STYLE}>
      <ThemeProvider mode={mode} cssSelector=".genui" lightTheme={GENUI_THEMES.light} darkTheme={GENUI_THEMES.dark}>
        {children}
      </ThemeProvider>
    </div>
  );
}
