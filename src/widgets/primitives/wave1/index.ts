// Wave 1 of the new Widget parts (REPORT.md §7.3). library.tsx registers WAVE1_PARTS in the Widget library. The order of each part's props is its positional argument order, fixed forever.

import { Breakeven } from "./breakeven";
import { MoneyStack } from "./money-stack";
import { Pictogram } from "./pictogram";
import { Predict } from "./predict";
import { QuickCheck } from "./quick-check";
import { Stat } from "./stat";
import { Verdict } from "./verdict";
import { Versus } from "./versus";
import { Waffle } from "./waffle";

export const WAVE1_PARTS = [Stat, Verdict, QuickCheck, Predict, Versus, Breakeven, MoneyStack, Waffle, Pictogram];

export { Breakeven, findBreakeven, proximity } from "./breakeven";
export { MoneyStack, noteValueFor } from "./money-stack";
export { Pictogram, groupFor } from "./pictogram";
export { Predict, gapSentence } from "./predict";
export { QuickCheck, quickCheckProblem } from "./quick-check";
export { Stat } from "./stat";
export { Verdict } from "./verdict";
export { Versus, winnerOf } from "./versus";
export { Waffle, waffleCaption } from "./waffle";
export { IconGrid } from "./icon-grid";
export { ICON_NAMES, isKnownObject } from "./icons";
export { formatAmount } from "./format";
