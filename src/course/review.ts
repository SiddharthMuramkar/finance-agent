import { createEmptyCard, fsrs, Rating, type Card } from "ts-fsrs";

/**
 * Spaced review scheduling for quiz questions, by `ts-fsrs` (FSRS). Pure: no database, no model.
 * Correct maps to Good and incorrect to Again. Short-term steps are off, so intervals are whole
 * days (the Learner reviews at Session start, not minute by minute).
 */
export type ReviewCardState = Card;

const scheduler = fsrs({ enable_short_term: false, enable_fuzz: false });

/** A card for a question that has not been rated yet; due at `now`. */
export function newCard(now: Date): ReviewCardState {
  return createEmptyCard(now);
}

/** The card after the Learner answered at `now`. */
export function rate(card: ReviewCardState, correct: boolean, now: Date): ReviewCardState {
  return scheduler.next(card, now, correct ? Rating.Good : Rating.Again).card;
}
