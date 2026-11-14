"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/icons/icon";
import type { IconName } from "@/icons/names";
import type { QuickTryData, QuickTryResultData } from "@/tutor/session-item-kinds";
import { track } from "../analytics";
import { Button } from "../primitives";
import { QuickTryContext, QuickTryResultView, QuickTryView, type QuickTryHost, type QuickTryPick } from "../quick-try-view";
import { copy } from "./copy";
import { HOME_QUICK_TRY, HOME_REVEAL, HOME_REVEAL_FIGURES, HOME_STEPS_TOPIC, HOME_TERM, storyBeats } from "./how-topics-work-steps";

/**
 * Home's section 3, "How every Topic works" (spec 2026-11-12 E1, E5), on a Band (F1: Home's second Band; sections 2 and 4
 * keep it apart from the hero's and the closing Band). A four-step control: Hear the story, Learn the lingo, Try it and
 * Value it, as ARIA tabs of white buttons on the Band (F1, F4), each with its one line of caption (Appendix F). Each step
 * shows a real piece of Spine Topic 1 on a white card (band-card), written ahead in how-topics-work-steps.ts: the story
 * scene, a Lingo card that turns over, one judgement Quick try and the reveal.
 *
 * The visitor moves between steps; nothing plays by itself. The Quick try is the Study Workspace's own QuickTryView, given
 * a host that marks the tap here at once: a wrong tap gets its cross, "Your pick" and its fix (G4), with no request, no
 * model call and no sign-in. E10: the first step the visitor opens sends `home_step_opened` once, with the step's id and
 * nothing about the visitor. E8: this file never imports the general Widget renderer (LiveWidget, WidgetWithSave, OpenUI):
 * landing.test.tsx reads its imports, and e2e/home.spec.ts's E8 test finds no renderer code in Home's first scripts. E9: the Lingo card turns (300 ms), and not for a visitor who asked for reduced motion.
 */

export const STEP_IDS = ["story", "lingo", "try", "value"] as const;
export type StepId = (typeof STEP_IDS)[number];

