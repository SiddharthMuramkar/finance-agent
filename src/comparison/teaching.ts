/**
 * Teaching comparison: do Sonnet 5.5, Opus 5.5 and Fable 5.1 teach well on the explore flow, not
 * only keep the rules. Pure code: the teaching questions, the rubric and its grader prompt, the
 * blind ranking (shuffle, prompt, parse, unblind), the summary, the recommendation rule and the
 * report. The runner (run.live.ts, `npm run compare:models`) does the paid model calls.
 *
 * The shared reply rules (typed formula, named source, Insight stated too early, profile advice)
 * come from src/behaviour/grading.ts, so the Tutor is held to one set of rules everywhere.
 */
import { RULES, type RuleId } from "@/behaviour/grading";
import { modelComparisonAnswers, modelComparisonRuns } from "@/db/schema";
import type { Db } from "@/db/types";
import { LIMIT_STATEMENT } from "./compare";

export type TeachingKind = "insight" | "connection" | "plain" | "formula_words" | "own_life";

/** Every teaching question is asked at the explore step of the Present value Topic (pinned by the runner). */
export type TeachingQuestion = { id: string; kind: TeachingKind; turns: string[]; rules: RuleId[] };

export const TEACHING_QUESTIONS: TeachingQuestion[] = [
  { id: "t-insight-noticing", kind: "insight", turns: ["I moved the rate slider up and the number in the middle got smaller. What am I supposed to be noticing?"], rules: ["insight_early"] },
  { id: "t-insight-point", kind: "insight", turns: ["Just give me the point of this chart so I can move on."], rules: ["insight_early"] },
  { id: "t-insight-stuck", kind: "insight", turns: ["I have played with the sliders for a minute and I am not seeing anything. Can you help me look?"], rules: [] },
  { id: "t-connect-bonds", kind: "connection", turns: ["How do discount rates and bond yields relate?"], rules: [] },
  { id: "t-connect-price-falls", kind: "connection", turns: ["Why does a bond's price fall when yields rise? Is that the same thing as this slider?"], rules: [] },
  { id: "t-plain-newcomer", kind: "plain", turns: ["Explain present value as if I have never taken a finance class."], rules: [] },
  { id: "t-plain-discount-word", kind: "plain", turns: ["What does 'discount' even mean here? It sounds like a shop sale."], rules: [] },
  { id: "t-words-three-years", kind: "formula_words", turns: ["Describe in words, step by step, how to get today's value of $1,000 due in 3 years at 8% a year."], rules: ["typed_formula"] },
  { id: "t-words-every-year", kind: "formula_words", turns: ["How does the calculation change when a payment arrives every year for five years? Words please, I find symbols hard."], rules: ["typed_formula"] },
  { id: "t-life-loan", kind: "own_life", turns: ["I am paying off a home loan at 8.5% a year. Where does this idea show up in something like that?"], rules: ["profile_advice"] },
  { id: "t-life-bonus", kind: "own_life", turns: ["My bonus is paid in March and my salary every month. How does waiting for it connect to this idea?"], rules: ["profile_advice"] },
  { id: "t-library-backed", kind: "plain", turns: ["Why does a higher discount rate lower present value? Back it up with something from the Library."], rules: ["source_named"] },
];

export type Verdict = "pass" | "fail" | "ungraded";

export type RubricItem = { id: string; title: string; rubric: string };

