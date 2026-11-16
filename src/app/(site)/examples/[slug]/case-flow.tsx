"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { casePage } from "@/site/copy";
import type { Example } from "@/site/examples";
import { Rich } from "@/site/rich";
import { Button } from "../../../primitives";
import { Facts, Icon, StoryText } from "../../parts";
import { SignalWidget } from "../../signal-widget";

// The case page's flow (spec 7.5): the progress row, the left column (story, question, the Tutor's answer, the ending)
// and the full widget on the right. Load: answer waiting, ending locked (with "Skip to the ending"). The learner's call
// in the widget: the answer rises in, the ending becomes ready. Reveal or skip: the ending shows what happened and its
// sources, and focus moves to it. At 980 px and below it is one column: story, question, widget, answer, ending.

export type CaseStage = "load" | "called" | "revealed";

/** Each progress step's state at a stage: done, now, or upcoming. */
export function progressStates(stage: CaseStage): ("done" | "now" | "upcoming")[] {
  if (stage === "load") return ["done", "now", "upcoming", "upcoming"];
  if (stage === "called") return ["done", "done", "now", "upcoming"];
  return ["done", "done", "done", "done"];
}

/** Keeps the widget sticky only while it fits: its height under the viewport's minus 100 px (spec 7.5). */
function useFits(ref: RefObject<HTMLElement | null>) {
  const [fits, setFits] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setFits(el.offsetHeight < window.innerHeight - 100);
    const seen = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    seen?.observe(el);
    window.addEventListener("resize", check);
    requestAnimationFrame(check);
    return () => {
      seen?.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [ref]);
  return fits;
}

export function CaseFlow({ example }: { example: Example }) {
  // The call unlocks the answer; the reveal (or a skip, which leaves the answer waiting) ends the flow.
  const [answered, setAnswered] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const stage: CaseStage = revealed ? "revealed" : answered ? "called" : "load";
  const widget = useRef<HTMLDivElement>(null);
  const reveal = useRef<HTMLDivElement>(null);
  const fits = useFits(widget);

  const open = () => {
    setRevealed(true);
    requestAnimationFrame(() => reveal.current?.focus());
  };

  const states = progressStates(stage);

  return (
    <>
      <ol className="v-prog" aria-label="Progress">
        {casePage.progress.map((label, i) => (
          <li key={label} className={states[i] === "upcoming" ? undefined : states[i]} aria-current={states[i] === "now" ? "step" : undefined}>
            <span className="n">{states[i] === "done" ? <Icon name="check" /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <div className="v-case">
        <section className="story" aria-labelledby="case-story">
          <h2 className="v-label" id="case-story">
            {casePage.story}
          </h2>
          <StoryText story={example.story} />
          <Facts facts={example.facts} />
        </section>

        <section className="question" aria-labelledby="case-question">
          <h2 className="v-label" id="case-question">
            {casePage.question}
          </h2>
          <div className="thread">
            <p className="v-who">{casePage.you}</p>
            <p className="v-bubble you">{example.ask}</p>
            <p className="v-who">{casePage.tutor}</p>
            <p className="v-bubble tutor">
              <Rich>{example.lead}</Rich>
            </p>
          </div>
        </section>

        <div ref={widget} className={`widget${fits ? " sticky" : ""}`} data-testid="case-widget">
          <SignalWidget kind={example.widget} slug={example.slug} onCall={() => setAnswered(true)} />
        </div>

        <section className="answer" aria-labelledby="case-answer">
          <h2 className="v-label" id="case-answer">
            {casePage.answer}
          </h2>
          <div aria-live="polite">
            {answered ? (
              <p className="v-bubble tutor v-rise">
                <Rich>{example.answer}</Rich>
              </p>
            ) : (
              <p className="v-bubble wait">
                <Icon name="lock" />
                {casePage.waiting}
              </p>
            )}
          </div>
        </section>

        <section className="ending" aria-labelledby="case-ending">
          <h2 className="v-label" id="case-ending">
            {casePage.ending}
          </h2>
          {stage === "load" && (
            <div className="v-locked">
              <p className="v-small">
                <Icon name="lock" /> {casePage.locked[example.endingKind]}
              </p>
              <div>
                <Button unstyled className="v-btn v-btn-quiet v-btn-sm" onClick={open}>
                  {casePage.skip}
                </Button>
              </div>
            </div>
          )}
          {stage === "called" && (
            <div className="v-card v-stack v-rise">
              <p>{casePage.ready}</p>
              <div>
                <Button unstyled className="v-btn v-btn-primary" onClick={open}>
                  {casePage.reveal(example.endingLabel)}
                </Button>
              </div>
            </div>
          )}
          {stage === "revealed" && (
            <div ref={reveal} tabIndex={-1} className="v-card v-stack v-rise" data-testid="case-reveal">
              <h3 className="v-h3">{example.endingLabel}</h3>
              <p>
                <Rich>{example.ending}</Rich>
              </p>
              <p className="v-fine">
                {casePage.sources} {example.sources}
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
