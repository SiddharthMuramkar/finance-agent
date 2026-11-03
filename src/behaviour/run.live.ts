/**
 * Tutor behaviour run (real API). One command: `npm run behaviour`.
 *
 * Each question gets a fresh in-memory PGlite database, the real Tutor instructions and tools, and
 * the real Tutor Turn with the real model. The Learner is placed at a Teaching Step before the
 * reveal, the question(s) are sent, and `claude-opus-5-5` grades the replies against the written
 * rubric in grading.ts. A results report is written to the output folder.
 *
 * Options (environment): ONLY=id,id (run some questions), RULE=hindsight (one rule),
 * BEHAVIOUR_BUDGET_USD (default 3.5, counts Tutor and grader spend), BEHAVIOUR_OUT (report folder),
 * BEHAVIOUR_CONCURRENCY (default 4), CASE_DATA_FILE (checked Case Data import file; skipped if absent).
 *
 * A second, targeted test (made-up examples before the reveal) asserts its grade and writes a short
 * record (made-up-example-<time>.md) to the report folder. Run it alone with
 * -t "made-up example before the reveal".
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { importCaseData, type CaseDatasetInput } from "@/case-data/import";
import { loadCourseMap } from "@/course/map";
import type { Db } from "@/db/types";
import { saveJump, takeJumpEntry } from "@/learner/memory";
import { saveProfile } from "@/learner/profile";
import { placeLearner } from "./place";
import { testDb } from "@/test/pglite";
import { anthropicTutorClient } from "@/tutor/anthropic";
import { TUTOR_INSTRUCTIONS, TUTOR_TOOLS } from "@/tutor/instructions";
import { costUsd } from "@/tutor/pricing";
import { DEFAULT_SETTINGS, fingerprint } from "@/tutor/session-log";
import { runTutorTurn } from "@/tutor/turn";
import type { TurnUsage } from "@/tutor/usage";
import { BEHAVIOUR_QUESTIONS, type BehaviourQuestion } from "./questions";
import { buildGraderPrompt, GRADER_SYSTEM, parseGrade, renderReport, RULES, type Graded, type Rule } from "./grading";

// Each question's fresh database starts from the default settings, so this is the model the Tutor runs on.
const TUTOR_MODEL = DEFAULT_SETTINGS.model;
const GRADER_MODEL = "claude-opus-5-5";
const OUT = process.env.BEHAVIOUR_OUT ?? join(homedir(), ".claude/projects/-Users-siddharth-Desktop-finance-agent/evidence/18");
const BUDGET = Number(process.env.BEHAVIOUR_BUDGET_USD ?? "3.5");
const CONCURRENCY = Number(process.env.BEHAVIOUR_CONCURRENCY ?? "4");
const CASE_DATA = process.env.CASE_DATA_FILE ?? join(homedir(), ".claude/projects/-Users-siddharth-Desktop-finance-agent/case-data/mega-millions-2018.json");

const QUESTIONS_TOPIC = "present-value";

const map = loadCourseMap();
const tutorClient = anthropicTutorClient();
const anthropic = new Anthropic();
let spent = 0;

/**
 * `prepare` runs on the fresh database before the Learner is placed (a targeted test's own Case Data
 * and Topic). `usages` holds each finished turn's usage; a turn cut off at its time limit has none.
 */
async function ask(
  q: BehaviourQuestion,
  prepare?: (db: Db) => Promise<void>,
): Promise<{ replies: string[]; cost: number; stepNote: string; usages: TurnUsage[] }> {
  const db = await testDb();
  if (existsSync(CASE_DATA)) await importCaseData(db, JSON.parse(readFileSync(CASE_DATA, "utf8")));
  // The 48 questions are written for the present value Topic (the Mega Millions Case), which is no
  // longer first on the default path, so they pin it; a targeted test pins its own Topic in `prepare`.
  if (prepare) await prepare(db);
  else {
    await saveJump(db, map, QUESTIONS_TOPIC);
    await takeJumpEntry(db);
  }
  if (q.profile) await saveProfile(db, q.profile);
  const place = await placeLearner(db, map, q.at);
  const stepNote = `Topic "${place.topic.title}", Teaching Step "${place.step}" (before the reveal; the Learner has not seen the outcome).`;
  const replies: string[] = [];
  const usages: TurnUsage[] = [];
  let cost = 0;
  for (const turn of q.turns) {
    let text = "";
    for await (const e of runTutorTurn({ db, client: tutorClient, map }, turn)) {
      if (e.type === "text") text += e.text;
      if (e.type === "error") text += `\n[ERROR: ${e.message}]`;
      if (e.type === "refusal") text += `\n[REFUSAL: ${e.message}]`;
      if (e.type === "done") {
        cost += e.usage.costUsd ?? 0;
        usages.push(e.usage);
      }
    }
    replies.push(text.trim());
  }
  return { replies, cost, stepNote, usages };
}

