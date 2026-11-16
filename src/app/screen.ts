/**
 * The one screen-size rule (spec #68, #81): a phone is below 768 px, a tablet below 1024 px, a laptop from 1024 px up.
 * CSS reads the same numbers as Tailwind's `md` and `lg` breakpoints (the @theme block in globals.css, checked against
 * these by screen.test.ts), so the layout is drawn by CSS and is right at first paint; script reads these.
 */
export const TABLET_PX = 768;
export const LAPTOP_PX = 1024;

export type Screen = "phone" | "tablet" | "laptop";

/** Which screen a width (in CSS px) is. */
export const screenAt = (width: number): Screen => (width < TABLET_PX ? "phone" : width < LAPTOP_PX ? "tablet" : "laptop");

/** Media queries for the tablet and laptop sides of the rule (a phone matches neither). */
export const TABLET_UP = `(min-width: ${TABLET_PX}px)`;
export const LAPTOP_UP = `(min-width: ${LAPTOP_PX}px)`;
