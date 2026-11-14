import type { Recipe } from "./define";
import { breakevenHunt } from "./a/breakeven-hunt";
import { buyingPower } from "./a/buying-power";
import { compareTwo } from "./a/compare-two";
import { growMoney } from "./a/grow-money";
import { loanCost } from "./a/loan-cost";
import { percentPoints } from "./a/percent-points";
import { quickCheck } from "./a/quick-check";

/** Recipe set A (lane recipes-a). An entry with a seed's id (grow_money, loan_cost) replaces the seed. */
export const SET_A: Recipe[] = [buyingPower, growMoney, loanCost, compareTwo, breakevenHunt, percentPoints, quickCheck];
