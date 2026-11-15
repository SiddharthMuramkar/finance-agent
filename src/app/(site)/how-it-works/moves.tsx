"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { howItWorks, LINGO } from "@/site/copy";
import { exampleBySlug } from "@/site/examples";
import { Rich } from "@/site/rich";
import { Button } from "../../primitives";
import { Facts, Icon, Pill, StoryText } from "../parts";

// How it works, the moves with a rail (spec 7.3, item 2): a sticky rail on the left (the running example, four bars that
// fill as moves are reached, a button per move and "Move n of 4"), four move articles on the right. Scroll spy: the
// active move is the last whose top is above 50% of the viewport (60% when narrower than 900 px). Every move's body is
// interactive in the browser; nothing calls the server.

const AMAZON = exampleBySlug("amazon-2000")!;
const MOVE_NAMES = ["Hear the story", "Learn the lingo", "Try it", "Value it"] as const;
const money = (n: number) => `$${n.toFixed(2)}`;

function Inside({ steps }: { steps: readonly string[] }) {
  return (
    <p className="v-inside">
      {howItWorks.inside}
      {steps.map((step) => (
        <Pill key={step} tone="plain">
          {step}
        </Pill>
      ))}
    </p>
  );
}

function Lingo() {
  const [term, setTerm] = useState<(typeof LINGO)[number]["term"]>("price");
  const card = LINGO.find((c) => c.term === term)!;
  return (
    <div className="v-lingo v-stack">
      <div className="v-row" role="group" aria-label="Terms">
        {LINGO.map((c) => (
          <Button key={c.term} unstyled pressed={c.term === term} className="v-chip" onClick={() => setTerm(c.term)}>
            {c.term}
          </Button>
        ))}
      </div>
      <div className="v-card v-stack" aria-live="polite">
        <p className="v-lingo-term">{card.term}</p>
        <p>
          <strong>{card.means}</strong>
        </p>
        <dl>
          <div>
            <dt>{howItWorks.lingo.pro}</dt>
            <dd>{card.pro}</dd>
          </div>
          <div>
            <dt>{howItWorks.lingo.example}</dt>
            <dd>{card.example}</dd>
          </div>
          <div>
            <dt>{howItWorks.lingo.inStory}</dt>
            <dd>{card.inStory}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function TryIt() {
  const [picked, setPicked] = useState<string | null>(null);
  const choice = howItWorks.tryIt.choices.find((c) => c.id === picked);
  return (
    <fieldset className="v-call">
      <legend>
        <span className="v-call-tag">{howItWorks.tryIt.yourCall}</span>
        {howItWorks.tryIt.ask}
      </legend>
      <div className="v-row">
        {howItWorks.tryIt.choices.map((c) => {
          const marked = c.id === picked;
          return (
            <Button key={c.id} unstyled pressed={marked} className={`v-chip${marked ? (c.right ? " is-right" : " is-wrong") : ""}`} onClick={() => setPicked(c.id)}>
              {marked && <Icon name={c.right ? "check" : "cross"} />}
              {c.label}
            </Button>
          );
        })}
      </div>
      <p className="v-call-feedback" aria-live="polite">
        {choice && (
          <>
            <Pill tone={choice.right ? "gain" : "loss"} icon={choice.right ? "check" : "cross"}>
              {choice.right ? howItWorks.tryIt.right : howItWorks.tryIt.notQuite}
            </Pill>
            <span>{choice.fb}</span>
          </>
        )}
      </p>
    </fieldset>
  );
}

function ValueIt() {
  const { slider, min, max, start, reveal, facts, figures, key } = howItWorks.valueIt;
  const [value, setValue] = useState<number>(start);
  const [shown, setShown] = useState(false);
  const fill = { "--range-fill": `${((value - min) / (max - min)) * 100}%` } as CSSProperties;
  return (
    <div className="v-stack">
      <label className="v-stack" style={{ gap: 4 }}>
        <span className="v-range-row">
          <span>{slider}</span>
          <output aria-live="polite">{money(value)}</output>
        </span>
        <input type="range" className="range-you v-range" min={min} max={max} step={1} value={value} onChange={(e) => setValue(Number(e.target.value))} style={fill} />
      </label>
      <div>
        <Button unstyled className="v-btn v-btn-secondary" onClick={() => setShown(true)} disabled={shown}>
          {reveal}
        </Button>
      </div>
      {shown && (
        <div className="v-stack v-rise" aria-live="polite">
          <Facts
            facts={[
              { label: facts.yours, value: money(value), you: true },
              { label: facts.his, value: money(figures.his) },
              { label: facts.price, value: money(figures.price) },
              { label: facts.low, value: money(figures.low) },
            ]}
          />
          <p>
            <Rich>{key}</Rich>
          </p>
        </div>
      )}
    </div>
  );
}

function Move({ index, setRef, children }: { index: number; setRef: (el: HTMLElement | null) => void; children: ReactNode }) {
  return (
    <article id={`move-${index + 1}`} ref={setRef} className="v-move" aria-labelledby={`move-${index + 1}-h`}>
      <p className="v-move-n">{String(index + 1).padStart(2, "0")}</p>
      <h2 className="v-h2" id={`move-${index + 1}-h`}>
        {MOVE_NAMES[index]}
      </h2>
      {children}
      <Inside steps={howItWorks.steps[index]} />
    </article>
  );
}

export function HowMoves() {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const line = window.innerHeight * (window.innerWidth < 900 ? 0.6 : 0.5);
      let now = 0;
      refs.current.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= line) now = i;
      });
      setActive(now);
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

  const go = (i: number) => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    refs.current[i]?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  const setRef = (i: number) => (el: HTMLElement | null) => void (refs.current[i] = el);

  return (
    <div className="v-hiw">
      <aside className="v-rail" aria-label="Moves">
        <p className="v-label">{howItWorks.rail.title}</p>
        <div className="v-rail-bars" aria-hidden="true">
          {MOVE_NAMES.map((name, i) => (
            <span key={name} className={i <= active ? "on" : undefined} style={{ height: `${(i + 1) * 25}%` }} />
          ))}
        </div>
        <ol>
          {MOVE_NAMES.map((name, i) => (
            <li key={name}>
              <Button unstyled aria-current={i === active ? "step" : undefined} onClick={() => go(i)}>
                {name}
              </Button>
            </li>
          ))}
        </ol>
        <p className="v-small note" aria-live="polite">
          {active === 3 ? <Rich>{howItWorks.rail.done}</Rich> : howItWorks.rail.moveOf(active + 1)}
        </p>
      </aside>
      <div>
        <Move index={0} setRef={setRef(0)}>
          <StoryText story={AMAZON.story} />
          <Facts facts={AMAZON.facts} />
        </Move>
        <Move index={1} setRef={setRef(1)}>
          <Lingo />
        </Move>
        <Move index={2} setRef={setRef(2)}>
          <TryIt />
        </Move>
        <Move index={3} setRef={setRef(3)}>
          <ValueIt />
        </Move>
        <p className="v-small">
          <Rich>{howItWorks.closingLine}</Rich>
        </p>
      </div>
    </div>
  );
}
