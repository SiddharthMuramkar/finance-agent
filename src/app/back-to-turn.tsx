"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { quickTryOf } from "./quick-try-view";
import { SecondaryButton } from "./ui";
import type { ThreadLine } from "./thread";
import { QUICK_TRY, QUICK_TRY_RESULT } from "@/tutor/session-item-kinds";

// "Back to your turn" (spec 2026-11-12 G3, A5; ADR 0006): after a few own questions the open Quick try can sit far above
// what the Learner is reading. While it is off screen, a button above the message box brings it back.

const QUICK_TRY_CARD = '[data-testid="quick-try"]';

/** The key of the open Quick try: the latest one drawn in the thread, while it has no result. Null when there is none. */
export function openQuickTryKey(messages: readonly ThreadLine[]): string | null {
  const at = messages.findLastIndex((m) => m.role === "item" && m.kind === QUICK_TRY && quickTryOf(m.data) !== null);
  if (at < 0) return null;
  const line = messages[at];
  const key = line.role === "item" ? (line.data.key as string) : null;
  const answered = messages.some((m) => m.role === "item" && m.kind === QUICK_TRY_RESULT && m.data.key === key);
  return answered ? null : key;
}

/** The open Quick try's card: the last one drawn (A5 re-shows it under each own-question reply, so the newest copy wins). */
function openCard(thread: HTMLElement): HTMLElement | null {
  const cards = thread.querySelectorAll<HTMLElement>(QUICK_TRY_CARD);
  return cards.item(cards.length - 1);
}

/** Smooth, unless the Learner asked for less motion. */
function scrollBehavior(): ScrollBehavior {
  const reduce = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return reduce ? "auto" : "smooth";
}

/**
 * Brings the open Quick try back into view and puts focus on it: its first choice that can be tapped, else the card itself.
 * Focus does not scroll on its own, so a smooth scroll is not cut short.
 */
export function backToTurn(card: HTMLElement) {
  card.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
  const choice = card.querySelector<HTMLElement>("button:not(:disabled)");
  if (choice) return choice.focus({ preventScroll: true });
  if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "-1");
  card.focus({ preventScroll: true });
}

/**
 * Whether the open Quick try's card in `thread` is out of the thread's scroll view. Watches the card with an
 * IntersectionObserver against the thread viewport, and the thread for a newer copy of the card (A5's re-show).
 */
function useCardOffScreen(thread: RefObject<HTMLElement | null>, openKey: string | null): boolean {
  const [off, setOff] = useState(false);
  useEffect(() => {
    const block = thread.current;
    if (!openKey || !block || typeof IntersectionObserver === "undefined") return;
    const root = block.closest<HTMLElement>('[data-testid="thread-viewport"]') ?? block.parentElement;
    let card: HTMLElement | null = null;
    let seen: IntersectionObserver | null = null;
    const watch = () => {
      const next = openCard(block);
      if (next === card) return;
      seen?.disconnect();
      seen = null;
      card = next;
      if (!card) return setOff(false);
      seen = new IntersectionObserver((entries) => {
        const last = entries.at(-1);
        if (last) setOff(!last.isIntersecting);
      }, { root });
      seen.observe(card);
    };
    watch();
    const changes = new MutationObserver(watch);
    changes.observe(block, { childList: true, subtree: true });
    return () => {
      changes.disconnect();
      seen?.disconnect();
      setOff(false);
    };
  }, [thread, openKey]);
  return off;
}

/**
 * The "Back to your turn" button above the message box: there only while a Quick try is open and its card is off screen.
 * `thread` is the block inside the thread viewport that holds the conversation.
 */
export function BackToTurn({ thread, openKey }: { thread: RefObject<HTMLElement | null>; openKey: string | null }) {
  const off = useCardOffScreen(thread, openKey);
  if (!openKey || !off) return null;
  return (
    <div className="relative z-[1] mb-2 flex justify-center">
      <SecondaryButton
        size="sm"
        data-testid="back-to-turn"
        className="gap-1.5"
        onClick={() => {
          const card = thread.current && openCard(thread.current);
          if (card) backToTurn(card);
        }}
      >
        <ArrowUp size={14} strokeWidth={1.75} aria-hidden />
        Back to your turn
      </SecondaryButton>
    </div>
  );
}
