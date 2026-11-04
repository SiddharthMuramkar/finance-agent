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

/** The readouts as Percent's Widget words them: "In percentage points: 0.4 points", and so on. */
export function rateChangeReadouts(oldPercent: number, newPercent: number): string[] {
  const change = rateChange(oldPercent, newPercent);
  return [
    `In percentage points: ${change.points} points`,
    `In basis points: ${change.basisPoints} bp`,
    `As a percent change of the old rate: ${change.percentChange === null ? "none, because the old rate is 0%" : `${change.percentChange}%`}`,
  ];
}
