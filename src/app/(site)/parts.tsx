import type { ReactNode } from "react";
import Link from "next/link";
import { Rich } from "@/site/rich";

// The site's small parts (spec 4.4, 5.4, 5.5, 5.17): server-safe, so pages and client components share them.

/** The four-bar glyph (4.4): `lit` bars at full strength, the rest at 0.28. Decorative unless it has a label. */
export function Glyph({ size = 20, lit = 4, grow = false, className = "" }: { size?: number; lit?: number; grow?: boolean; className?: string }) {
  return (
    <svg className={`v-glyph${grow ? " grow" : ""} ${className}`} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {[8, 11, 14, 17].map((height, i) => (
        <rect key={i} x={1 + 5 * i} y={19 - height} width={3.4} height={height} rx={1} className={i < lit ? undefined : "off"} />
      ))}
    </svg>
  );
}

const ICONS = {
  check: "M3 8.5l3.2 3.2L13 5",
  cross: "M4 4l8 8M12 4l-8 8",
  alert: "M8 3v6.2M8 12.6v.2",
  approx: "M2.5 6.2c1.7-1.7 3.5-1.7 5.5 0s3.8 1.7 5.5 0M2.5 10.6c1.7-1.7 3.5-1.7 5.5 0s3.8 1.7 5.5 0",
  up: "M8 13V3.5M4 7.5l4-4 4 4",
  down: "M8 3v9.5M4 8.5l4 4 4-4",
  arrow: "M3 8h10M9 4l4 4-4 4",
  back: "M13 8H3M7 4L3 8l4 4",
  lock: "M5.5 7V5.2a2.5 2.5 0 015 0V7",
} as const;

export type IconName = keyof typeof ICONS;

/** One of the spec's icons (5.5): a 16 px stroke drawing in currentColor, always hidden from assistive tech. */
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg className={`v-icon ${className}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {name === "lock" && <rect x={3.5} y={7} width={9} height={6.5} rx={1.5} />}
      <path d={ICONS[name]} />
    </svg>
  );
}

export type PillTone = "gain" | "loss" | "wait" | "blue" | "plain";

/** A status pill (5.4): the only place a signal colour sits behind text. */
export function Pill({ tone, icon, children }: { tone: PillTone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`v-pill v-pill-${tone}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

/** A date or category stamp (5.17). */
export function Stamp({ children }: { children: ReactNode }) {
  return <span className="v-stamp">{children}</span>;
}

/** A facts grid (5.17): label over value. */
export function Facts({ facts, label }: { facts: readonly { label: string; value: string; you?: boolean }[]; label?: string }) {
  return (
    <dl className="v-facts" aria-label={label}>
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd className={fact.you ? "you" : undefined}>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A story paragraph (5.17): its opening bold run, such as "**October 2018.**", is drawn as the blue dateline. */
export function StoryText({ story, className = "v-story" }: { story: string; className?: string }) {
  const lead = /^\*\*([^*]+)\*\*\s*/.exec(story);
  return (
    <p className={className}>
      {lead && <span className="v-dateline">{lead[1]}</span>}
      {lead && " "}
      <Rich>{lead ? story.slice(lead[0].length) : story}</Rich>
    </p>
  );
}

/** A section head (3.3): eyebrow, H2 and an optional body, at most 44em wide. */
export function SectionHead({ eyebrow, title, body, id }: { eyebrow?: string; title: string; body?: string; id?: string }) {
  return (
    <div className="v-sec-head">
      {eyebrow && <p className="v-eyebrow">{eyebrow}</p>}
      <h2 className="v-h2" id={id}>
        {title}
      </h2>
      {body && (
        <p className="v-lede">
          <Rich>{body}</Rich>
        </p>
      )}
    </div>
  );
}

/** A text link with the arrow after it (5.2). */
export function ArrowLink({ href, children, ink = false }: { href: string; children: ReactNode; ink?: boolean }) {
  return (
    <Link href={href} className={`v-tlink${ink ? " ink" : ""}`}>
      {children}
      <Icon name="arrow" />
    </Link>
  );
}