/** The analyst-course rubric. Every item is pass or fail for each answer. */
export const RUBRIC_ITEMS: RubricItem[] = [
  { id: "accurate", title: "Accurate", rubric: "PASS if everything stated as fact is right and no figure is invented. FAIL for a wrong fact or calculation." },
  {
    id: "guides",
    title: "Guides rather than tells",
    rubric:
      "PASS if the Tutor helps the Learner see the idea for themselves (a question, a pointer to the Widget, a plain step) and does not simply hand over a conclusion the Learner is meant to find. Where the Learner only asks for an explanation of a concept, explaining plainly is guiding. FAIL if it states the Topic's hidden Insight early or does the thinking for the Learner.",
  },
  {
    id: "analyst_level",
    title: "Pitched at an analyst course",
    rubric:
      "The course is for people training as analysts. PASS if terms an MBA student already knows (discount rate, yield, present value, cash flow, bond price) are used without a lecture, and the tone is calm and respectful, not childish. FAIL if it over-explains basics at a beginner's pace with no sign the Learner asked for that, or talks down.",
  },
  {
    id: "defines_terms",
    title: "Defines a new term at first use",
    rubric: "PASS if every term an MBA student would not already know is defined in plain words at first use (or no such term appears). FAIL if a new technical term is used undefined.",
  },
  {
    id: "unambiguous",
    title: "No ambiguous words",
    rubric:
      "PASS if each word that could mean two things in finance (for example 'value', 'return', 'rate', 'yield', 'discount', 'worth') is clear from context or pinned down where it first matters. FAIL if an ambiguous word is left to carry the explanation and a careful Learner could read it two ways.",
  },
  {
    id: "no_advice",
    title: "No advice",
    rubric: "PASS if the Tutor gives no buy, sell or hold call, no forecast and no instruction about the Learner's own money. FAIL otherwise.",
  },
];

export const RUBRIC_SYSTEM =
  'You are a strict, fair grader of an AI finance Tutor\'s reply in an analyst course. Judge only the Tutor\'s reply, in the context of the Learner\'s message. Respond with one JSON object and nothing else: {"items":{"<item id>":"pass"|"fail",...},"rules":{"<rule id>":"pass"|"fail",...},"reasons":"two or three sentences quoting the decisive words"}. Include every item id and every rule id listed. When in doubt about a clear break, fail.';

export function buildRubricPrompt(args: { turns: string[]; reply: string; rules: RuleId[]; insight?: string; stepNote: string }): string {
  const lines = [
    "The Tutor teaches finance seriously, calm and plain-spoken, from the past, to Learners training as analysts. It never says what to buy, sell or hold, never forecasts, never invents figures, and never reveals the Topic's Insight or a Case outcome before the Learner has tried.",
    "",
    `Where the Learner is in the course: ${args.stepNote}`,
    args.insight ? `The Topic's written Insight, which must stay hidden until the Learner has made an attempt: ${args.insight}` : "",
    "",
    "Grade each rubric item as pass or fail. Use these item ids exactly.",
    ...RUBRIC_ITEMS.map((i) => `- ${i.id} (${i.title}): ${i.rubric}`),
  ];
  if (args.rules.length) {
    lines.push("", "Also grade these shared reply rules as pass or fail, under the rule ids shown.");
    for (const id of args.rules) {
      const rule = RULES.find((r) => r.id === id);
      if (rule && !rule.byCode) lines.push(`- ${id} (${rule.title}): ${rule.rubric}`);
    }
  }
  lines.push("", "Conversation:", ...args.turns.map((t, i) => `Learner: ${t}\n\nTutor: ${i === args.turns.length - 1 ? args.reply : "(earlier reply)"}`));
  return lines.filter((l) => l !== "").join("\n");
}

export type RubricVerdicts = Record<string, Verdict>;
export type RuleVerdicts = Partial<Record<RuleId, Verdict>>;

const isPF = (v: unknown): v is "pass" | "fail" => v === "pass" || v === "fail";

/** Reads the grader's JSON. Anything missing or unreadable is "ungraded", which counts as not passed. */
export function parseRubric(text: string, rules: RuleId[]): { rubric: RubricVerdicts; rules: RuleVerdicts; reasons: string } {
  let items: Record<string, unknown> = {};
  let ruleOut: Record<string, unknown> = {};
  let reasons = `Grader output was not readable: ${text.slice(0, 200)}`;
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const o = JSON.parse(match[0]) as { items?: Record<string, unknown>; rules?: Record<string, unknown>; reasons?: unknown };
      items = o.items ?? {};
      ruleOut = o.rules ?? {};
      reasons = typeof o.reasons === "string" ? o.reasons : "";
    } catch {
      /* leave everything ungraded */
    }
  }
  const rubric: RubricVerdicts = Object.fromEntries(RUBRIC_ITEMS.map((i) => [i.id, isPF(items[i.id]) ? (items[i.id] as Verdict) : "ungraded"]));
  const ruleVerdicts: RuleVerdicts = {};
  for (const id of rules) {
    const rule = RULES.find((r) => r.id === id);
    if (rule?.byCode) continue;
    ruleVerdicts[id] = isPF(ruleOut[id]) ? (ruleOut[id] as Verdict) : "ungraded";
  }
  return { rubric, rules: ruleVerdicts, reasons };
}

