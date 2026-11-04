/**
 * The live Tutor tests' spend cap (ticket #236). Every run's estimated cost (the Tutor Turn, its retry and the
 * grader) is held before the run starts, so runs side by side can never take spend past the cap; each run then
 * settles its real cost. Once a run would not fit, the suite stops starting runs and the report says so.
 */
import { PRICES } from "@/tutor/pricing";

export const DEFAULT_BUDGET_USD = 5;
/** Held for the first run, before any run has a real cost: about one Opus Tutor Turn and one grade. */
export const FIRST_RUN_ESTIMATE_USD = 0.4;

/** The cap from TUTOR_EVAL_BUDGET_USD, or $5. */
export function budgetCap(env: Record<string, string | undefined>): number {
  const raw = env.TUTOR_EVAL_BUDGET_USD;
  if (raw === undefined || raw.trim() === "") return DEFAULT_BUDGET_USD;
  const cap = Number(raw);
  if (!Number.isFinite(cap) || cap <= 0) throw new Error(`TUTOR_EVAL_BUDGET_USD must be a positive number of dollars, not "${raw}".`);
  return cap;
}

/** Throws for a model the price table does not know, whose spend would otherwise count as $0. */
export function requirePrice(model: string): void {
  if (!PRICES[model]) throw new Error(`The model "${model}" has no price in src/tutor/pricing.ts, so its spend cannot be capped.`);
}

const usd = (n: number) => `$${n.toFixed(2)}`;

export class Budget {
  spent = 0;
  private held = 0;
  private costs: number[] = [];
  /** Why the suite stopped starting runs; null while it has not. */
  stopped: string | null = null;

  constructor(readonly cap: number) {}

  /** What the next run is expected to cost: the mean of the runs so far, or the first-run estimate. */
  estimate(): number {
    return this.costs.length ? this.costs.reduce((a, b) => a + b, 0) / this.costs.length : FIRST_RUN_ESTIMATE_USD;
  }

  /** Holds `amount` for a run about to start. False, and stopped for good, when spend and holds would pass the cap. */
  hold(amount: number): boolean {
    if (this.stopped) return false;
    if (this.spent >= this.cap) {
      this.stopped = `Stopped: spent ${usd(this.spent)}, which reached the ${usd(this.cap)} cap.`;
      return false;
    }
    if (this.spent + this.held + amount > this.cap) {
      this.stopped = `Stopped: spent ${usd(this.spent)}, and the next run (about ${usd(amount)}) would pass the ${usd(this.cap)} cap.`;
      return false;
    }
    this.held += amount;
    return true;
  }

  /** Swaps a run's hold for what it really cost. */
  settle(held: number, actual: number): void {
    this.held = Math.max(0, this.held - held);
    this.spent += actual;
    // A run that failed before spending anything says nothing about what the next run costs: it must not pull the estimate to $0.
    if (actual > 0) this.costs.push(actual);
  }
}
