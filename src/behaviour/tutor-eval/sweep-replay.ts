/**
 * The 50-turn replay (spec #229, ticket #248): the last Learner turns from stored Sessions, each sent again through
 * the real Tutor Turn on its own throwaway database, with `fixReply` and `checkReply` run on every reply. The report
 * gives the pass rate for each rule (V1 to V7), the longest reply in words, and every failure in full.
 *
 * `scripts/tutor-replay.mjs` reads the turns (read-only) and turns each into a live case with `caseFromSession`;
 * this file replays them. The model client and the database come in as dependencies, so the path runs offline with
 * a scripted model (`sweep-replay.live.ts` wires the real ones).
 */
import { loadCourseMap, type CourseMap } from "@/course/map";
import type { Db } from "@/db/types";
import { checkReply, countWords, fixReply, splitAsk, type ReplyProblem } from "@/tutor/reply-checks";
import { runTutorTurn, type TutorClient } from "@/tutor/turn";
import type { Budget } from "./budget";
import type { LiveCase } from "./case";
import { noteMark, pendingReason, prepareCase, seenReply, type TutorSettings } from "./setup";

export const RULES = ["V1", "V2", "V3", "V4", "V5", "V6", "V7"] as const;
export type Rule = (typeof RULES)[number];

export type ReplayDeps = {
  map?: CourseMap;
  settings: TutorSettings;
  budget: Budget;
  newDb: () => Promise<Db>;
  tutorClient: (c: LiveCase) => TutorClient;
  concurrency?: number;
  log?: (line: string) => void;
};

export type ReplayTurn = {
  id: string;
  title: string;
  source?: string;
  /** What the Learner sent. */
  message: string;
  status: "ok" | "skipped" | "error";
  /** Why it was skipped or failed. */
  reason?: string;
  /** The reply after the code fixes, as the Learner would see it. */
  reply?: string;
  words?: number;
  /** The style slips code fixed before the checks. */
  fixed?: string[];
  problems: ReplyProblem[];
  costUsd: number;
};

export type ReplayReport = {
  startedAt: string;
  finishedAt: string;
  tutor: TutorSettings;
  capUsd: number;
  spentUsd: number;
  budgetStop: string | null;
  turns: ReplayTurn[];
  /** For each rule, the replies that kept it, out of the replies checked. */
  rules: Record<Rule, { passed: number; total: number }>;
  longestWords: number;
};

async function replayOne(c: LiveCase, deps: ReplayDeps, map: CourseMap): Promise<ReplayTurn> {
  const base = { id: c.id, title: c.title, source: c.source, message: c.message, problems: [] as ReplyProblem[], costUsd: 0 };
  const why = pendingReason(c, map);
  if (why) return { ...base, status: "skipped", reason: why };
  const held = deps.budget.estimate();
  if (!deps.budget.hold(held)) return { ...base, status: "skipped", reason: `Not run: ${deps.budget.stopped}` };
  let cost = 0;
  try {
    const db = await deps.newDb();
    const p = await prepareCase(db, c, { map, settings: deps.settings });
    const notesAfter = await noteMark(db, p.learnerId);
    let text = "";
    let done: { sessionId: number; turnSeq: number } | null = null;
    const troubles: string[] = [];
    for await (const e of runTutorTurn({ db, client: deps.tutorClient(c), map, learnerId: p.learnerId }, c.message)) {
      if (e.type === "text") text += e.text;
      if (e.type === "replay") text = e.text;
      if (e.type === "done") {
        done = e.ref;
        cost += e.usage.costUsd ?? 0;
      }
      if (e.type === "error" || e.type === "refusal" || e.type === "cut_off" || e.type === "cut_short" || e.type === "busy" || e.type === "stale" || e.type === "not_allowed" || e.type === "save_failed")
        troubles.push(`The Tutor Turn sent "${e.type}"${"message" in e ? `: ${e.message}` : ""}.`);
    }
    if (!done) return { ...base, status: "error", reason: [...troubles, "The Tutor Turn did not finish."].join(" "), costUsd: cost };
    if (troubles.length) return { ...base, status: "error", reason: troubles.join(" "), costUsd: cost };
    const seen = await seenReply(db, { learnerId: p.learnerId, topic: p.topic, ...done, text, notesAfter });
    // The fixes that cost no retry run first, as the Tutor Turn does, so a rule fails only on what code cannot fix.
    const fixed = fixReply({ text: seen.text, widgets: seen.widgets, savedRule: seen.savedRule });
    const problems = checkReply(fixed, p.ctx);
    const { message, ask } = splitAsk(fixed.text);
    return { ...base, status: "ok", reply: fixed.text, words: countWords(message) + (ask ? countWords(ask) : 0), fixed: seen.fixed, problems, costUsd: cost };
  } catch (err) {
    return { ...base, status: "error", reason: err instanceof Error ? err.message : String(err), costUsd: cost };
  } finally {
    deps.budget.settle(held, cost);
  }
}

