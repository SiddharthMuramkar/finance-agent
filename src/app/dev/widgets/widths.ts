/** The panel widths the Widget harness draws at: the Study aside from its narrowest to the big stage at 1512px (E5). */
export const HARNESS_WIDTHS = [360, 480, 560, 720, 860] as const;
export type HarnessWidth = (typeof HARNESS_WIDTHS)[number];