export function HowTopicsWork() {
  const [open, setOpen] = useState(0);
  const base = useId();
  const sent = useRef(false);
  const words = copy.movesUi;

  // Opening a step the visitor is not on; pressing the open one again changes nothing and is not counted.
  const choose = (i: number) => {
    if (i === open) return;
    setOpen(i);
    if (sent.current) return;
    sent.current = true;
    track("home_step_opened", { step: STEP_IDS[i] });
  };

  // The ARIA tabs pattern: arrows move between steps (and open the one reached), Home and End go to the ends. Up and Down
  // work as Left and Right, since on a phone the steps stand in a two-by-two grid.
  const keys = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = STEP_IDS.length - 1;
    const next = i === last ? 0 : i + 1;
    const prev = i === 0 ? last : i - 1;
    const to = { ArrowRight: next, ArrowDown: next, ArrowLeft: prev, ArrowUp: prev, Home: 0, End: last }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    choose(to);
    document.getElementById(`${base}-tab-${to}`)?.focus();
  };

  return (
    <section id="how-it-works" data-home-section="how-it-works" data-band="home-how-it-works" className="band mt-[var(--home-section)] py-[clamp(48px,5.5vw,80px)]">
      <div className="home-wrap">
        <div className="home-cols gap-y-4">
          <h2 className="home-h2 col-span-12 lg:col-span-8">{copy.movesTitle}</h2>
          <p className="home-lede col-span-12 lg:col-span-4">{copy.movesIntro}</p>
        </div>

        <div role="tablist" aria-label={words.tabs} data-testid="home-steps" className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {copy.moves.map((move, i) => {
            const selected = i === open;
            return (
              // A white button on the Band (F1, F4). The open step is bold with an ink bar along its foot, inside the button,
              // so the Band's white focus ring outside it stays plain to see.
              <Button
                key={move.name}
                variant="secondary"
                role="tab"
                id={`${base}-tab-${i}`}
                aria-selected={selected}
                aria-controls={`${base}-panel-${i}`}
                tabIndex={selected ? 0 : -1}
                data-step={STEP_IDS[i]}
                onClick={() => choose(i)}
                onKeyDown={(e) => keys(e, i)}
                className={`relative h-auto min-h-11 justify-start gap-2 py-2.5 text-left ${selected ? "font-semibold" : ""}`.trim()}
              >
                <span aria-hidden="true" className="text-[12px] font-semibold tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Icon name={move.icon as IconName} size={20} />
                <span>{move.name}</span>
                {selected && <span aria-hidden="true" data-open-mark="" className="absolute inset-x-3 bottom-1 h-[3px] rounded-full bg-[var(--on-band-button-ink)]" />}
              </Button>
            );
          })}
        </div>

        {copy.moves.map((move, i) => (
          <div key={move.name} role="tabpanel" id={`${base}-panel-${i}`} aria-labelledby={`${base}-tab-${i}`} hidden={i !== open} data-step-panel={STEP_IDS[i]} className="mt-4">
            {/* The step's one line of caption, on the Band. */}
            <p className="home-body">{move.line}</p>
            <div className="band-card mt-3 rounded-xl border border-[var(--rule)] p-4 sm:p-5">
              {i === open && <StepCard step={STEP_IDS[i]} />}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StepCard({ step }: { step: StepId }) {
  if (step === "story") return <StoryCard />;
  if (step === "lingo") return <LingoCard />;
  if (step === "try") return <TryCard />;
  return <RevealCard />;
}

/**
 * Hear the story: the Case's story as a scene, every beat on screen at once (B8: no Next for each line), the date first.
 * The beats run on as one paragraph, so the scene stays short enough for E1's page height.
 */
function StoryCard() {
  const [date, ...beats] = storyBeats();
  return (
    <figure data-testid="home-step-story" aria-label={copy.movesUi.storyLabel} className="m-0 flex items-start gap-3">
      <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-lg border border-[var(--rule)]">
        <Icon name="scroll" size={24} />
      </span>
      <p className="m-0 text-[15px] leading-6 text-[var(--ink)]">
        <span data-beat="" className="type-eyebrow mr-2 text-key-number">
          {date}
        </span>
        {beats.map((beat, i) => (
          <span key={beat} data-beat="">
            {i > 0 && " "}
            {beat}
          </span>
        ))}
      </p>
    </figure>
  );
}

/** Learn the lingo: one Lingo card, the word "price", that turns over to show the word in the story. */
function LingoCard() {
  const words = copy.movesUi;
  const [turned, setTurned] = useState(false);
  const face = "lingo-face overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--raised)]";
  return (
    <section data-testid="home-step-lingo" aria-label={`Lingo: ${HOME_TERM.term}`}>
      <div className="lingo-turn relative">
        <div className="lingo-inner relative motion-reduce:transition-none" data-flipped={turned}>
          <div data-testid="home-lingo-front" aria-hidden={turned} inert={turned} className={`${face} border-l-2 border-l-[var(--violet)] p-4`}>
            <p className="type-eyebrow text-key-number">{words.lingoLabel}</p>
            <p className="mt-1 text-2xl leading-8 text-[var(--ink)]">{HOME_TERM.term}</p>
            <p className="mt-1 text-base leading-6 text-[var(--ink)]">{HOME_TERM.means}</p>
            <p className="mt-3 text-sm leading-5 text-[var(--ink)]">
              <span className="font-medium text-[var(--muted)]">{words.pro} </span>
              {HOME_TERM.pro}
            </p>
            <p className="mt-2 text-sm leading-5 text-[var(--ink)]">
              <span className="font-medium text-[var(--muted)]">{words.example} </span>
              {HOME_TERM.example}
            </p>
          </div>
          <div data-testid="home-lingo-back" aria-hidden={!turned} inert={!turned} className={`${face} lingo-face-back flex items-center border-l-2 border-l-[var(--sun)] p-4`}>
            <div>
              <p className="type-eyebrow text-key-number">{words.inStory}</p>
              <p className="mt-1 text-xl font-medium text-[var(--ink)]">{HOME_TERM.term}</p>
              <p className="mt-2 text-base leading-6 text-[var(--ink)]">{HOME_TERM.inStory}</p>
            </div>
          </div>
        </div>
      </div>
      <Button variant="secondary" size="sm" pressed={turned} onClick={() => setTurned((v) => !v)} data-testid="home-lingo-turn" className="mt-3 min-h-11">
        {words.inStory}
      </Button>
    </section>
  );
}

/** The Quick try as Home asks it: the Workspace's shape, never a box to type in. */
const TRY_DATA: QuickTryData = {
  key: `home:${HOME_QUICK_TRY.id}`,
  checkId: HOME_STEPS_TOPIC,
  skillId: HOME_QUICK_TRY.skill,
  prompt: HOME_QUICK_TRY.ask,
  kind: "choice",
  choices: HOME_QUICK_TRY.choices.map(({ id, text }) => ({ id, text })),
};

/** Marks a tap here, at once: the right choice, or the wrong one's fix (its Known mistake). */
export function markHomeTry(choice: string): QuickTryResultData {
  const { answer } = HOME_QUICK_TRY;
  if (choice === answer) return { key: TRY_DATA.key, verdict: "right", line: copy.movesUi.right, choice, answer };
  const fix = HOME_QUICK_TRY.choices.find((c) => c.id === choice)?.fix;
  return { key: TRY_DATA.key, verdict: fix ? "known_mistake" : "wrong", line: fix ?? copy.movesUi.notQuite, choice, answer };
}

/**
 * Try it: one judgement Quick try, marked in the browser the moment it is tapped, with Try again to clear it. The mark is
 * read out (a live region), focus moves to Try again once the choices lock, and Try again draws a fresh try (a new key,
 * so no chip stays pressed) with focus on its first choice.
 */
function TryCard() {
  const [result, setResult] = useState<QuickTryResultData | null>(null);
  const [attempt, setAttempt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const again = useRef<HTMLButtonElement>(null);
  const host: QuickTryHost = useMemo(
    () => ({
      locked: false,
      answered: new Map<string, QuickTryPick>(result ? [[TRY_DATA.key, { choice: result.choice, answer: result.answer }]] : []),
      answer: async (_key, choice) => {
        setResult(markHomeTry(choice));
        return null;
      },
    }),
    [result],
  );
  useEffect(() => {
    if (result) again.current?.focus();
    else if (attempt > 0) box.current?.querySelector<HTMLButtonElement>('[data-testid="quick-try-choice"]')?.focus();
  }, [result, attempt]);
  return (
    <div ref={box} data-testid="home-step-try" className="space-y-3">
      <QuickTryContext.Provider value={host}>
        <QuickTryView key={attempt} data={TRY_DATA} />
      </QuickTryContext.Provider>
      {/* Always rendered, so the mark is read out when it arrives. */}
      <div aria-live="polite" data-testid="home-try-mark" className="flex flex-wrap items-center gap-3">
        {result && (
          <>
            <QuickTryResultView data={result} />
            <Button
              ref={again}
              variant="secondary"
              size="sm"
              onClick={() => {
                setResult(null);
                setAttempt((n) => n + 1);
              }}
              className="min-h-11"
            >
              {copy.movesUi.again}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Value it: the reveal, with his value a share and the price that day as two bars on one scale. */
function RevealCard() {
  const words = copy.movesUi;
  const { value, price } = HOME_REVEAL_FIGURES;
  const top = Math.max(value, price);
  const rows = [
    { id: "value", label: words.revealValue, figure: value, fill: "var(--line-strong)" },
    { id: "price", label: words.revealPrice, figure: price, fill: "var(--ink)" },
  ];
  return (
    <figure data-testid="home-step-value" className="m-0 space-y-4">
      <p className="type-eyebrow text-key-number">{words.revealLabel}</p>
      <div className="space-y-3" role="img" aria-label={rows.map((r) => `${r.label}: $${r.figure.toFixed(2)}`).join("; ")}>
        {rows.map((r) => (
          <div key={r.id} data-reveal-bar={r.id}>
            <p className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-[var(--muted)]">{r.label}</span>
              <span className="font-medium tabular-nums text-[var(--ink)]">${r.figure.toFixed(2)}</span>
            </p>
            <div className="mt-1 h-2.5 w-full" aria-hidden="true">
              <div className="h-full" style={{ width: `${Math.round((r.figure / top) * 10000) / 100}%`, background: r.fill }} />
            </div>
          </div>
        ))}
      </div>
      <figcaption className="text-[15px] leading-6 text-[var(--ink)]">{HOME_REVEAL}</figcaption>
    </figure>
  );
}