/** `own` replaces the rule's rubric and the Reveal text, for a targeted test about one Case. */
async function grade(q: BehaviourQuestion, replies: string[], stepNote: string, own?: { rule: Rule; reveal: string }) {
  const rule = own?.rule ?? RULES.find((r) => r.id === q.rule)!;
  // Some rules are graded by code alone, with no grader model call.
  if (rule.byCode) return { grade: rule.byCode(replies), cost: 0 };
  const reveal = own
    ? own.reveal
    : q.rule === "hindsight"
      ? map.topics.flatMap((t) => t.cases).map((c) => c.reveal.trim().replace(/\s+/g, " ")).join(" ")
      : q.rule === "insight_early"
        ? map.topic(QUESTIONS_TOPIC)?.insight?.written.trim().replace(/\s+/g, " ")
        : undefined;
  const res = await anthropic.messages.create({
    model: GRADER_MODEL,
    max_tokens: 2000,
    system: GRADER_SYSTEM,
    messages: [{ role: "user", content: buildGraderPrompt({ rule, turns: q.turns, replies, reveal, stepNote }) }],
  });
  const u = res.usage;
  const cost = costUsd(GRADER_MODEL, {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  }) ?? 0;
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return { grade: parseGrade(text), cost };
}

async function runOne(q: BehaviourQuestion): Promise<Graded> {
  const base = { id: q.id, rule: q.rule, style: q.style, turns: q.turns };
  if (spent >= BUDGET) return { ...base, answer: "(skipped: budget reached)", verdict: "ungraded", reasons: "Budget reached before this question ran.", costUsd: 0 };
  try {
    const { replies, cost, stepNote } = await ask(q);
    spent += cost;
    const answer = q.turns.length === 1 ? replies[0] : replies.map((r, i) => `[reply ${i + 1}] ${r}`).join("\n\n");
    if (replies.some((r) => r.includes("[ERROR:") || r.includes("[REFUSAL:") || r === "")) {
      return { ...base, answer, verdict: "ungraded", reasons: "The Tutor Turn gave an error, a refusal or an empty reply.", costUsd: cost };
    }
    const g = await grade(q, replies, stepNote);
    spent += g.cost;
    return { ...base, answer, ...g.grade, costUsd: cost };
  } catch (err) {
    return { ...base, answer: "", verdict: "ungraded", reasons: `Run failed: ${err instanceof Error ? err.message : String(err)}`, costUsd: 0 };
  }
}

it("Tutor behaviour test set", { timeout: 3_600_000 }, async () => {
  const only = process.env.ONLY?.split(",");
  const questions = BEHAVIOUR_QUESTIONS.filter((q) => (!only || only.includes(q.id)) && (!process.env.RULE || q.rule === process.env.RULE));
  const results: Graded[] = new Array(questions.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < questions.length) {
        const i = next++;
        results[i] = await runOne(questions[i]);
        console.log(`${results[i].verdict.toUpperCase()} ${results[i].id} ($${spent.toFixed(3)} so far)`);
      }
    }),
  );
  const date = new Date().toISOString().slice(0, 10);
  const report = renderReport(results, date, { tutorModel: TUTOR_MODEL, graderModel: GRADER_MODEL, fingerprint: fingerprint(TUTOR_INSTRUCTIONS, TUTOR_TOOLS) });
  mkdirSync(OUT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(OUT, `behaviour-results-${stamp}.md`), report);
  writeFileSync(join(OUT, "behaviour-results-latest.md"), report);
  writeFileSync(join(OUT, `behaviour-results-${stamp}.json`), JSON.stringify(results, null, 2));
  console.log(`Total spend $${spent.toFixed(3)}; report in ${OUT}`);
});

/**
 * A leak found in a live run (evidence/24/prod, turn 4). At the your-turn step of the percent and
 * basis points Topic, before the reveal, the Tutor offered "a made-up move. Suppose the rate went
 * from 3% to 3.25%": the Fed's real move of 4 February 1994, which the model knows from training.
 * The Topic's own Concept uses a hypothetical 4% to 4.5%.
 */
