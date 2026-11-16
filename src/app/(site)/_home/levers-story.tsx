"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import Link from "next/link";
import { LeverStage, leverText } from "@/components/signal";
import { leversModel, PRESETS, PRICE, REFERENCE, type LeverKey, type Levers, type PresetKey } from "@/finance/signal/levers";
import { AMAZON_SOURCE, home } from "@/site/copy";
import { examplePath } from "@/site/examples";
import type { LeverStep } from "@/site/levers-story";
import { Rich } from "@/site/rich";
import { Button } from "../../primitives";
import { Icon, Pill, SourceLine } from "../parts";

// Home's levers scroll story (spec 7.2.3): six text steps on the left, the sticky lever lab on the right (a strip under the
// nav at 900 px and below). The active step is the last one whose top is above 55% of the viewport (78% when narrower than
// 900 px), checked on scroll and resize inside requestAnimationFrame. The step drives the stage: his story with no lever
// live (step 0), one lever live with its band (steps 1 to 4), all four live with presets and the win line (step 5).

const STORY_SLUG = "amazon-2000";
/** The "Your turn" step. */
export const YOUR_TURN = 5;

/** The index of the active step: the last whose top edge is above `line` px from the viewport's top (0 if none). */
export function activeStep(tops: readonly number[], line: number): number {
  let active = 0;
  tops.forEach((top, i) => {
    if (top <= line) active = i;
  });
  return active;
}

/** The stage: the step it shows, the lever values it draws, and the learner's own story, kept for step 5. */
export type StoryState = { step: number; values: Levers; saved: Levers };
export type StoryAction = { type: "step"; step: number } | { type: "move"; key: LeverKey; value: number } | { type: "preset"; key: PresetKey };

export const STORY_START: StoryState = { step: 0, values: REFERENCE, saved: REFERENCE };

/**
 * The step rules (spec 7.2.3): leaving step 5 saves the learner's four values; entering a step below 5 resets the stage to
 * his story; returning to step 5 restores the saved values. A preset switches the stage to step 5 first, then applies.
 */
export function storyReducer(state: StoryState, action: StoryAction): StoryState {
  switch (action.type) {
    case "step": {
      if (action.step === state.step) return state;
      const saved = state.step === YOUR_TURN ? state.values : state.saved;
      return { step: action.step, saved, values: action.step === YOUR_TURN ? saved : REFERENCE };
    }
    case "move":
      return { ...state, values: { ...state.values, [action.key]: action.value } };
    case "preset":
      return { ...storyReducer(state, { type: "step", step: YOUR_TURN }), values: { ...PRESETS[action.key].levers } };
  }
}

/** What the stage shows at a step: which lever is live and banded (steps 1 to 4), and whether any lever is live. */
export function stageAt(step: number, steps: readonly LeverStep[]): { live: boolean; focus: LeverKey | null } {
  if (step === 0) return { live: false, focus: null };
  if (step >= YOUR_TURN) return { live: true, focus: null };
  return { live: true, focus: steps[step - 1]?.key ?? null };
}

export function LeversStory({ steps }: { steps: LeverStep[] }) {
  const stepsBox = useRef<HTMLDivElement>(null);
  const [state, dispatch] = useReducer(storyReducer, STORY_START);
  const { step, values } = state;

  useEffect(() => {
    let frame = 0;
    let spied = 0;
    const check = () => {
      frame = 0;
      const narrow = window.innerWidth < 900;
      const line = window.innerHeight * (narrow ? 0.78 : 0.55);
      const tops = [...(stepsBox.current?.querySelectorAll(":scope > .v-step") ?? [])].map((el) => el.getBoundingClientRect().top);
      const next = activeStep(tops, line);
      // Only a change of scroll step moves the stage, so a preset's switch to step 5 holds until the learner scrolls on.
      if (next !== spied) {
        spied = next;
        dispatch({ type: "step", step: next });
      }
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

  const { live, focus } = stageAt(step, steps);
  const won = useMemo(() => step === YOUR_TURN && Math.round(leversModel(values).perShare) >= PRICE, [step, values]);
  const hint = step === 0 ? home.levers.hints.intro : step < YOUR_TURN ? home.levers.hints.lever(step) : home.levers.hints.yourTurn;
  const stepProps = (i: number) => ({ className: `v-step${step === i ? " active" : ""}`, "data-step": i });

  return (
    <section className="v-section" aria-labelledby="levers-h" data-site-section="levers">
      <div className="v-wrap v-story-grid">
        <div className="v-steps" ref={stepsBox}>
          <article {...stepProps(0)}>
            <p className="v-eyebrow">{home.levers.eyebrow}</p>
            <h2 className="v-h2" id="levers-h">
              {home.levers.h2}
            </h2>
            {home.levers.intro.map((line) => (
              <p key={line} className="v-story">
                <Rich>{line}</Rich>
              </p>
            ))}
            <SourceLine source={AMAZON_SOURCE} />
          </article>
          {steps.map((lever, i) => (
            <article key={lever.key} {...stepProps(i + 1)}>
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
          <article {...stepProps(YOUR_TURN)}>
            <p className="v-label">{home.levers.yourTurn}</p>
            <h2 className="v-h2">{home.levers.yourTurnH2}</h2>
            <p className="v-story">
              <Rich>{home.levers.yourTurnBody}</Rich>
            </p>
            <div className="v-chips" role="group" aria-label={home.levers.presets}>
              {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
                <Button key={key} unstyled className="v-chip" onClick={() => dispatch({ type: "preset", key })}>
                  {PRESETS[key].label}
                </Button>
              ))}
            </div>
            <div aria-live="polite" data-testid="levers-win">
              {won && (
                <p className="v-win">
                  <Pill tone="blue" icon="check">
                    {home.levers.win.pill}
                  </Pill>{" "}
                  {home.levers.win.line(leverText("rev", values.rev), leverText("margin", values.margin))}
                </p>
              )}
            </div>
            <Link href={examplePath(STORY_SLUG)} className="v-tlink">
              {home.levers.fullCase}
              <Icon name="arrow" />
            </Link>
          </article>
        </div>
        <div className="v-lab">
          <LeverStage values={values} live={live} focus={focus} band={focus} onChange={(key, value) => dispatch({ type: "move", key, value })} />
          <p className="v-hint" aria-live="polite">
            {hint}
          </p>
        </div>
      </div>
    </section>
  );
}
