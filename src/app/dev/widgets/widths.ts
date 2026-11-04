/** The panel widths the Widget harness draws at: the Study aside's narrowest, middle and widest. */
export const HARNESS_WIDTHS = [360, 480, 560] as const;
export type HarnessWidth = (typeof HARNESS_WIDTHS)[number];
