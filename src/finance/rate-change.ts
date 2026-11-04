/**
 * One rate change said three ways (Percent): in percentage points, in basis points, and as a percent change of the
 * old rate. Rates are percentages (6.4 means 6.4%). Percent's written-ahead Widget shows these, and code works the same
 * readouts out for the Tutor from here, so the Tutor never does the sum itself.
 */
export type RateChange = {
  /** New minus old, in percentage points, to two decimals. */
  points: number;
  /** The same change in basis points (hundredths of a point), whole. */
  basisPoints: number;
  /** The change as a percent of the old rate, to two decimals; null when the old rate is 0%, which has no percent change. */
  percentChange: number | null;
};

/** Rounds without float noise: 6.4 - 6 (0.40000000000000036) is 0.4, and a move of nothing is 0, never -0. */
const round = (value: number, decimals: number) => Math.round(Number(`${value.toFixed(10)}e${decimals}`)) / 10 ** decimals || 0;

export function rateChange(oldPercent: number, newPercent: number): RateChange {
  const move = newPercent - oldPercent;
  return {
    points: round(move, 2),
    basisPoints: round(move * 100, 0),
    percentChange: oldPercent === 0 ? null : round((move / oldPercent) * 100, 2),
  };
}

/** A rate as a worked line says it: to two decimals, no trailing zeros ("5.2", "5"). */
const rateText = (percent: number) => String(Math.round(percent * 100) / 100);

/**
 * The rate_move Widget's three worked lines, in words (ADR 0002: sums are said, never typed as formulas):
 * "5.2% minus 5% is 0.2 points", "0.2 points times 100 is 20 bp", "0.2 divided by the old 5%, times 100, is 4%".
 * A fall says "a fall of", and a move from 0% says the percent change has no value. The arithmetic runs in whole
 * basis points, step for step as the Widget's own expressions do (src/widgets/recipes/set-tutor.ts), and its tests
 * hold the two to the same words.
 */
export function rateMoveLines(oldPercent: number, newPercent: number): [string, string, string] {
  const bp = Math.round((newPercent - oldPercent) * 100);
  const size = Math.abs(bp);
  const points = size / 100;
  const pointWord = size === 100 ? "point" : "points";
  const fall = bp < 0 ? "a fall of " : "";
  const oldBp = Math.round(oldPercent * 100);
  return [
    `${rateText(newPercent)}% minus ${rateText(oldPercent)}% is ${fall}${points} ${pointWord}`,
    `${points} ${pointWord} times 100 is ${fall}${size} bp`,
    oldBp === 0
      ? "The old rate is 0%, so the percent change has no value"
      : `${points} divided by the old ${rateText(oldPercent)}%, times 100, is ${fall}${Math.round(((size * 100) / oldBp) * 100) / 100}%`,
  ];
}

/** The readouts as Percent's Widget words them: "In percentage points: 0.4 points", and so on. */
export function rateChangeReadouts(oldPercent: number, newPercent: number): string[] {
  const change = rateChange(oldPercent, newPercent);
  return [
    `In percentage points: ${change.points} points`,
    `In basis points: ${change.basisPoints} bp`,
    `As a percent change of the old rate: ${change.percentChange === null ? "none, because the old rate is 0%" : `${change.percentChange}%`}`,
  ];
}
