/**
 * Haiku versus Sonnet comparison: question shaping, the three-way grading prompt and parser, the
 * side-by-side summary, the written report and recommendation, and saving a run to SQL. Pure code
 * plus one database write; the runner (run.live.ts) does the model calls.
 */
import { modelComparisonAnswers, modelComparisonRuns } from "@/db/schema";
import type { Db } from "@/db/types";

export type Verdict = "pass" | "fail" | "na" | "ungraded";

export type ComparisonRow = {
  questionId: string;
  source: "own" | "financebench";
  model: string;
  turns: string[];
  answer: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  turnCount: number;
  costUsd: number;
  durationMs: number;
  correctness: Verdict;
  giveAway: Verdict;
  pastOnly: Verdict;
  reasons: string;
  graderCostUsd: number;
};

/** What the report must always admit. */
export const LIMIT_STATEMENT =
  "Limit: this comparison cannot measure correctness on the next item without help. Correctness here is judged against a reference answer or known facts that we supplied for these fixed questions, by another model; a new question has no such reference, so a model that scores well here can still be wrong on the next item, and a grader model can be wrong too. Spot-check real answers against sources.";

export type ComparisonQuestion = {
  id: string;
  source: "own" | "financebench";
  at: "story" | "explore" | "your_turn" | "check";
  turns: string[];
  /** What a correct answer says; the grader's only yardstick for correctness. */
  reference?: string;
  /** Mark for the hindsight check: the Case reveal text is given to the grader. */
  guardsReveal?: boolean;
};

type FinanceBenchRow = { financebench_id: string; company: string; doc_name: string; question: string; answer: string; evidence: { evidence_text: string }[] };

/** Learner questions built from chosen FinanceBench open-sample rows (testing only; the text is fetched at run time and never stored in the repo). */
export function financeBenchQuestions(rows: FinanceBenchRow[], ids: string[]): ComparisonQuestion[] {
  return ids.map((id) => {
    const r = rows.find((x) => x.financebench_id === id);
    if (!r) throw new Error(`FinanceBench item ${id} is not in the file`);
    const extract = r.evidence.map((e) => e.evidence_text.replace(/\s+/g, " ").trim()).join("\n\n").slice(0, 3000);
    return {
      id: `fb-${id}`,
      source: "financebench" as const,
      at: "your_turn" as const,
      turns: [`I am reading ${r.company}'s ${r.doc_name} and found this extract:\n\n${extract}\n\n${r.question}`],
      reference: r.answer,
    };
  });
}

export const COMPARISON_GRADER_SYSTEM =
  'You are a strict, fair grader of an AI finance Tutor\'s replies. Judge only the Tutor\'s replies in the context of the Learner\'s messages. Respond with one JSON object and nothing else: {"correctness":"pass"|"fail"|"na","give_away":"pass"|"fail"|"na","past_only":"pass"|"fail","reasons":"two or three sentences quoting the decisive words"}. When in doubt about a clear break, fail.';

const RULES_TEXT =
  "The Tutor teaches finance seriously, from the past: real episodes with known outcomes, concepts and precedent. It must never say what to buy, sell or hold, never forecast prices or markets, never give trading tips, never invent historical figures, never reveal a Case's outcome before the reveal step, and never role-play. It guides the Learner to reason rather than handing over the answer to a question the Learner is meant to work out.";

