// Static tags: flat, 6px radius, no shadow, no pointer, a dot (spec A3a; ADR 0013). Controls are 8px with an edge or a
// fill and a pointer, so a label never reads as a control.

import type { ReactNode } from "react";

export type TagTone = "neutral" | "you" | "src" | "mint" | "coral" | "sun" | "violet" | "brand" | "success" | "warning" | "danger";

/**
 * A status word that cannot be pressed. tone picks the colour: for the app's chrome, brand (info) or a status tone
 * (success: passed or done, warning: due, danger: failed), each always with its words; inside Widgets, a dot in a
 * family's colour (spec §2.1, decision #17: mint is gain, coral is loss; sun is the record, ink; violet is neutral), or the
 * provenance dots: kind "you" is blue ("Your assumption", the Learner's own number) and kind "src" is ink ("Sourced", the
 * record). children replace the default words.
 */
export function Tag({ tone, kind, children, className = "" }: { tone?: TagTone; kind?: "you" | "src"; children?: ReactNode; className?: string }) {
  const shown: TagTone = tone ?? kind ?? "neutral";
  const words = children ?? (kind === "you" ? "Your assumption" : kind === "src" ? "Sourced" : null);
  return (
    <span data-affordance="tag" data-tone={shown === "neutral" ? undefined : shown} className={`tag ${kind ? "mr-1" : ""} ${className}`.trim()}>
      {words}
    </span>
  );
}

/** Small label (a Topic name, "You are here"). brand = blue; otherwise neutral. A Tag: it is not pressable. */
export function Pill({ brand, children, className = "" }: { brand?: boolean; children: ReactNode; className?: string }) {
  return (
    <Tag tone={brand ? "brand" : "neutral"} className={className}>
      {children}
    </Tag>
  );
}
