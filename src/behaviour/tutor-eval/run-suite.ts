/**
 * Runs the live Tutor tests (ticket #236): each live case three times, each run on its own throwaway database
 * through the real Tutor Turn, then the reply checks, the case's conditions and the grader; then the aggregate
 * cases over those replies and the lint case. The model clients and the database are passed in, so the whole
 * path runs offline with a scripted model and a stand-in grader; run.live.ts wires the real ones.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadCourseMap, type CourseMap } from "@/course/map";
import type { Db } from "@/db/types";
import { checkReply } from "@/tutor/reply-checks";
import { runTutorTurn, type TutorClient } from "@/tutor/turn";
import type { Budget } from "./budget";
import type { AggregateCase, EvalCase, LintCase, LiveCase } from "./case";
import { buildGraderPrompt, codedFailures, GRADER_SYSTEM, judgeRun, parseGrade, RUBRIC, type SeenReply } from "./grading";
import { caseStatus, RUNS_PER_CASE, type CaseResult, type EvalReport, type RunResult } from "./report";
import { answerDrawnTry, noteMark, pendingReason, prepareCase, seenReply, type TutorSettings } from "./setup";
import { liveSession } from "@/tutor/session-log";

export type SuiteDeps = {
  map?: CourseMap;
  settings: TutorSettings;
  graderModel: string;
  fingerprint: string;
  budget: Budget;
  /** A fresh in-memory Postgres with the real migrations. */
  newDb: () => Promise<Db>;
  /** The Tutor's model client for one run. */
  tutorClient: (c: LiveCase, run: number) => TutorClient;
  /** Asks the grader; returns what it wrote and what the call cost. */
  grade: (system: string, prompt: string) => Promise<{ text: string; costUsd: number }>;
  /** Runs the course check in a folder (the repo, or a fixture); passed is its exit status. */
  courseCheck: (cwd: string) => Promise<{ passed: boolean; output: string }>;
  /** Runs side by side; each holds its estimate first, so the cap still holds. */
  concurrency?: number;
  /** The repo folder that fixture paths are relative to. */
  root?: string;
  log?: (line: string) => void;
};

/** A live run, with the app words its reply was checked against (kept for the aggregates, left out of the report). */
type LiveRun = RunResult & { reply?: SeenReply; words?: string[] };

async function runLive(c: LiveCase, run: number, deps: SuiteDeps, map: CourseMap): Promise<LiveRun> {
  const held = deps.budget.estimate();
  if (!deps.budget.hold(held)) return { run, status: "skipped", reasons: [`Not run: ${deps.budget.stopped}`], costUsd: 0 };
  let cost = 0;
  try {
    const db = await deps.newDb();
    const p = await prepareCase(db, c, { map, settings: deps.settings });
    const notesAfter = await noteMark(db, p.learnerId);
    let text = "";
    let done: { sessionId: number; turnSeq: number } | null = null;
    const troubles: string[] = [];
    let note = "";
    // A case with an answer goes the way the app does: code marks it on a drawn Quick try, then the follow-up turn it asks for runs.
    const followUp = c.answer ? await answerDrawnTry(db, map, c, p) : true;
    if (!followUp) {
      // Code answered with no Tutor turn (the park offer): grade what code stored, with no model call.
      const session = await liveSession(db, p.learnerId, p.topic.id);
      const reply = await seenReply(db, { learnerId: p.learnerId, topic: p.topic, sessionId: session!.id, turnSeq: 0, text: "", notesAfter });
      const coded = codedFailures(c.pass, reply, p.ctx);
      return { run, status: coded.length ? "fail" : "pass", reasons: coded, reply, costUsd: 0, note: "Code answered with no Tutor turn; graded by code only.", words: p.ctx.internalWords };
    }
    const started = performance.now();
    for await (const e of runTutorTurn({ db, client: deps.tutorClient(c, run), map, learnerId: p.learnerId, checkReplies: false }, c.answer ? { quickTryFollowUp: true } : c.message)) {
      if (e.type === "text") text += e.text;
      if (e.type === "replay") text = e.text;
      if (e.type === "done") {
        done = e.ref;
        if (e.usage.costUsd === null) troubles.push(`The Tutor Turn's cost is unknown (no price for ${deps.settings.model}), so the run is not passed.`);
        cost += e.usage.costUsd ?? 0;
        note = `Turn: ${((performance.now() - started) / 1000).toFixed(1)} s, ${e.usage.steps.length} loop step(s), tools ${e.usage.tools.join(", ") || "none"}, stop ${e.stopReason ?? "?"}, $${(e.usage.costUsd ?? 0).toFixed(4)}.`;
      }
      if (e.type === "error" || e.type === "refusal" || e.type === "cut_off" || e.type === "cut_short" || e.type === "busy" || e.type === "stale" || e.type === "not_allowed" || e.type === "save_failed")
        troubles.push(`The Tutor Turn sent "${e.type}"${"message" in e ? `: ${e.message}` : ""}.`);
    }
    if (!done) return { run, status: "fail", reasons: [...troubles, "The Tutor Turn did not finish."], costUsd: cost, note };
    const reply = await seenReply(db, { learnerId: p.learnerId, topic: p.topic, ...done, text, notesAfter });
    const problems = checkReply({ text: reply.text, widgets: reply.widgets, savedRule: reply.savedRule }, p.ctx);
    const coded = codedFailures(c.pass, reply, p.ctx);
    const questions = [...RUBRIC, ...(c.graderChecks ?? [])];
    const graded = await deps.grade(GRADER_SYSTEM, buildGraderPrompt({ stateNote: p.stateNote, message: c.message, reply, extra: c.graderChecks ?? [] }));
    cost += graded.costUsd;
    const grade = parseGrade(graded.text, questions.length);
    const verdict = judgeRun({ problems, coded: [...troubles, ...coded], grade, questions });
    return { run, status: verdict.passed ? "pass" : "fail", reasons: verdict.reasons, reply, problems, grade, costUsd: cost, note, words: p.ctx.internalWords };
  } catch (err) {
    return { run, status: "fail", reasons: [`The run failed: ${err instanceof Error ? err.message : String(err)}`], costUsd: cost };
  } finally {
    deps.budget.settle(held, cost);
  }
}

