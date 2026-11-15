"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LeversWidget } from "@/components/signal";
import { home } from "@/site/copy";
import { examplePath } from "@/site/examples";
import type { LeverStep } from "@/site/levers-story";
import { Rich } from "@/site/rich";
import { Icon } from "../parts";

// Home's levers scroll story (spec 7.2.3): six text steps on the left, the sticky lever lab on the right (a strip under the
// nav at 900 px and below). The active step is the last one whose top is above 55% of the viewport (78% when narrower than
// 900 px), checked on scroll and resize inside requestAnimationFrame; the hint under the lab follows it.
//
// The widget contract gives the site no way to set the lab's step, so the lab is the Levers widget at Amazon's numbers
// and every lever stays live; driving the lab per step (one lever enabled, its band, presets and the win line) waits for
// a widget API beyond the contract.

const STORY_SLUG = "amazon-2000";

/** The index of the active step: the last whose top edge is above `line` px from the viewport's top (0 if none). */
export function activeStep(tops: readonly number[], line: number): number {
  let active = 0;
  tops.forEach((top, i) => {
    if (top <= line) active = i;
  });
  return active;
}

export function LeversStory({ steps }: { steps: LeverStep[] }) {
  const stepsBox = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const narrow = window.innerWidth < 900;
      const line = window.innerHeight * (narrow ? 0.78 : 0.55);
      const tops = [...(stepsBox.current?.querySelectorAll(":scope > .v-step") ?? [])].map((el) => el.getBoundingClientRect().top);
      setActive(activeStep(tops, line));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const hint = active === 0 ? home.levers.hints.intro : active <= 4 ? home.levers.hints.lever(active) : home.levers.hints.yourTurn;
  const step = (i: number) => ({ className: `v-step${active === i ? " active" : ""}` });

  return (
    <section className="v-section" aria-labelledby="levers-h" data-site-section="levers">
      <div className="v-wrap v-story-grid">
        <div className="v-steps" ref={stepsBox}>
          <article {...step(0)}>
            <p className="v-eyebrow">{home.levers.eyebrow}</p>
            <h2 className="v-h2" id="levers-h">
              {home.levers.h2}
            </h2>
            {home.levers.intro.map((line) => (
              <p key={line} className="v-story">
                <Rich>{line}</Rich>
              </p>
            ))}
          </article>
          {steps.map((lever, i) => (
            <article key={lever.key} {...step(i + 1)}>
              <p className="v-label">{home.levers.leverOf(i + 1)}</p>
              <h2 className="v-h2">{lever.name}</h2>
              <p className="v-story">
                <Rich>{lever.story}</Rich>
              </p>
              <p className="v-power">
                <Rich>{lever.power}</Rich>
              </p>
            </article>
          ))}
          <article {...step(5)}>
            <p className="v-label">{home.levers.yourTurn}</p>
            <h2 className="v-h2">{home.levers.yourTurnH2}</h2>
            <p className="v-story">
              <Rich>{home.levers.yourTurnBody}</Rich>
            </p>
            <Link href={examplePath(STORY_SLUG)} className="v-tlink">
              {home.levers.fullCase}
              <Icon name="arrow" />
            </Link>
          </article>
        </div>
        <div className="v-lab">
          <LeversWidget caseSlug={STORY_SLUG} />
          <p className="v-hint" aria-live="polite">
            {hint}
          </p>
        </div>
      </div>
    </section>
  );
}