/** Replays each turn (at most `concurrency` at a time, in order in the report) and totals the rules. */
export async function runReplay(cases: LiveCase[], deps: ReplayDeps): Promise<ReplayReport> {
  const map = deps.map ?? loadCourseMap();
  const startedAt = new Date().toISOString();
  const turns: ReplayTurn[] = new Array(cases.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(deps.concurrency ?? 3, cases.length)) }, async () => {
      while (next < cases.length) {
        const i = next++;
        turns[i] = await replayOne(cases[i], deps, map);
        deps.log?.(`${turns[i].status.toUpperCase()} ${cases[i].id} ($${deps.budget.spent.toFixed(3)} so far)`);
      }
    }),
  );
  const checked = turns.filter((t) => t.status === "ok");
  const rules = Object.fromEntries(
    RULES.map((r) => [r, { passed: checked.filter((t) => !t.problems.some((p) => p.rule === r)).length, total: checked.length }]),
  ) as ReplayReport["rules"];
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    tutor: deps.settings,
    capUsd: deps.budget.cap,
    spentUsd: deps.budget.spent,
    budgetStop: deps.budget.stopped,
    turns,
    rules,
    longestWords: Math.max(0, ...checked.map((t) => t.words ?? 0)),
  };
}

/** The replay is clean when every turn was checked, every rule held and the longest reply is within 120 words. */
export function replayClean(r: ReplayReport): boolean {
  return r.turns.every((t) => t.status === "ok" && !t.problems.length) && r.longestWords <= 120;
}

const quote = (text: string) =>
  text
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** The full report: settings and spend, the pass rate per rule, then every failed, skipped or errored turn in full. */
export function renderReplay(r: ReplayReport): string {
  const checked = r.turns.filter((t) => t.status === "ok").length;
  const bad = r.turns.filter((t) => t.status !== "ok" || t.problems.length);
  const lines = [
    `# Replay of ${r.turns.length} Learner turns, ${r.startedAt.slice(0, 10)}`,
    "",
    `Tutor: ${r.tutor.model}, effort ${r.tutor.effort}, widget engine ${r.tutor.widgetEngine}. Spent $${r.spentUsd.toFixed(2)} of the $${r.capUsd.toFixed(2)} cap. Started ${r.startedAt}, finished ${r.finishedAt}.`,
    `Checked ${checked} of ${r.turns.length} turns. Longest reply: ${r.longestWords} words (the limit is 120): **${r.longestWords <= 120 ? "within the limit" : "OVER the limit"}**.`,
    ...(r.budgetStop ? ["", `**${r.budgetStop}** Turns after that point were not run.`] : []),
    "",
    "| Rule | Replies passing | Pass rate |",
    "| --- | --- | --- |",
    ...RULES.map((k) => `| ${k} | ${r.rules[k].passed} of ${r.rules[k].total} | ${r.rules[k].total ? Math.round((100 * r.rules[k].passed) / r.rules[k].total) : 0}% |`),
    "",
    "## Failures",
    "",
  ];
  if (!bad.length) lines.push("None.", "");
  for (const t of bad) {
    lines.push(`### ${t.title} (${t.id})`, "");
    if (t.source) lines.push(`Source: ${t.source}.`);
    lines.push(`Status: ${t.status}${t.reason ? `: ${cell(t.reason)}` : ""}.`, "", "The Learner sent:", "", quote(t.message), "");
    if (t.reply !== undefined) lines.push(`The reply, as the Learner sees it (${t.words} words):`, "", quote(t.reply || "(empty)"), "");
    if (t.fixed?.length) lines.push(`Code fixed before the checks: ${t.fixed.join(", ")}.`, "");
    for (const p of t.problems) lines.push(`- ${p.rule}: ${p.message}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** The files to write to the report folder, by name: this replay's report and JSON, and the latest copies. */
export function replayFiles(r: ReplayReport): Record<string, string> {
  const stamp = r.startedAt.replace(/[:.]/g, "-");
  const md = renderReplay(r);
  const json = JSON.stringify(r, null, 2);
  return { [`replay-${stamp}.md`]: md, [`replay-${stamp}.json`]: json, "replay-latest.md": md, "replay-latest.json": json };
}