/** Runs tasks with at most `n` at a time, keeping their order in the results. */
async function pool<T>(tasks: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(n, tasks.length)) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        out[i] = await tasks[i]();
      }
    }),
  );
  return out;
}

function aggregate(c: AggregateCase, results: Map<string, LiveRun[]>): RunResult[] {
  const ctxFree = { step: "none" as const, exampleCurrency: "INR", caseCurrencies: [], openItems: [], internalWords: [] as string[] };
  return Array.from({ length: RUNS_PER_CASE }, (_, k): RunResult => {
    const replies = c.over.flatMap((id) => {
      const r = results.get(id)?.[k];
      return r?.reply ? [{ id, reply: r.reply, words: r.words ?? [] }] : [];
    });
    if (!replies.length) return { run: k + 1, status: "skipped", reasons: ["None of the cases it covers gave a reply in this run."], costUsd: 0 };
    // App words are judged against each covered case's own ids, as its run checked them.
    const reasons = replies.flatMap(({ id, reply, words }) => codedFailures(c.pass, reply, { ...ctxFree, internalWords: words }).map((f) => `${id}: ${f}`));
    const covered = replies.map((r) => r.id).join(", ");
    return { run: k + 1, status: reasons.length ? "fail" : "pass", reasons, costUsd: 0, note: `Replies checked: ${covered}.` };
  });
}

async function lint(c: LintCase, deps: SuiteDeps): Promise<CaseResult> {
  const root = deps.root ?? process.cwd();
  const base = { id: c.id, title: c.title, kind: c.kind } as const;
  if (c.pending) return { ...base, status: "pending", pending: c.pending, runs: [] };
  const fixture = c.failingFixture ? join(root, c.failingFixture) : null;
  if (!fixture || !existsSync(fixture))
    return { ...base, status: "pending", pending: `The fixture Topic whose Check tests an untaught Skill (${c.failingFixture ?? "none named"}) does not exist yet; the lesson lint ticket (#237) adds it with L1.`, runs: [] };
  const runs: RunResult[] = [];
  for (let run = 1; run <= RUNS_PER_CASE; run++) {
    const repo = await deps.courseCheck(root);
    const bad = await deps.courseCheck(fixture);
    const reasons = [
      ...(repo.passed ? [] : [`The course check fails on the repo's Topics:\n${repo.output}`]),
      ...(bad.passed ? ["The course check passes the fixture whose Check tests an untaught Skill; it should fail L1."] : []),
      ...(!bad.passed && !/\bL1\b/.test(bad.output) ? [`The course check fails the fixture, but not on L1:\n${bad.output}`] : []),
    ];
    runs.push({ run, status: reasons.length ? "fail" : "pass", reasons, costUsd: 0 });
  }
  return { ...base, status: caseStatus(runs), runs };
}

/** Runs every case and returns the report. Pending cases are reported with their reason and never run. */
export async function runSuite(cases: EvalCase[], deps: SuiteDeps): Promise<EvalReport> {
  const map = deps.map ?? loadCourseMap();
  const startedAt = new Date().toISOString();
  const log = deps.log ?? (() => {});
  const liveCases = cases.filter((c): c is LiveCase => c.kind === "live");
  const pending = new Map(liveCases.map((c) => [c.id, pendingReason(c, map)]));
  const runnable = liveCases.filter((c) => !pending.get(c.id));
  const tasks = runnable.flatMap((c) =>
    Array.from({ length: RUNS_PER_CASE }, (_, i) => async () => {
      const r = await runLive(c, i + 1, deps, map);
      log(`${r.status.toUpperCase()} ${c.id} run ${r.run} ($${deps.budget.spent.toFixed(3)} so far)`);
      return [c.id, r] as const;
    }),
  );
  const done = await pool(tasks, deps.concurrency ?? 3);
  const results = new Map<string, LiveRun[]>();
  for (const [id, r] of done) results.set(id, [...(results.get(id) ?? []), r].sort((a, b) => a.run - b.run));

  const out: CaseResult[] = [];
  for (const c of cases) {
    if (c.kind === "live") {
      const why = pending.get(c.id);
      if (why) out.push({ id: c.id, title: c.title, kind: c.kind, status: "pending", pending: why, runs: [] });
      else {
        const runs = (results.get(c.id) ?? []).map((r): RunResult => {
          const kept = { ...r };
          delete kept.words;
          return kept;
        });
        out.push({ id: c.id, title: c.title, kind: c.kind, status: caseStatus(runs), runs });
      }
    } else if (c.kind === "aggregate") {
      const runs = c.pending ? [] : aggregate(c, results);
      out.push(c.pending ? { id: c.id, title: c.title, kind: c.kind, status: "pending", pending: c.pending, runs } : { id: c.id, title: c.title, kind: c.kind, status: caseStatus(runs), runs });
    } else out.push(await lint(c, deps));
  }
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    tutor: { model: deps.settings.model, effort: deps.settings.effort, widgetEngine: deps.settings.widgetEngine },
    graderModel: deps.graderModel,
    fingerprint: deps.fingerprint,
    capUsd: deps.budget.cap,
    spentUsd: deps.budget.spent,
    budgetStop: deps.budget.stopped,
    cases: out,
  };
}