export const rubricPassed = (r: RubricVerdicts) => Object.values(r).filter((v) => v === "pass").length;

/** Shared rules that code grades alone (the typed-formula detector); no grader call, no cost. */
export function codeRuleVerdicts(replies: string[], rules: RuleId[]): RuleVerdicts {
  const out: RuleVerdicts = {};
  for (const id of rules) {
    const rule = RULES.find((r) => r.id === id);
    if (rule?.byCode) out[id] = rule.byCode(replies).verdict;
  }
  return out;
}

/** A small seeded shuffle so the same question always hides the models in the same order. */
function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** The order the answers are shown in: position 0 is "Answer A". Seeded by the question id. */
export function blindOrder(models: string[], seed: string): string[] {
  const out = [...models];
  let h = hash(seed) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const LABELS = "ABCDEFGH";

export const RANKING_SYSTEM = 'You rank answers blind. Respond with one JSON object and nothing else: {"ranking":["B","A","C"],"reasons":"two sentences"} listing every label from best teaching to worst.';

export function buildRankingPrompt(args: { turns: string[]; answers: string[]; stepNote: string }): string {
  return [
    "Rank these answers from an AI finance Tutor to the same Learner message, best teaching first. Good teaching here: accurate; helps the Learner see the idea rather than just telling them; pitched at people training as analysts (MBA terms are fine, a new term is defined at first use, no ambiguous words); no advice. Judge the teaching, not the length.",
    `Where the Learner is in the course: ${args.stepNote}`,
    "",
    ...args.turns.map((t) => `Learner: ${t}`),
    "",
    ...args.answers.flatMap((a, i) => [`Answer ${LABELS[i]}:`, a, ""]),
  ].join("\n");
}

/** A full ranking of the labels, best first, or null when it is partial, repeated or unreadable. */
export function parseRanking(text: string, count: number): string[] | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]) as { ranking?: unknown };
    if (!Array.isArray(o.ranking) || o.ranking.length !== count) return null;
    const labels = o.ranking.map((x) => String(x).trim().toUpperCase());
    const want = LABELS.slice(0, count).split("");
    return want.every((l) => labels.includes(l)) && new Set(labels).size === count ? labels : null;
  } catch {
    return null;
  }
}

/** order[i] is the model shown as label i; the ranking lists labels best first. Returns each model's rank (1 is best). */
export function unblind(order: string[], ranking: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  ranking.forEach((label, pos) => {
    out[order[LABELS.indexOf(label)]] = pos + 1;
  });
  return out;
}

export type TeachingRow = {
  questionId: string;
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
  rubric: RubricVerdicts;
  rules: RuleVerdicts;
  /** 1 is best among the models on this question; null when the ranking could not be read. */
  rank: number | null;
  reasons: string;
  graderCostUsd: number;
};

export type TeachingSummary = {
  model: string;
  answers: number;
  turns: number;
  costPerTurn: number;
  totalCostUsd: number;
  /** Share of rubric judgements that passed; ungraded counts as not passed. */
  rubricRate: number;
  meanRank: number;
  /** Shared-rule failures, unreadable verdicts included. */
  ruleFails: number;
  avgSeconds: number;
};

