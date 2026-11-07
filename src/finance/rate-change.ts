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
 * The rate_move Widget's three lines (#530): one move said the way a reporter, a trader and a headline say it, as
 * story and lingo quotes, never as a worked sum (ADR 0009: numbers appear only as facts in a story). 5% to 5.2% reads
 * "The rate climbs from 5% to 5.2%: up 0.2 points", "Traders call that 20 bp", "Up 4% on the old rate". A fall says
 * "drops", "down" and "a fall of"; a move from 0% says there is no percent change; no move says so. The arithmetic
 * runs here, in whole basis points, and no line says "minus", "times" or "divided". The RateMove Widget calls this
 * function directly, so the Widget and the Tutor's words cannot differ.
 */
export function rateMoveLines(oldPercent: number, newPercent: number): [string, string, string] {
  const bp = Math.round((newPercent - oldPercent) * 100);
  const size = Math.abs(bp);
  const points = size / 100;
  const pointWord = size === 100 ? "point" : "points";
  const oldBp = Math.round(oldPercent * 100);
  const percent = oldBp === 0 ? 0 : Math.round(((size * 100) / oldBp) * 100) / 100;
  const [from, to] = [rateText(oldPercent), rateText(newPercent)];
  const reporter =
    bp === 0
      ? `The rate stays at ${to}%: 0 points`
      : `The rate ${bp > 0 ? "climbs" : "drops"} from ${from}% to ${to}%: ${bp > 0 ? "up" : "down"} ${points} ${pointWord}`;
  const trader = `Traders call that ${bp < 0 ? "a fall of " : ""}${size} bp`;
  const headline =
    oldBp === 0
      ? "From 0% no percent change can be given: the old rate is zero, so there is nothing to take a share of"
      : percent === 0
        ? "No change on the old rate"
        : `${bp > 0 ? "Up" : "Down"} ${percent}% on the old rate`;
  return [reporter, trader, headline];
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
