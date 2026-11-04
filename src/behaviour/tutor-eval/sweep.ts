/**
 * The model sweep (spec #229, ticket #248): the live Tutor tests (T1 to T11) run once for each model:effort pair,
 * each pair on its own spend cap, and one combined report that gives every pair's pass rate and cost per turn and
 * names the cheapest pair that passed everything. It reuses the suite's runner (`runSuite`) unchanged; the model
 * clients and the database come in as dependencies, so the whole path runs offline with a scripted model.
 * `sweep.live.ts` wires the real ones (`npm run tutor:sweep`).
 */
import { PRICES } from "@/tutor/pricing";
import { Budget } from "./budget";
import type { EvalCase } from "./case";
import { renderReport, RUNS_PER_CASE, type EvalReport } from "./report";
import { runSuite, type SuiteDeps } from "./run-suite";

/** What the ticket asks for: Opus 5.5 low and medium, and Sonnet 5.5 medium. */
export const DEFAULT_PAIRS = "claude-opus-5-5:low,claude-opus-5-5:medium,claude-sonnet-5-5:medium";

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

export type Pair = { model: string; effort: string };

export type PairResult = { pair: Pair; report?: EvalReport; error?: string };

export type SweepReport = { startedAt: string; finishedAt: string; capUsd: number; pairs: PairResult[] };

/** The pairs from TUTOR_EVAL_MODELS ("model:effort,model:effort"), or the ticket's three. Repeats are dropped. */
export function parsePairs(raw: string | undefined): Pair[] {
  const text = raw && raw.trim() ? raw : DEFAULT_PAIRS;
  const seen = new Set<string>();
  const pairs: Pair[] = [];
  for (const part of text.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [model, effort, ...rest] = part.split(":").map((s) => s.trim());
    if (!model || !effort || rest.length) throw new Error(`"${part}" is not a model:effort pair, such as claude-opus-5-5:medium.`);
    if (!EFFORTS.includes(effort)) throw new Error(`"${part}": the effort must be one of ${EFFORTS.join(", ")}.`);
    if (!PRICES[model]) throw new Error(`The model "${model}" has no price in src/tutor/pricing.ts, so its spend cannot be capped.`);
    if (seen.has(`${model}:${effort}`)) continue;
    seen.add(`${model}:${effort}`);
    pairs.push({ model, effort });
  }
  return pairs;
}

export type PairStats = Pair & {
  /** No case is pending, every case passed three of three, the cap stopped nothing and the pair ran without an error. */
  passed: boolean;
  runsPassed: number;
  /** Runs expected from the cases that could run (pending cases are left out). */
  runsTotal: number;
  casesPassed: number;
  casesTotal: number;
  pending: string[];
  spentUsd: number;
  /** Tutor turns started (live runs not skipped). */
  turns: number;
  /** Tutor and grader spend together, per turn. */
  costPerTurn: number;
  budgetStop: string | null;
  error?: string;
};

export function summarisePair(r: PairResult): PairStats {
  const base = { model: r.pair.model, effort: r.pair.effort };
  if (!r.report) return { ...base, passed: false, runsPassed: 0, runsTotal: 0, casesPassed: 0, casesTotal: 0, pending: [], spentUsd: 0, turns: 0, costPerTurn: 0, budgetStop: null, error: r.error ?? "The pair did not run." };
  const cases = r.report.cases;
  const ran = cases.filter((c) => c.status !== "pending");
  const turns = cases.filter((c) => c.kind === "live").flatMap((c) => c.runs).filter((run) => run.status !== "skipped").length;
  return {
    ...base,
    passed: r.report.budgetStop === null && cases.every((c) => c.status === "pass"),
    runsPassed: ran.flatMap((c) => c.runs).filter((run) => run.status === "pass").length,
    runsTotal: ran.length * RUNS_PER_CASE,
    casesPassed: ran.filter((c) => c.status === "pass").length,
    casesTotal: ran.length,
    pending: cases.filter((c) => c.status === "pending").map((c) => c.id),
    spentUsd: r.report.spentUsd,
    turns,
    costPerTurn: turns ? r.report.spentUsd / turns : 0,
    budgetStop: r.report.budgetStop,
  };
}

/** The rule: the cheapest pair, by cost per turn, that passed everything. Null when none did. */
export function chooseSetting(stats: PairStats[]): PairStats | null {
  const winners = stats.filter((s) => s.passed);
  return winners.length ? winners.reduce((a, b) => (b.costPerTurn < a.costPerTurn ? b : a)) : null;
}