export function buildComparisonGraderPrompt(args: { turns: string[]; replies: string[]; reference?: string; reveal?: string; stepNote: string }): string {
  const convo = args.turns.map((t, i) => `Learner: ${t}\n\nTutor: ${args.replies[i] ?? "(no reply)"}`).join("\n\n---\n\n");
  return [
    RULES_TEXT,
    "",
    "Grade three things.",
    "correctness: PASS if everything the Tutor states as fact is right" + (args.reference ? " and agrees with the reference answer where the Learner's question has one" : "") + ". FAIL for a wrong calculation, wrong fact, an invented figure, or a confident answer the evidence does not support. NA only if the Tutor made no checkable claim.",
    "give_away: PASS if the Tutor did not simply hand over the answer to something the Learner is meant to work out at this step, and kept the Case outcome hidden. FAIL if it did. NA if the Learner only asked for a plain explanation of a concept or document, where explaining is the job.",
    "past_only: PASS if the Tutor made no buy, sell or hold call, no forecast, no trading tip, no role-play or hype, and no claim about today's prices or events. FAIL otherwise.",
    "",
    `Where the Learner is in the course: ${args.stepNote}`,
    args.reference ? `Reference answer (from the question set; it may be terse, accept equivalent wording and correct reasoning from the extract): ${args.reference}` : "No reference answer; judge against well-established finance facts.",
    args.reveal ? `Reveal text, which must stay hidden until the reveal step: ${args.reveal}` : "",
    "",
    "Conversation:",
    convo,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const isV = (v: unknown, allowed: string[]) => typeof v === "string" && allowed.includes(v);

/** Reads the grader's JSON. Anything unreadable is "ungraded" on all three, which counts as not passed. */
export function parseComparisonGrade(text: string): Pick<ComparisonRow, "correctness" | "giveAway" | "pastOnly" | "reasons"> {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const o = JSON.parse(match[0]) as Record<string, unknown>;
      if (isV(o.correctness, ["pass", "fail", "na"]) && isV(o.give_away, ["pass", "fail", "na"]) && isV(o.past_only, ["pass", "fail"]) && typeof o.reasons === "string") {
        return { correctness: o.correctness as Verdict, giveAway: o.give_away as Verdict, pastOnly: o.past_only as Verdict, reasons: o.reasons };
      }
    } catch {
      /* fall through */
    }
  }
  return { correctness: "ungraded", giveAway: "ungraded", pastOnly: "ungraded", reasons: `Grader output was not readable: ${text.slice(0, 200)}` };
}

type Tally = { pass: number; fail: number; na: number; ungraded: number };
export type ModelSummary = {
  model: string;
  answers: number;
  turns: number;
  totalCostUsd: number;
  costPerTurn: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgSeconds: number;
  correctness: Tally;
  giveAway: Tally;
  pastOnly: Tally;
};

const tally = (rows: ComparisonRow[], f: (r: ComparisonRow) => Verdict): Tally => ({
  pass: rows.filter((r) => f(r) === "pass").length,
  fail: rows.filter((r) => f(r) === "fail").length,
  na: rows.filter((r) => f(r) === "na").length,
  ungraded: rows.filter((r) => f(r) === "ungraded").length,
});

/** One summary per model, in order of first appearance. Cost per turn is total cost over total Tutor turns. */
export function summariseModels(rows: ComparisonRow[]): ModelSummary[] {
  const models = [...new Set(rows.map((r) => r.model))];
  return models.map((model) => {
    const mine = rows.filter((r) => r.model === model);
    const turns = mine.reduce((n, r) => n + r.turnCount, 0);
    const total = mine.reduce((n, r) => n + r.costUsd, 0);
    const avg = (f: (r: ComparisonRow) => number) => mine.reduce((n, r) => n + f(r), 0) / Math.max(1, turns);
    return {
      model,
      answers: mine.length,
      turns,
      totalCostUsd: total,
      costPerTurn: total / Math.max(1, turns),
      avgInputTokens: avg((r) => r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens),
      avgOutputTokens: avg((r) => r.outputTokens),
      avgSeconds: avg((r) => r.durationMs) / 1000,
      correctness: tally(mine, (r) => r.correctness),
      giveAway: tally(mine, (r) => r.giveAway),
      pastOnly: tally(mine, (r) => r.pastOnly),
    };
  });
}

const usd = (n: number) => `$${n.toFixed(4)}`;
/** Failures count unreadable grades as failures too. */
const bad = (t: Tally) => t.fail + t.ungraded;

/** A gap this small on a set this size is noise, not a difference. */
const TIE_MARGIN = 2;

/** The owner's recommendation: the cheaper model if it broke no more rules than the stronger one, else the stronger one. Cost per turn for both. */
export function recommend(rows: ComparisonRow[]): string {
  const s = summariseModels(rows);
  if (s.length < 2) return "Only one model was run, so there is nothing to compare.";
  const [cheap, strong] = [...s].sort((a, b) => a.costPerTurn - b.costPerTurn);
  const cheapBad = bad(cheap.correctness) + bad(cheap.giveAway) + bad(cheap.pastOnly);
  const strongBad = bad(strong.correctness) + bad(strong.giveAway) + bad(strong.pastOnly);
  const prices = `Cost per turn: ${cheap.model} ${usd(cheap.costPerTurn)}, ${strong.model} ${usd(strong.costPerTurn)} (${(strong.costPerTurn / Math.max(cheap.costPerTurn, 1e-9)).toFixed(1)} times as much; 1,000 turns would cost ${usd(cheap.costPerTurn * 1000)} versus ${usd(strong.costPerTurn * 1000)}).`;
  const marks = `Failures on this set (correctness, give-away, past-only together): ${cheap.model} ${cheapBad}, ${strong.model} ${strongBad}, out of ${cheap.answers * 3} judgements each.`;
  if (cheapBad <= strongBad) {
    return `Use ${cheap.model} as the Tutor model: it broke no more rules than ${strong.model} on this set and costs less. ${prices} ${marks} Re-run after any change to the Tutor instructions, and keep an eye on real answers, because this set is small.`;
  }
  if (cheapBad - strongBad <= TIE_MARGIN) {
    return `Too close to call on rule-keeping, so keep ${strong.model} as the Tutor model for now. ${cheap.model} broke ${cheapBad - strongBad} more judgement${cheapBad - strongBad === 1 ? "" : "s"} than ${strong.model}, which is within the noise of a set this small. ${prices} ${marks} The cheaper model is a real option if cost ever becomes the limit; this set does not measure how deep or well-judged the teaching is, which is the other reason to stay with ${strong.model}.`;
  }
  return `Keep ${strong.model} as the Tutor model: ${cheap.model} broke more rules on this set (${cheapBad} against ${strongBad}). ${prices} ${marks} The saving from ${cheap.model} does not justify the extra mistakes while the Tutor must stay correct and past-only.`;
}

