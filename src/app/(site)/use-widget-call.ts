"use client";

import { useEffect, useRef, type RefObject } from "react";

// The learner's call inside a mounted widget (spec 5.6 `onCall`: "the first time the learner commits: first chip tap, or
// first lever change in the levers widget"). The widget contract gives the site no callback prop, so the host listens on
// the widget's element instead, in this order of trust:
// 1. a bubbling `signal:call` CustomEvent whose detail is `{ verdict }` (the widgets may dispatch it; it is exact);
// 2. a tap on a chip of the widget's "Your call" fieldset (5.7), its verdict read from the chip once the widget marks it
//    (`data-verdict`, or the `is-right` / `is-wrong` / `is-careful` state);
// 3. the first `input` on a range inside the widget (the levers widget's first lever change).
// It fires once per `resetKey`.

export type CallVerdict = "right" | "wrong" | "careful" | null;

/** A verdict word, or null for anything else. */
function verdictWord(said: unknown): CallVerdict {
  return said === "right" || said === "wrong" || said === "careful" ? said : null;
}

/** The verdict a marked chip shows, or null when it shows none. */
export function verdictOf(chip: Element): CallVerdict {
  const said = verdictWord(chip.getAttribute("data-verdict"));
  if (said) return said;
  if (chip.classList.contains("is-right")) return "right";
  if (chip.classList.contains("is-wrong")) return "wrong";
  if (chip.classList.contains("is-careful")) return "careful";
  return null;
}

/** Calls `onCall` once, with the verdict, when the learner first commits inside `host`. */
export function useWidgetCall(host: RefObject<HTMLElement | null>, onCall: (verdict: CallVerdict) => void, resetKey: unknown) {
  const latest = useRef(onCall);
  useEffect(() => {
    latest.current = onCall;
  });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let done = false;
    const fire = (verdict: CallVerdict) => {
      if (done) return;
      done = true;
      latest.current(verdict);
    };
    const onEvent = (event: Event) => fire(verdictWord((event as CustomEvent<{ verdict?: string } | null>).detail?.verdict));
    const onClick = (event: MouseEvent) => {
      const chip = event.target instanceof Element ? event.target.closest("fieldset button") : null;
      if (!chip || !el.contains(chip)) return;
      // The widget marks the chip in the same press; read it on the next frame.
      requestAnimationFrame(() => fire(verdictOf(chip)));
    };
    const onInput = (event: Event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === "range") fire(null);
    };
    el.addEventListener("signal:call", onEvent);
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    return () => {
      el.removeEventListener("signal:call", onEvent);
      el.removeEventListener("click", onClick);
      el.removeEventListener("input", onInput);
    };
  }, [host, resetKey]);
}
