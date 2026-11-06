import { choicesFor, type ChoiceSet } from "@/teaching/choices";
import type { FixedItem } from "@/teaching/mark";
import type { EmojiName } from "@/emoji/registry";

// What the RateMove part says and marks, kept out of the "use client" part so the rate_move recipe (run on the
// server) can read the same labels. Practice is a tap (ADR 0009): code builds the readings and marks the tapped
// id, so no typed number is ever read.

/** The labels of the three worked lines, in order. */
export const RATE_MOVE_LABELS = ["Points: new minus old", "Basis points: points times 100", "Percent of the old rate"] as const;

/**
 * Who says each worked line (#480), in the same order: a reporter says the move in points, a trader in basis points,
 * a headline as a percent of the old rate. Each is a vendored Fluent Emoji 3D name, so the Widget has characters and
 * is never chart-only. The pictures add no words: the labels and the lines stay as they were (ADR 0002).
 */
export const RATE_MOVE_SPEAKERS = [
  { who: "reporter", emoji: "woman" },
  { who: "trader", emoji: "man-office-worker" },
  { who: "headline", emoji: "newspaper" },
] as const satisfies readonly { who: string; emoji: EmojiName }[];

/** The highest rate the part draws and its play sliders reach, in percent. */
export const RATE_MOVE_MAX = 20;

export type ReadingMark = {
  /** right when the tapped reading is the move; wrong otherwise. */
  status: "right" | "wrong";
  /** The one-line fix of a Known mistake the tapped reading names; null for the right reading or an unnamed wrong one. */
  fix: string | null;
};

const SLIP_FIX = "One point is 100 basis points, so multiply by 100, not 10.";
const NO_MOVE_FIX = "The two rates are the same, so nothing moved: new minus old is 0 points, which is 0 basis points.";
const POINTS_AS_BPS_FIX = "That reads points as basis points. One point is 100 basis points, so points times 100 gives basis points.";
const PERCENT_FIX = "That is a percent. The move in points is the new rate minus the old rate; basis points are points times 100.";

/**
 * The readings of "which reading is right?" for a rate move, built with the choice engine (ADR 0009): the right
 * reading in points and basis points, the x10 slip (points times 10, said in bps) and the percent mix-up (the points
 * said as a percent). 4% to 5% gives "Up 1 point, or 100 bps", "Up 10 bps", "Up 1%". Same seed, same order.
 */
export function moveReadings(oldRate: number, newRate: number, seed: string): ChoiceSet {
  const bp = Math.round((newRate - oldRate) * 100);
  const size = Math.abs(bp);
  const way = bp < 0 ? "Down" : "Up";
  const points = size / 100;
  const base = { id: "rate-move-practice", skill: "rate-move", ask: "Which reading is right?", kind: "choice" as const };
  const item: FixedItem =
    bp === 0
      ? {
          ...base,
          answer: "none",
          choices: [
            { id: "none", text: "No change, 0 bps" },
            { id: "up-point", text: "Up 1 point, or 100 bps", mistake: { tag: "saw_a_move_that_is_not_there", fix: NO_MOVE_FIX } },
            { id: "up-percent", text: "Up 1%", mistake: { tag: "mixed_percent_points", fix: PERCENT_FIX } },
          ],
        }
      : {
          ...base,
          answer: "right",
          choices: [
            { id: "right", text: `${way} ${points} ${points === 1 ? "point" : "points"}, or ${size} bps` },
            // A whole number of tenths gives the x10 slip; a move like 5 bps would read "0.5 bps", so it gets the points-as-bps slip.
            size % 10 === 0
              ? { id: "x10", text: `${way} ${size / 10} bps`, mistake: { tag: "used_x10", fix: SLIP_FIX } }
              : { id: "x10", text: `${way} ${points} bps`, mistake: { tag: "forgot_to_convert", fix: POINTS_AS_BPS_FIX } },
            { id: "percent", text: `${way} ${points}%`, mistake: { tag: "mixed_percent_points", fix: PERCENT_FIX } },
          ],
        };
  return choicesFor(item, seed)!;
}

/** Marks the tapped reading by its id (never by its place), with the fix of the Known mistake it names. */
export function markReading(set: ChoiceSet, tapped: string): ReadingMark {
  if (tapped === set.answer) return { status: "right", fix: null };
  return { status: "wrong", fix: set.choices.find((c) => c.id === tapped)?.mistake?.fix ?? null };
}
