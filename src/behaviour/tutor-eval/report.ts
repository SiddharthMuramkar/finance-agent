/**
 * The live Tutor tests' report (ticket #236). Pure: the results' shape, each case's verdict from its three runs,
 * the full Markdown report with every failure in full, a short summary for the CI job and the PR comment, and
 * the files written to evidence/tutor-eval/.
 */
import type { ReplyProblem } from "@/tutor/reply-checks";
import type { Grade, SeenReply } from "./grading";

export const RUNS_PER_CASE = 3;

export type RunResult = {
  run: number;
  status: "pass" | "fail" | "skipped";
  /** Every failure, in full: reply checks, case conditions and the grader's no answers. */
  reasons: string[];
  reply?: SeenReply;
  problems?: ReplyProblem[];
  grade?: Grade | null;
  costUsd: number;
  /** What else is worth seeing: the turn's tools, its time, what code fixed. */
  note?: string;
};

export type CaseResult = {
  id: string;
  title: string;
  kind: "live" | "aggregate" | "lint";
  status: "pass" | "fail" | "pending" | "skipped";
  /** Why the case could not run yet. */
  pending?: string;
  runs: RunResult[];
};

export type EvalReport = {
  startedAt: string;
  finishedAt: string;
  tutor: { model: string; effort: string; widgetEngine: string };
  graderModel: string;
  fingerprint: string;
  capUsd: number;
  spentUsd: number;
  budgetStop: string | null;
  cases: CaseResult[];
};

/** A case passes only on three passing runs. A failed run fails it; a run not started leaves it skipped. */
export function caseStatus(runs: RunResult[], expected = RUNS_PER_CASE): "pass" | "fail" | "skipped" {
  if (runs.some((r) => r.status === "fail")) return "fail";
  if (runs.length < expected || runs.some((r) => r.status === "skipped")) return "skipped";
  return "pass";
}

/** The suite passes only when every case passed three times out of three and the cap stopped nothing. */
export function allPassed(r: EvalReport): boolean {
  return r.budgetStop === null && r.cases.every((c) => c.status === "pass");
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const passedRuns = (c: CaseResult) => c.runs.filter((r) => r.status === "pass").length;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const quote = (text: string) =>
  text
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");

function header(r: EvalReport): string[] {
  return [
    `Tutor: ${r.tutor.model}, effort ${r.tutor.effort}, widget engine ${r.tutor.widgetEngine}. Grader: ${r.graderModel}. Instruction fingerprint ${r.fingerprint}.`,
    `Spent ${usd(r.spentUsd)} of the ${usd(r.capUsd)} cap. Started ${r.startedAt}, finished ${r.finishedAt}.`,
    ...(r.budgetStop ? ["", `**${r.budgetStop}** Runs after that point were not started and count as not passed.`] : []),
  ];
}

function table(r: EvalReport): string[] {
  return [
    "| Case | Title | Verdict | Runs passed |",
    "| --- | --- | --- | --- |",
    ...r.cases.map((c) => `| ${c.id} | ${cell(c.title)} | ${c.status} | ${passedRuns(c)} of ${RUNS_PER_CASE} |`),
  ];
}

function runDetail(c: CaseResult, run: RunResult): string[] {
  const out = [`### ${c.id}, run ${run.run}`, "", ...run.reasons.map((x) => `- ${x}`)];
  if (run.reply) {
    out.push("", "The reply, as the Learner sees it:", "", quote(run.reply.text || "(empty)"));
    if (run.reply.fixed.length) out.push("", `Code fixed before showing: ${run.reply.fixed.join(", ")}.`);
    out.push("", run.reply.widgets.length ? `Widgets: ${run.reply.widgets.map((w) => `${w.id}${w.params ? ` ${JSON.stringify(w.params)}` : ""}`).join("; ")}.` : "Widgets: none.");
    if (run.reply.savedRule) out.push(`Saved rule: "${run.reply.savedRule}".`);
  }
  if (run.grade && run.grade.ok) out.push("", `Grader: ${run.grade.answers.map((a) => `${a.n} ${a.yes ? "yes" : "no"}${a.why ? ` (${a.why})` : ""}`).join("; ")}.`);
  if (run.grade && !run.grade.ok) out.push("", "The grader wrote:", "", quote(run.grade.text || "(nothing)"));
  if (run.note) out.push("", run.note);
  out.push("");
  return out;
}

/** The full report: the run's settings and spend, a table of cases, then every failed or skipped run in full. */
export function renderReport(r: EvalReport): string {
  const pending = r.cases.filter((c) => c.status === "pending");
  const failed = r.cases.flatMap((c) => c.runs.filter((run) => run.status !== "pass").map((run) => [c, run] as const));
  return [
    `# Live Tutor tests, ${r.startedAt.slice(0, 10)}`,
    "",
    ...header(r),
    "",
    ...table(r),
    "",
    ...(pending.length ? ["## Pending", "", ...pending.map((c) => `- ${c.id}: ${c.pending}`), ""] : []),
    "## Failures",
    "",
    ...(failed.length ? failed.flatMap(([c, run]) => runDetail(c, run)) : ["None.", ""]),
  ].join("\n");
}

/** The short summary for the job summary and the PR comment: the verdicts, with the full report left to the artifact. */
export function renderSummary(r: EvalReport): string {
  const passed = r.cases.filter((c) => c.status === "pass").length;
  return [
    `## Live Tutor tests: ${passed} of ${r.cases.length} cases passed three times out of three`,
    "",
    ...header(r),
    "",
    ...table(r),
    "",
    "Every failure is written out in full in the report (the tutor-eval artifact of this run). This job is not a required check.",
    "",
  ].join("\n");
}

/** The files to write to the report folder, by name: this run's report and JSON, the latest copies and the summary. */
export function reportFiles(r: EvalReport): Record<string, string> {
  const stamp = r.startedAt.replace(/[:.]/g, "-");
  const md = renderReport(r);
  const json = JSON.stringify(r, null, 2);
  return { [`tutor-eval-${stamp}.md`]: md, [`tutor-eval-${stamp}.json`]: json, "latest.md": md, "latest.json": json, "summary.md": renderSummary(r) };
}
