// Wave 2 of the new Widget parts (REPORT.md §7.3). library-v2 registers WAVE2_PARTS in the Widget library; until
// then they are only exported. The order of each part's props is its positional argument order, fixed forever.
// Step is the child part of StepThrough, like GuidedTask under GuidedTasks: it is exported on its own and is not
// one of WAVE2_PARTS (library-v2 adds it as a child component of StepThrough).

import { DrawTheLine } from "./draw-the-line";
import { PriceTag } from "./price-tag";
import { Rank } from "./rank";
import { ShrinkingNote } from "./shrinking-note";
import { StepThrough } from "./step-through";
import { TimeTravel } from "./time-travel";
import { Waterfall } from "./waterfall";

export const WAVE2_PARTS = [DrawTheLine, PriceTag, ShrinkingNote, TimeTravel, StepThrough, Rank, Waterfall];

export { actualSlices, DrawTheLine, gapLine, horizonMs, splitHistory, valueAt } from "./draw-the-line";
export { futurePrice, PriceTag } from "./price-tag";
export { moved, Rank, rankProblem, rightPlaces, startOrder } from "./rank";
export { buyingPower, ShrinkingNote } from "./shrinking-note";
export { answerMatches, looksLikeFormula, parseTyped, Step, StepThrough } from "./step-through";
export { coinSize, paymentRows, TimeTravel } from "./time-travel";
export { Waterfall, waterfallBars } from "./waterfall";
