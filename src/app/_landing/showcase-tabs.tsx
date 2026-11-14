"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Chip } from "../primitives";
import { copy } from "./copy";
import type { BuiltShowcase } from "./showcase-widgets";

// Home's section 4, "More moments from real Topics" (spec 2026-11-12 E6, E8): the three Showcases as tabs (Everyday
// money, The news, A real company), one on screen at a time. Each is a written-ahead question, the Tutor's reply and the
// live Widget, built from a Topic file.
//
// E8, a fast first view: the general Widget renderer (LiveWidget → WidgetWithSave → OpenUI) is the heaviest script on
// Home, so it is not in Home's first bundle. `next/dynamic` with `ssr: false`, in this Client Component as the Next 16
// lazy-loading guide asks, makes it its own chunk, and the chunk is requested only when the Widget first renders: once
// section 4 comes within one screen of view (an IntersectionObserver with a one-viewport root margin). The hero, section
// 2 and section 3 never import it. Until then, and while the chunk loads, the Widget's space holds a quiet frame of the
// same size, so nothing jumps.

const LiveWidget = dynamic(() => import("./live-widget").then((m) => m.LiveWidget), { ssr: false, loading: () => <WidgetSpace /> });

/** What a tab needs of a built Showcase: its words, its Widget's code and its Topic's title. */
export type ShowcaseTab = Pick<BuiltShowcase, "id" | "words" | "code" | "title" | "topicTitle">;

/** One screen: the observer's margin above and below the viewport, so the renderer is asked for a screen ahead. */
export const NEAR_MARGIN = "100% 0px";

/** True once `ref` comes within one screen of view, and from then on. */
function useNearView(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    // A browser with no IntersectionObserver gets the Widget at once, rather than never.
    if (typeof IntersectionObserver !== "function") {
      const id = setTimeout(() => setNear(true), 0);
      return () => clearTimeout(id);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setNear(true);
        observer.disconnect();
      },
      { rootMargin: NEAR_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, near]);
  return near;
}

/** The Widget's place before its renderer has loaded: a frame of the Widget's size, with nothing in it to read. */
function WidgetSpace() {
  return <div data-testid="showcase-widget-space" aria-hidden="true" className="min-h-[320px] rounded-xl border border-[var(--rule)] bg-[var(--frame)]" />;
}

export function ShowcaseTabs({ showcases }: { showcases: readonly ShowcaseTab[] }) {
  const [open, setOpen] = useState(0);
  const base = useId();
  const box = useRef<HTMLDivElement>(null);
  const near = useNearView(box);

  // The ARIA tabs pattern: arrows move between tabs (and open the one reached), Home and End go to the ends.
  const keys = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = showcases.length - 1;
    const to = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    setOpen(to);
    document.getElementById(`${base}-tab-${to}`)?.focus();
  };

  return (
    <div ref={box} data-testid="showcase-tabs">
      <div role="tablist" aria-label={copy.showcases.tabs} className="flex flex-wrap gap-2">
        {showcases.map((showcase, i) => (
          // A Chip for its look (the selected one shows, F2's accent tint); a tab for its meaning, so not a toggle.
          <Chip
            key={showcase.id}
            state={i === open ? "showing" : "idle"}
            aria-pressed={undefined}
            role="tab"
            id={`${base}-tab-${i}`}
            aria-selected={i === open}
            aria-controls={`${base}-panel-${i}`}
            tabIndex={i === open ? 0 : -1}
            onClick={() => setOpen(i)}
            onKeyDown={(e) => keys(e, i)}
            className="min-h-11"
          >
            {showcase.words.label}
          </Chip>
        ))}
      </div>
      {showcases.map((showcase, i) => (
        <div key={showcase.id} role="tabpanel" id={`${base}-panel-${i}`} aria-labelledby={`${base}-tab-${i}`} hidden={i !== open} data-showcase={showcase.id}>
          <div className="home-cols mt-8 items-start gap-y-8">
            <div className="col-span-12 lg:col-span-5">
              <p className="home-eyebrow">{showcase.words.label}</p>
              <p className="home-h3 mt-2">{showcase.topicTitle}</p>
              <p className="home-body mt-4 text-right font-medium">{copy.showcases.you}</p>
              <p className="home-body ml-auto mt-1 max-w-[28rem] rounded-xl bg-[var(--wash)] px-4 py-3 text-right">{showcase.words.question}</p>
              <p className="home-body mt-3 font-medium">{copy.showcases.tutor}</p>
              <p className="home-body mt-1">{showcase.words.reply}</p>
            </div>
            <div className="col-span-12 lg:col-span-7">
              {i === open && near ? <LiveWidget code={showcase.code} testId="showcase-widget" /> : <WidgetSpace />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
