// The pieces of Spine Topic 1 that Home's section 3 shows (spec 2026-11-12 E5): "Each step shows a real piece of Spine
// Topic 1 on a white card, written ahead: the story scene; a Lingo card that turns over; one judgement Quick try that
// marks the tap at once and shows its fix; the reveal." Written ahead, word for word, from the Topic file
// (course/topics/spine-01-worth.yaml: its Case's story and reveal, the term "price", and the Quick try
// worth-try-pv-story), so Home reads no database, makes no model call and sends no request. Pure data, safe in the
// browser; how-topics-work-steps.test.ts checks every piece against the Topic file whenever that file is in the course.

/** The Topic and Case they come from (course/outline.yaml: Spine Topic 1). */
export const HOME_STEPS_TOPIC = "spine-01-worth";
export const HOME_STEPS_CASE = "spine-01-amazon-2000";

/** Hear the story: the Case's story, as the Topic tells it before anything is known. */
export const HOME_STORY =
  "February 2000. Amazon sells books and music online. In the twelve months to September 1999 it sold $1,117 million and lost $410 million on its operations. Its shares cost $84. A professor in New York, Aswath Damodaran, writes down what he thinks its future looks like: how big it gets, what it keeps of each sale, what its growth costs and how risky it is. What is Amazon worth, and is $84 a fair price for it?";

/** The story in the beats a Story scene shows, one sentence each (all on screen at once: nothing plays by itself). */
export function storyBeats(story: string = HOME_STORY): string[] {
  return story.split(/(?<=[.?!])\s+(?=[A-Z])/).filter(Boolean);
}

/** Learn the lingo: the Topic's first term, the one the Quick try turns on. */
export const HOME_TERM = {
  term: "price",
  means: "What buyers pay for one share today.",
  pro: "The shares closed at $84.",
  example: "A used bike sells for $200 on the day, whatever it is worth to you.",
  inStory: "In the story, $84 is what buyers pay for an Amazon share.",
} as const;

/** Try it: one judgement Quick try (D1's price or value), with the fix its wrong choice shows at once. */
export type HomeTryChoice = { id: string; text: string; fix?: string };
export const HOME_QUICK_TRY: { id: string; skill: string; ask: string; answer: string; choices: readonly HomeTryChoice[] } = {
  id: "worth-try-pv-story",
  skill: "price-value",
  ask: "His story says $35 a share. Is that a price or a value?",
  answer: "value",
  choices: [
    { id: "value", text: "A value" },
    { id: "price", text: "A price", fix: "Nobody paid $35: it is worked out from a story about the business, so it is a value." },
  ],
};

/** Value it: the Case's reveal, what really happened. */
export const HOME_REVEAL =
  "His story came to $35.08 a share against the $84 price. The $84 was already below the year's high: a month earlier, in early January 2000, the shares had traded as high as $91.50. The price fell through 2000: by the fourth quarter the shares had been as low as $14.88. Neither number proves the other wrong: a price is what buyers paid that day, and a value is what one story about the business is worth.";

/** The reveal's two figures, drawn as two bars: his value a share and the price that day (both in HOME_REVEAL). */
export const HOME_REVEAL_FIGURES = { value: 35.08, price: 84 } as const;
