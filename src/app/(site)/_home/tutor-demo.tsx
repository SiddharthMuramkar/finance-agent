"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { home } from "@/site/copy";
import { DEMO_ORDER, exampleBySlug, type Example } from "@/site/examples";
import { Rich } from "@/site/rich";
import { Button } from "../../primitives";
import { Glyph } from "../parts";
import { SignalWidget } from "../signal-widget";
import { useWidgetCall, type CallVerdict } from "../use-widget-call";

// The hero's Tutor demo (spec 7.2.1): a recorded conversation from the course whose widget is live. Five question chips;
// tapping a new one replays the script (learner's bubble, typing, the Tutor's lead and a skeleton, then the caption and
// the widget), and the learner's call adds the Tutor's follow-up. On first load the jackpot conversation is already
// complete with no animation. With reduced motion every delay is 0.

export type DemoPhase = "asked" | "typing" | "lead" | "widget";

/** When each phase starts after a tap, in ms (spec 7.2.1's script). */
export const DEMO_TIMES: readonly [DemoPhase, number][] = [
  ["typing", 200],
  ["lead", 950],
  ["widget", 1600],
];

const EXAMPLES = DEMO_ORDER.map((slug) => exampleBySlug(slug)!) as readonly Example[];

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function TutorDemo() {
  const [slug, setSlug] = useState(EXAMPLES[0].slug);
  const [phase, setPhase] = useState<DemoPhase>("widget");
  const [still, setStill] = useState(true);
  const [follow, setFollow] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const widgetHost = useRef<HTMLDivElement>(null);
  const example = exampleBySlug(slug)!;

  const clear = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const pick = (next: Example) => {
    if (next.slug === slug) return;
    clear();
    setSlug(next.slug);
    setFollow(null);
    setStill(false);
    if (reducedMotion()) {
      setPhase("widget");
      return;
    }
    setPhase("asked");
    for (const [to, at] of DEMO_TIMES) timers.current.push(window.setTimeout(() => setPhase(to), at));
  };

  const onCall = useCallback((verdict: CallVerdict) => setFollow(verdict === "right" ? example.follow.right : example.follow.other), [example]);
  useWidgetCall(widgetHost, onCall, phase === "widget" ? slug : null);

  return (
    <div className="v-demo">
      <div className="v-demo-head">
        <span className="v-avatar-tutor" aria-hidden="true">
          <Glyph size={18} />
        </span>
        <div>
          <p className="v-demo-title">{home.demo.title}</p>
          <p className="v-fine">{home.demo.sub}</p>
        </div>
      </div>
      <div className="v-demo-questions" role="group" aria-label={home.demo.pick}>
        <span className="v-label">{home.demo.pick}</span>
        {EXAMPLES.map((e) => (
          <DemoChip key={e.slug} pressed={e.slug === slug} onPress={() => pick(e)}>
            {e.chip}
          </DemoChip>
        ))}
      </div>
      <div className={`v-thread${still ? " still" : ""}`} aria-live="polite" data-testid="demo-thread">
        <p className="v-who">{home.demo.you}</p>
        <p className="v-bubble you">{example.demoAsk}</p>
        {phase === "typing" && (
          <div className="v-bubble tutor v-typing" role="img" aria-label={home.demo.typing}>
            <span />
            <span />
            <span />
          </div>
        )}
        {(phase === "lead" || phase === "widget") && (
          <>
            <p className="v-who">{home.demo.tutor}</p>
            <p className="v-bubble tutor">
              <Rich>{example.lead}</Rich>
            </p>
          </>
        )}
        {phase === "lead" && <div className="v-skel">{home.demo.opening}</div>}
        {phase === "widget" && (
          <>
            <p className="v-caption">
              <Glyph size={14} />
              {home.demo.caption}
            </p>
            <div ref={widgetHost} key={slug} data-testid="demo-widget">
              <SignalWidget kind={example.widget} slug={example.slug} />
            </div>
          </>
        )}
        {follow && (
          <>
            <p className="v-who">{home.demo.tutor}</p>
            <p className="v-bubble tutor">{follow}</p>
          </>
        )}
      </div>
    </div>
  );
}

/** A question chip: a Button drawn unstyled (no raw button outside the primitives), solid blue while selected. */
function DemoChip({ pressed, onPress, children }: { pressed: boolean; onPress: () => void; children: string }) {
  return (
    <Button unstyled pressed={pressed} className="v-qchip" onClick={onPress}>
      {children}
    </Button>
  );
}
