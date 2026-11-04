import type { Recipe } from "./define";
import { chain } from "./b/chain";
import { fxConvert } from "./b/fx-convert";
import { predictNumber } from "./b/predict-number";
import { priceOverTime } from "./b/price-over-time";
import { rank } from "./b/rank";

/**
 * Recipe set B (lane recipes-b): price_over_time, predict_number, chain, rank and fx_convert. The other two of the
 * lane, history_case and formula, are upgraded seeds (seeds/index.ts), which a set entry with the same id would replace.
 */
export const SET_B: Recipe[] = [priceOverTime, predictNumber, chain, rank, fxConvert];