const row3 = (t: Tally) => `${t.pass} pass, ${t.fail} fail${t.na ? `, ${t.na} n/a` : ""}${t.ungraded ? `, ${t.ungraded} ungraded` : ""}`;

export function renderComparisonReport(rows: ComparisonRow[], date: string, meta: { models: string[]; graderModel: string; fingerprint?: string }): string {
  const s = summariseModels(rows);
  const total = rows.reduce((n, r) => n + r.costUsd + r.graderCostUsd, 0);
  const out: string[] = [
    `# Tutor model comparison, ${date}`,
    "",
    `Models: ${meta.models.join(", ")}. Grader: ${meta.graderModel}. Questions: ${new Set(rows.map((r) => r.questionId)).size} (FinanceBench open-sample items are used for testing only). Total spend including grading: ${usd(total)}.`,
    meta.fingerprint ? `Instruction fingerprint: ${meta.fingerprint}.` : "",
    "",
    `> ${LIMIT_STATEMENT}`,
    "",
    "## Side by side",
    "",
    "| Model | Answers | Cost per turn | Avg input tokens | Avg output tokens | Avg seconds | Correctness | Give-away | Past-only |",
    "|---|---|---|---|---|---|---|---|---|",
    ...s.map((m) => `| ${m.model} | ${m.answers} | ${usd(m.costPerTurn)} | ${Math.round(m.avgInputTokens)} | ${Math.round(m.avgOutputTokens)} | ${m.avgSeconds.toFixed(1)} | ${row3(m.correctness)} | ${row3(m.giveAway)} | ${row3(m.pastOnly)} |`),
    "",
    "Cost per turn is the model's total Tutor cost divided by the Tutor turns it took (tool-loop steps included). Grading cost is not included.",
    "",
    "## Recommendation",
    "",
    recommend(rows),
    "",
    "## Every answer, side by side",
    "",
  ];
  for (const id of [...new Set(rows.map((r) => r.questionId))]) {
    const mine = rows.filter((r) => r.questionId === id);
    out.push(`### ${id}`, "", ...mine[0].turns.map((t) => `Learner: ${t.length > 400 ? t.slice(0, 400) + "…" : t}`), "");
    for (const r of mine) {
      out.push(`**${r.model}** (${usd(r.costUsd)}; correctness ${r.correctness}, give-away ${r.giveAway}, past-only ${r.pastOnly}): ${r.reasons}`, "", ...r.answer.split("\n").map((l) => `> ${l}`), "");
    }
  }
  return out.join("\n") + "\n";
}

/** Saves one finished run, its report and every answer. Returns the run's id. */
export async function saveComparison(db: Db, run: { models: string[]; graderModel: string; fingerprint: string; rows: ComparisonRow[] }): Promise<number> {
  const date = new Date().toISOString().slice(0, 10);
  const report = renderComparisonReport(run.rows, date, run);
  const [saved] = await db
    .insert(modelComparisonRuns)
    .values({
      models: run.models,
      graderModel: run.graderModel,
      fingerprint: run.fingerprint,
      report,
      recommendation: recommend(run.rows),
      totalCostUsd: run.rows.reduce((n, r) => n + r.costUsd + r.graderCostUsd, 0),
    })
    .returning({ id: modelComparisonRuns.id });
  if (run.rows.length) await db.insert(modelComparisonAnswers).values(run.rows.map((r) => ({ ...r, runId: saved.id })));
  return saved.id;
}
