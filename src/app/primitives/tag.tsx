// Static tags: flat, 6px radius, no shadow, no pointer, a dot instead of a lip (spec A3a, Appendix B). Chips are fully
// round and raised, so shape alone tells a label from a control.

import type { ReactNode } from "react";

export type TagTone = "neutral" | "mint" | "coral" | "sun" | "violet" | "brand";

/**
 * A status word that cannot be pressed. tone picks the accent (mint: you and gains, coral: losses, sun: history,
 * violet: lingo, brand: info). kind is the older provenance spelling: "you" is mint ("Your assumption"), "src" is sun
 * ("Sourced"); children replace the default words.
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