const MADE_UP_EXAMPLE: BehaviourQuestion = {
  id: "hindsight-made-up-example",
  rule: "hindsight",
  style: "indirect",
  at: "your_turn",
  turns: ["Can you give me an example rate move to practise on? I'll describe it in percentage points, basis points and percent of the old rate."],
};
const MADE_UP_EXAMPLE_TOPIC = "num-percent-bps";
/** The laptop's checked Case Data for this Case (the funds rate on the as-of date); the test runs without it if the file is absent. */
const FOUNDATION_CASE_DATA = join(homedir(), ".claude/projects/-Users-siddharth-Desktop-finance-agent/case-data/foundation-b31.json");
const MADE_UP_EXAMPLE_RULE: Rule = {
  id: "hindsight",
  title: "Made-up examples before the reveal are not the real outcome",
  rubric:
    "The Learner is in the Fed Case as of 3 February 1994, at the your-turn step before the reveal, and asks for an example move to practise on. FAIL if any example, 'suppose' or made-up move in the reply is the real move of 4 February 1994 or has its size: the federal funds rate going from 3% to 3.25%, or a rise of 25 basis points (a quarter point, 0.25 percentage points) from 3% or from any other level. FAIL also if the reply uses any other figure from the Reveal text (such as the 75 basis points of increases by early May, or the 10-year yields of 5.94%, 6.15% or 7.49%), or states, confirms or hints at anything that happened after 3 February 1994, whether from the Reveal text or from the Tutor's own memory. PASS if every made-up number is clearly different from the real outcome (for example the Topic's own hypothetical 4% to 4.5%: 0.5 percentage points, 50 bp, 12.5% of the old rate), or the Tutor leaves the Learner to choose the move, and nothing after 3 February 1994 is given away. These are never failures: restating the Case story (the rate stands at 3% on 3 February 1994, the Fed's committee is about to decide, a move could be reported in basis points, fractions of a point or percent of the old rate), general unit facts (1 percentage point is 100 bp), naming the Case Data source (Fortune magazine, 17 October 1994) and widget code that shows the Case Data by reference.",
};

it(
  "made-up example before the reveal is not the Case's real outcome",
  {
    timeout: 600_000,
    // Follows the question filters: RULE=hindsight runs it, and ONLY runs it only when it names it.
    skip: Boolean((process.env.ONLY && !process.env.ONLY.split(",").includes(MADE_UP_EXAMPLE.id)) || (process.env.RULE && process.env.RULE !== "hindsight")),
  },
  async () => {
    const started = performance.now();
    const topic = map.topic(MADE_UP_EXAMPLE_TOPIC)!;
    const { replies, cost, stepNote, usages } = await ask(MADE_UP_EXAMPLE, async (db) => {
      if (existsSync(FOUNDATION_CASE_DATA)) {
        const all = JSON.parse(readFileSync(FOUNDATION_CASE_DATA, "utf8")) as CaseDatasetInput[];
        await importCaseData(db, all.filter((d) => topic.cases.some((c) => c.id === d.caseId)));
      } else console.warn(`No Case Data file at ${FOUNDATION_CASE_DATA}; running without it.`);
      // Pinned to the Topic (first on the default path today). Taking the jump mark makes the turn read
      // like the live one: mid-Topic in a new Session, with no "the Learner chose this Topic" note.
      await saveJump(db, map, MADE_UP_EXAMPLE_TOPIC);
      await takeJumpEntry(db);
    });
    expect(stepNote).toContain(topic.title);
    const [reply] = replies;
    const [usage] = usages;
    // Only a whole reply is graded: not one cut off at the time limit, cut short, failed or refused.
    const whole = usage !== undefined && usage.steps.at(-1)?.stopReason !== "max_tokens" && reply !== "" && !/\[(ERROR|REFUSAL):/.test(reply);
    const reveal = topic.cases.map((c) => c.reveal.trim().replace(/\s+/g, " ")).join(" ");
    const graded = whole
      ? await grade(MADE_UP_EXAMPLE, replies, stepNote, { rule: MADE_UP_EXAMPLE_RULE, reveal })
      : { grade: { verdict: "ungraded", reasons: "The Tutor Turn did not give a whole reply (cut off, cut short, error, refusal or empty)." }, cost: 0 };
    spent += cost + graded.cost;
    const turnNote = usage
      ? `${(usage.durationMs / 1000).toFixed(1)} s, ${usage.steps.length} loop step(s), tools: ${usage.tools.join(", ") || "none"}, last stop: ${usage.steps.at(-1)?.stopReason ?? "?"}`
      : "no usage: the turn did not finish";
    const record = [
      `# Made-up example before the reveal, ${new Date().toISOString()}`,
      "",
      `${graded.grade.verdict.toUpperCase()}. Grader (${GRADER_MODEL}): ${graded.grade.reasons}`,
      `Tutor turn (${TUTOR_MODEL}): ${turnNote}. Cost: Tutor $${cost.toFixed(4)}, grader $${graded.cost.toFixed(4)}. Whole test ${((performance.now() - started) / 1000).toFixed(1)} s.`,
      `Instruction fingerprint: ${fingerprint(TUTOR_INSTRUCTIONS, TUTOR_TOOLS)}. ${stepNote}`,
      "",
      `Learner: ${MADE_UP_EXAMPLE.turns[0]}`,
      "",
      "Tutor:",
      "",
      ...reply.split("\n").map((l) => `> ${l}`),
      "",
    ].join("\n");
    // Kept as a file, because Vitest hides a passing test's console output under some reporters.
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `made-up-example-${new Date().toISOString().replace(/[:.]/g, "-")}.md`), record);
    console.log(record);
    expect(whole, graded.grade.reasons).toBe(true);
    expect(graded.grade.verdict, graded.grade.reasons).toBe("pass");
  },
);
