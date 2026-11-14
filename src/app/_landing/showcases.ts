import { copy } from "./copy";

/**
 * A Widget a Topic already writes ahead: a Concept card, a scene before the reveal, or (E6) a Concept card's formula drawn
 * as a picture of growth instead: the grow_money recipe at the card's own numbers, so Home shows no symbols.
 */
export type ShowcaseWidget = { kind: "card"; check: string } | { kind: "scene"; scene: string } | { kind: "growth"; check: string };

export type Showcase = {
  id: string;
  area: "everyday" | "economy" | "company";
  topic: string;
  widget: ShowcaseWidget;
  words: { label: string; question: string; reply: string };
};

export const SHOWCASES: readonly Showcase[] = [
  {
    id: "compounding",
    area: "everyday",
    topic: "num-compounding",
    // E6, H5: a picture of growth, not a Formula Card, on a page whose opening says "You never work out a sum".
    widget: { kind: "growth", check: "cp-quiz-compounding" },
    words: { label: copy.showcases.areas.everyday, question: copy.showcases.everyday.question, reply: copy.showcases.everyday.reply },
  },
  {
    id: "rate-wording",
    area: "economy",
    topic: "num-percent-bps",
    widget: { kind: "card", check: "pb-quiz-wording" },
    words: { label: copy.showcases.areas.economy, question: copy.showcases.news.question, reply: copy.showcases.news.reply },
  },
  {
    id: "wework",
    area: "company",
    topic: "fs-revenue-runrate",
    widget: { kind: "scene", scene: "runrate-story" },
    words: { label: copy.showcases.areas.company, question: copy.showcases.company.question, reply: copy.showcases.company.reply },
  },
];