export function summariseTeaching(rows: TeachingRow[]): TeachingSummary[] {
  return [...new Set(rows.map((r) => r.model))].map((model) => {
    const mine = rows.filter((r) => r.model === model);
    const turns = mine.reduce((n, r) => n + r.turnCount, 0);
    const total = mine.reduce((n, r) => n + r.costUsd, 0);
    const ranks = mine.map((r) => r.rank).filter((x): x is number => x !== null);
    return {
      model,
      answers: mine.length,
      turns,
      costPerTurn: total / Math.max(1, turns),
      totalCostUsd: total,
      rubricRate: mine.reduce((n, r) => n + rubricPassed(r.rubric), 0) / Math.max(1, mine.length * RUBRIC_ITEMS.length),
      meanRank: ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : Number.POSITIVE_INFINITY,
      ruleFails: mine.reduce((n, r) => n + Object.values(r.rules).filter((v) => v !== "pass").length, 0),
      avgSeconds: mine.reduce((n, r) => n + r.durationMs, 0) / Math.max(1, turns) / 1000,
    };
  });
}

/** A model within these margins of the best counts as just as good. The set is small, so smaller gaps are noise. */
export const RUBRIC_MARGIN = 0.05;
export const RANK_MARGIN = 0.25;

const usd = (n: number) => `$${n.toFixed(4)}`;

/**
 * The rule, in code. The best model has the fewest shared-rule failures, then the highest rubric rate,
 * then the best mean rank. The recommendation is the cheapest model that breaks no more shared rules
 * than the best, is within the rubric margin and within the rank margin. Every price is stated.
 */
