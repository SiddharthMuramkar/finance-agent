// Static tags: flat, 6px radius, no shadow, no pointer, a dot (spec A3a; ADR 0015). Controls are 8px with an edge or a
// fill and a pointer, so a label never reads as a control.

import type { ReactNode } from "react";

export type TagTone = "neutral" | "mint" | "coral" | "sun" | "violet" | "brand" | "success" | "warning" | "danger";

/**
 * A status word that cannot be pressed. tone picks the colour: for the app's chrome, brand (info) or a status tone
 * (success: passed or done, warning: due, danger: failed), each always with its words; inside Widgets, a Widget accent
 * family (mint: you and gains, coral: losses, sun: history, violet: lingo). kind is the older provenance spelling: "you"
 * is mint ("Your assumption"), "src" is sun ("Sourced"); children replace the default words.
 */
export function Tag({ tone, kind, children, className = "" }: { tone?: TagTone; kind?: "you" | "src"; children?: ReactNode; className?: string }) {
  const shown: TagTone = tone ?? (kind === "you" ? "mint" : kind === "src" ? "sun" : "neutral");
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
