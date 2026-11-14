// The Study Workspace's split (spec 2026-11-11, C2a): how much of the two columns' width the conversation takes, and
// how a saved share turns into a number. Pure, like theme.ts: used on the server (the first HTML) and in the browser
// (the Split handle, C2b), so nothing here touches the document.

import type { CSSProperties } from "react";

/** The cookie holding the share: one per browser, the same for /study and every old Session page. */
export const SPLIT_COOKIE = "split";
/** The conversation's share, in whole percent of the width the two columns share, when nothing is saved. */
export const SPLIT_DEFAULT = 45;
export const SPLIT_MIN = 33;
export const SPLIT_MAX = 67;
/** Neither column goes under this many px (R22). */
export const COLUMN_MIN_PX = 360;
/** Arrow keys move the share by this many points. */
export const SPLIT_STEP = 2;

export type SplitBounds = { min: number; max: number };

/**
 * The share the columns can actually take at this shared width. Both columns stay at least 360 px, and the share stays
 * inside 33–67. A width of 0 (the server, or happy-dom before layout) is the wide-window pair.
 */
export function splitBounds(sharedPx: number): SplitBounds {
  if (!sharedPx) return { min: SPLIT_MIN, max: SPLIT_MAX };
  const min = Math.max(SPLIT_MIN, Math.ceil((COLUMN_MIN_PX / sharedPx) * 100));
  const max = Math.min(SPLIT_MAX, Math.floor(((sharedPx - COLUMN_MIN_PX) / sharedPx) * 100));
  return { min, max };
}

const clampShare = (share: number, bounds: SplitBounds) => Math.min(bounds.max, Math.max(bounds.min, share));

/** The share after a key. ArrowLeft and ArrowRight step by 2; Home and End jump to the limits. Anything else is ignored. */
export function nextSplit(share: number, key: string, bounds: SplitBounds): number | null {
  if (key === "ArrowLeft") return clampShare(share - SPLIT_STEP, bounds);
  if (key === "ArrowRight") return clampShare(share + SPLIT_STEP, bounds);
  if (key === "Home") return bounds.min;
  if (key === "End") return bounds.max;
  return null;
}

/** Where a pointer is, as a whole-percent share of the frame, clamped to the limits in force. */
export function shareAtPointer(clientX: number, frame: { left: number; width: number }, handlePx: number, bounds: SplitBounds): number {
  const span = frame.width - handlePx;
  const raw = span > 0 ? Math.round((100 * (clientX - frame.left - handlePx / 2)) / span) : bounds.min;
  return clampShare(raw, bounds);
}

/**
 * Reads a saved share. One to three digits only, clamped to 33–67; anything else (missing, empty, decimals, signs,
 * `1e2`, words) opens the default.
 */
export function parseSplit(raw?: string | null): number {
  if (!raw || !/^\d{1,3}$/.test(raw)) return SPLIT_DEFAULT;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Number(raw)));
}

/** The frame's style: `.workspace-split` reads `--split-saved` from 1024 px up (globals.css). */
export const splitStyle = (share: number): CSSProperties => ({ "--split-saved": String(share) }) as CSSProperties;