export function recommendTeaching(rows: TeachingRow[]): { model: string | null; text: string } {
  const s = summariseTeaching(rows);
  if (s.length < 2) return { model: null, text: "Only one model was run, so there is nothing to compare." };
  const best = [...s].sort((a, b) => a.ruleFails - b.ruleFails || b.rubricRate - a.rubricRate || a.meanRank - b.meanRank)[0];
  const eligible = s.filter((m) => m.ruleFails <= best.ruleFails && m.rubricRate >= best.rubricRate - RUBRIC_MARGIN && m.meanRank <= best.meanRank + RANK_MARGIN);
  const pick = [...eligible].sort((a, b) => a.costPerTurn - b.costPerTurn)[0];
  const prices = `Cost per turn: ${[...s].sort((a, b) => a.costPerTurn - b.costPerTurn).map((m) => `${m.model} ${usd(m.costPerTurn)}`).join(", ")}.`;
  const marks = `Scores: ${s.map((m) => `${m.model} rubric ${(m.rubricRate * 100).toFixed(0)}%, mean rank ${Number.isFinite(m.meanRank) ? m.meanRank.toFixed(2) : "n/a"}, shared-rule failures ${m.ruleFails}`).join("; ")}.`;
  const why =
    pick.model === best.model
      ? `${pick.model} teaches best on this set and no cheaper model came within the margins (rubric within ${RUBRIC_MARGIN * 100} points, mean rank within ${RANK_MARGIN}, no extra shared-rule failures).`
      : `${pick.model} is the cheapest model that teaches as well as the best (${best.model}) within the margins: rubric within ${RUBRIC_MARGIN * 100} points, mean rank within ${RANK_MARGIN}, no extra shared-rule failures.`;
  return { model: pick.model, text: `Use ${pick.model} as the Tutor model. ${why} ${prices} ${marks} The set is small, so treat this as a strong hint and spot-check real answers.` };
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export function renderTeachingReport(rows: TeachingRow[], date: string, meta: { models: string[]; graderModel: string; fingerprint?: string }): string {
  const s = summariseTeaching(rows);
  const total = rows.reduce((n, r) => n + r.costUsd + r.graderCostUsd, 0);
  const out: string[] = [
    `# Teaching comparison, ${date}`,
    "",
    `Models: ${meta.models.join(", ")}. Grader and blind ranker: ${meta.graderModel}. Questions: ${new Set(rows.map((r) => r.questionId)).size}, all at the explore step of the Present value Topic. Total spend including grading: ${usd(total)}.`,
    meta.fingerprint ? `Instruction fingerprint: ${meta.fingerprint}.` : "",
    "",
    `> ${LIMIT_STATEMENT}`,
    "",
    "## Side by side",
    "",
    "| Model | Answers | Cost per turn | Avg seconds | Rubric passed | Mean blind rank (1 best) | Shared-rule failures |",
    "|---|---|---|---|---|---|---|",
    ...s.map((m) => `| ${m.model} | ${m.answers} | ${usd(m.costPerTurn)} | ${m.avgSeconds.toFixed(1)} | ${pct(m.rubricRate)} | ${Number.isFinite(m.meanRank) ? m.meanRank.toFixed(2) : "n/a"} | ${m.ruleFails} |`),
    "",
    "Cost per turn is the model's total Tutor cost divided by the Tutor turns it took. Grading cost is not included.",
    "",
    "## Rubric items passed, per model",
    "",
    `| Model | ${RUBRIC_ITEMS.map((i) => i.title).join(" | ")} |`,
    `|---|${RUBRIC_ITEMS.map(() => "---").join("|")}|`,
    ...s.map((m) => {
      const mine = rows.filter((r) => r.model === m.model);
      return `| ${m.model} | ${RUBRIC_ITEMS.map((i) => `${mine.filter((r) => r.rubric[i.id] === "pass").length}/${mine.length}`).join(" | ")} |`;
    }),
    "",
    "## Recommendation",
    "",
    recommendTeaching(rows).text,
    "",
    "## Every answer, side by side",
    "",
  ];
  for (const id of [...new Set(rows.map((r) => r.questionId))]) {
    const mine = rows.filter((r) => r.questionId === id);
    out.push(`### ${id}`, "", ...mine[0].turns.map((t) => `Learner: ${t}`), "");
    for (const r of mine) {
      const failed = Object.entries({ ...r.rubric, ...r.rules }).filter(([, v]) => v !== "pass").map(([k, v]) => `${k} ${v}`);
      out.push(`**${r.model}** (${usd(r.costUsd)}; rank ${r.rank ?? "n/a"}; ${failed.length ? `not passed: ${failed.join(", ")}` : "all passed"}): ${r.reasons}`, "", ...r.answer.split("\n").map((l) => `> ${l}`), "");
    }
  }
  return out.join("\n") + "\n";
}

/**
 * Saves a finished teaching run in the existing comparison tables (no new table): the report and the
 * recommendation go in model_comparison_runs; each answer goes in model_comparison_answers with
 * correctness = the "accurate" item, give_away = the "guides" item, past_only = no advice plus every
 * shared rule, and the rubric detail, rank and grader reasons written into `reasons`. Returns the run id.
 */
export async function saveTeaching(db: Db, run: { models: string[]; graderModel: string; fingerprint: string; rows: TeachingRow[] }): Promise<number> {
  const date = new Date().toISOString().slice(0, 10);
  const [saved] = await db
    .insert(modelComparisonRuns)
    .values({
      models: run.models,
      graderModel: run.graderModel,
      fingerprint: run.fingerprint,
      report: renderTeachingReport(run.rows, date, run),
      recommendation: recommendTeaching(run.rows).text,
      totalCostUsd: run.rows.reduce((n, r) => n + r.costUsd + r.graderCostUsd, 0),
    })
    .returning({ id: modelComparisonRuns.id });
  const advice = (r: TeachingRow): Verdict => {
    const all = [r.rubric.no_advice, ...Object.values(r.rules)];
    return all.includes("fail") ? "fail" : all.includes("ungraded") ? "ungraded" : "pass";
  };
  if (run.rows.length) {
    await db.insert(modelComparisonAnswers).values(
      run.rows.map((r) => ({
        runId: saved.id,
        questionId: r.questionId,
        source: "own",
        model: r.model,
        turns: r.turns,
        answer: r.answer,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cacheReadTokens: r.cacheReadTokens,
        cacheWriteTokens: r.cacheWriteTokens,
        turnCount: r.turnCount,
        costUsd: r.costUsd,
        durationMs: r.durationMs,
        correctness: r.rubric.accurate ?? "ungraded",
        giveAway: r.rubric.guides ?? "ungraded",
        pastOnly: advice(r),
        reasons: `teaching; blind rank ${r.rank ?? "n/a"}; rubric ${JSON.stringify(r.rubric)}; rules ${JSON.stringify(r.rules)}; ${r.reasons}`,
        graderCostUsd: r.graderCostUsd,
      })),
    );
  }
  return saved.id;
}
