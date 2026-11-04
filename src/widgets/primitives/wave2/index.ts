// Wave 2 of the new Widget parts (REPORT.md §7.3). library.tsx registers WAVE2_PARTS in the Widget library. The order of each part's props is its positional argument order, fixed forever.
// Step is the child part of StepThrough, like GuidedTask under GuidedTasks: it is exported on its own and is not
// one of WAVE2_PARTS (library-v2 adds it as a child component of StepThrough).

import { DrawTheLine } from "./draw-the-line";
import { PriceTag } from "./price-tag";
import { Rank } from "./rank";
import { RateMove } from "./rate-move";
import { ShrinkingNote } from "./shrinking-note";
import { StepThrough } from "./step-through";
import { TimeTravel } from "./time-travel";
import { Waterfall } from "./waterfall";

export const WAVE2_PARTS = [DrawTheLine, PriceTag, ShrinkingNote, TimeTravel, StepThrough, Rank, Waterfall, RateMove];

export { actualSlices, DrawTheLine, gapLine, horizonMs, splitHistory, valueAt } from "./draw-the-line";
export { futurePrice, PriceTag } from "./price-tag";
export { moved, Rank, rankProblem, rightPlaces, startOrder } from "./rank";
export { RateMove } from "./rate-move";
export { markMove, RATE_MOVE_LABELS } from "./rate-move-marking";
export { buyingPower, ShrinkingNote } from "./shrinking-note";
export { answerMatches, looksLikeFormula, parseTyped, Step, StepThrough } from "./step-through";
export { coinSize, paymentRows, TimeTravel } from "./time-travel";
export { Waterfall, waterfallBars } from "./waterfall";