export type SweepOptions = {
  /** The spend cap for each pair (TUTOR_EVAL_BUDGET_USD, $5 by default). */
  capUsd: number;
  /** The suite's dependencies for one pair, with that pair's own budget. */
  suiteDeps: (pair: Pair, budget: Budget) => SuiteDeps;
  log?: (line: string) => void;
};

/** Runs the suite for each pair, one after another, each on its own budget. A pair that throws is recorded and the sweep goes on. */
export async function runSweep(cases: EvalCase[], pairs: Pair[], opts: SweepOptions): Promise<SweepReport> {
  const startedAt = new Date().toISOString();
  const out: PairResult[] = [];
  for (const pair of pairs) {
    opts.log?.(`Sweep: ${pair.model} effort ${pair.effort}`);
    try {
      const deps = opts.suiteDeps(pair, new Budget(opts.capUsd));
      out.push({ pair, report: await runSuite(cases, { ...deps, log: opts.log ?? deps.log }) });
    } catch (err) {
      out.push({ pair, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { startedAt, finishedAt: new Date().toISOString(), capUsd: opts.capUsd, pairs: out };
}

/** True when every pair passed everything: the exit status of the live test. */
export function sweepFoundSetting(r: SweepReport): boolean {
  return chooseSetting(r.pairs.map(summarisePair)) !== null;
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const usd4 = (n: number) => `$${n.toFixed(4)}`;

/** The combined report: one table, the chosen setting by the rule, then each pair that did not pass, in full. */
export function renderSweep(r: SweepReport): string {
  const stats = r.pairs.map(summarisePair);
  const chosen = chooseSetting(stats);
  const lines = [
    `# Model sweep, ${r.startedAt.slice(0, 10)}`,
    "",
    `Each pair runs the live Tutor tests (three runs per case) on its own cap of ${usd(r.capUsd)}. Started ${r.startedAt}, finished ${r.finishedAt}.`,
    "",
    "| Model | Effort | Verdict | Runs passed | Cases passed | Spent | Turns | Cost per turn |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...stats.map(
      (s) =>
        `| ${s.model} | ${s.effort} | ${s.passed ? "pass" : "fail"} | ${s.runsPassed} of ${s.runsTotal} | ${s.casesPassed} of ${s.casesTotal} | ${usd(s.spentUsd)} | ${s.turns} | ${usd4(s.costPerTurn)} |`,
    ),
    "",
    "The rule: the cheapest pair, by cost per turn (Tutor and grader together), that passes every case three times out of three. A pair the cap stopped, or that threw, does not pass.",
    "",
    stats.some((s) => s.pending.length)
      ? `**Cases are still pending (${[...new Set(stats.flatMap((s) => s.pending))].join(", ")}), so no setting is chosen.** The choice needs T1 to T11 all run, three times out of three.`
      : chosen
      ? `**Chosen setting: ${chosen.model}, effort ${chosen.effort}** (${usd4(chosen.costPerTurn)} per turn).`
      : "**No setting passed everything.** Do not change the stored default; read the failures below.",
    "",
  ];
  for (const s of stats) {
    if (s.error) lines.push(`- ${s.model} ${s.effort}: did not run: ${s.error}`);
    if (s.budgetStop) lines.push(`- ${s.model} ${s.effort}: ${s.budgetStop}`);
    if (s.pending.length) lines.push(`- ${s.model} ${s.effort}: pending, so this pair cannot pass: ${s.pending.join(", ")}.`);
  }
  for (const p of r.pairs) {
    if (!p.report || summarisePair(p).passed) continue;
    lines.push("", `## ${p.pair.model}, effort ${p.pair.effort}: full report`, "", renderReport(p.report).replace(/^# /gm, "#### "));
  }
  return `${lines.join("\n")}\n`;
}

/** The files to write to the report folder, by name: this sweep's report and JSON, and the latest copies. */
export function sweepFiles(r: SweepReport): Record<string, string> {
  const stamp = r.startedAt.replace(/[:.]/g, "-");
  const md = renderSweep(r);
  const json = JSON.stringify({ ...r, chosen: chooseSetting(r.pairs.map(summarisePair)), stats: r.pairs.map(summarisePair) }, null, 2);
  return { [`sweep-${stamp}.md`]: md, [`sweep-${stamp}.json`]: json, "sweep-latest.md": md, "sweep-latest.json": json };
}
