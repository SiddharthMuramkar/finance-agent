"use client";

import { Icon, type IconSize } from "@/icons/icon";
import { iconFor, isIconName, type IconName } from "@/icons/names";
import { LONG_MONTHS, MONTHS } from "../../months";

// Helpers the story parts (wave 3) share: pictures by name, dates written for people, and the motion flag.

/** The Icon name for what the Tutor wrote: an exact name, else the best keyword match; null when nothing fits. */
export function resolveIcon(name: unknown): IconName | null {
  if (typeof name !== "string" || !name.trim()) return null;
  const asked = name.trim().toLowerCase();
  return isIconName(asked) ? asked : iconFor(asked);
}

/**
 * One line Icon from the named set (ADR 0018), or nothing when the name matches none. Decorative by default: the words
 * beside it carry the meaning. Give `label` when the picture names someone the words do not (RateMove's speakers, issue 480).
 */
export function Pic({ name, size, label }: { name: unknown; size: IconSize; label?: string }) {
  const resolved = resolveIcon(name);
  return resolved ? <Icon name={resolved} size={size} label={label} /> : null;
}

/** The value of `data-motion`: "off" when the Learner asked for reduced motion, else "on". */
export const motionFlag = (reduced: boolean) => (reduced ? "off" : "on");


/** "1994-02-03" as "3 Feb 1994" (read from the text, so the Learner's time zone never moves the day); a bare year or month stays as written; null if not a date. */
export function dayLabel(iso: unknown): string | null {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(iso.trim());
  if (!m) return null;
  const month = m[2] ? MONTHS[Number(m[2]) - 1] : undefined;
  if (m[2] && !month) return null;
  return [m[3] ? String(Number(m[3])) : undefined, month, m[1]].filter(Boolean).join(" ");
}

/** The year of an ISO date, as written. */
export const yearOf = (iso: string) => /^\d{4}/.exec(iso.trim())?.[0] ?? "";

/** True when ISO date `a` is later than `b` (ISO text sorts in date order; a bare year counts as its first day). */
export function isAfter(a: string, b: string): boolean {
  const pad = (s: string) => `${s.trim()}${"0000-01-01".slice(s.trim().length)}`;
  return pad(a) > pad(b);
}


/** "1994-02-03" as "3 February 1994" (the front page's date line); a bare year or month stays as written; null if not a date. */
export function longDayLabel(iso: unknown): string | null {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(iso.trim());
  if (!m) return null;
  const month = m[2] ? LONG_MONTHS[Number(m[2]) - 1] : undefined;
  if (m[2] && !month) return null;
  return [m[3] ? String(Number(m[3])) : undefined, month, m[1]].filter(Boolean).join(" ");
}
