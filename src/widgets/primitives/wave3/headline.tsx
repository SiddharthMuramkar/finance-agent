"use client";

import { defineComponent, type ComponentRenderProps } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { usePrefersReducedMotion } from "../wave1/motion";
import { longDayLabel, motionFlag } from "./shared";

// Headline: a period front page. A serif masthead, the date line, the headline and deck, a sunflower rule and a link to
// the source. Nothing to press but the link, so nothing here looks like a button.

export const headlineProps = z.object({
  paper: z.string().describe("The paper's name: at most 4 words"),
  date: z.string().describe("The front page's ISO date, e.g. 1994-02-04"),
  headline: z.string().describe("The headline: at most 12 words"),
  deck: z.string().optional().describe("A line under the headline: at most 20 words"),
  source: z.string().describe("The URL of the source"),
});

type Props = z.infer<typeof headlineProps>;

/** The address when it is a plain http(s) one, else null (a source is never turned into a script link). */
function safeHref(source: unknown): string | null {
  if (typeof source !== "string") return null;
  try {
    const url = new URL(source.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function HeadlineView({ paper, date, headline, deck, source }: Props) {
  const reduced = usePrefersReducedMotion();
  if (!headline) return <p className="py-2 text-sm text-[var(--muted)]">The front page is still arriving.</p>;
  const href = safeHref(source);
  return (
    <section data-testid="headline" data-motion={motionFlag(reduced)} aria-label={`Front page of ${paper}`} className="@container py-1">
      <article className="rounded-sm border border-[var(--brand-line)] bg-[var(--sun-tint)] px-4 py-3 text-[var(--ink)]">
        <header className="border-b-4 border-double border-[var(--ink)] pb-1 text-center">
          <p className="font-serif text-2xl font-black uppercase leading-8 tracking-wide">{paper}</p>
        </header>
        <p className="mt-1 border-b border-[var(--ink)] pb-1 text-center font-serif text-xs uppercase tracking-widest text-[var(--sun-ink)]">{longDayLabel(date) ?? date}</p>
        <h3 className="mt-3 font-serif text-2xl font-bold leading-8 @min-[560px]:text-3xl @min-[560px]:leading-9">{headline}</h3>
        {deck && <p className="mt-2 font-serif text-base italic leading-6">{deck}</p>}
        <div className="mt-3 h-1 rounded-full bg-[var(--sun)]" aria-hidden="true" />
        {href && (
          <p className="mt-2 text-sm">
            <a data-affordance="link" href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--brand)] underline underline-offset-2">
              Source
            </a>
          </p>
        )}
      </article>
    </section>
  );
}

export const Headline = defineComponent({
  name: "Headline",
  description:
    "A period front page: Headline(paper, date, headline, deck?, source). paper at most 4 words, date ISO, headline at most 12 words, deck at most 20, source a URL (shown as a Source link).",
  props: headlineProps,
  component: ({ props }: ComponentRenderProps<Props>) => <HeadlineView {...props} />,
});
