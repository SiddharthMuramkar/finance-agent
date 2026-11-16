import { desc, eq } from "drizzle-orm";
import { loadCourseMap, type CourseMap } from "@/course/map";
import { ownCases } from "@/db/schema";
import type { Db } from "@/db/types";
import type { OwnCaseEstimate, OwnCaseInputs } from "@/finance/own-case";
import { assignmentOpen } from "@/learner/own-cases";
import { rangeCheck, type RangeFlag } from "@/markets/range-check";
import type { Effort, Message, ModelClient } from "./model";
import { CAP_MESSAGES, checkQuota } from "./quota";
import { checkReply, correctionText, fixReply, type ReplyCheckContext, type ReplyProblem } from "./reply-checks";
import { openLog, readSettings, sessionForTurn } from "./session-log";
import { textOf } from "./transcript";
import { BUSY_MESSAGE, startTurn, updateTurn } from "./turn-status";
import { saveStepUsage, stepUsage } from "./usage";

/**
 * The AI Tutor in the Assignment (spec #68, ticket #110). The Assignment is a page (/assignment), not a Topic on the
 * Course Map, so its Tutor Turn is this small one: no tools, no Widgets, one reply. It runs in the Learner's one
 * Assignment Session (topic id `assignment`), is refused past a daily Spend cap like every Tutor Turn (quota.ts), and
 * takes the Learner's one-turn lock, so its turn row counts toward the turns cap. The Tutor is told the latest Own Case's
 * figures and each input the range check flagged, and asked to name each flagged input and ask what Story it assumes.
 * Its reply passes the reply checks with the Assignment's two rules (V9: no verdict or advice words; V10: name a flagged
 * input), with one retry, then code's own line.
 */

/** The topic id of the Learner's Assignment Session: not a Course Map Topic, so the navigator never moves to it. */
export const ASSIGNMENT_SESSION_TOPIC = "assignment";

/** What the Tutor is told of the Learner's Own Case: its one-page note, and the range check's flags. Null: none saved yet. */
export type AssignmentFacts = { note: string; flags: Pick<RangeFlag, "name" | "sentence">[] } | null;

/** The prefix of the context note code adds after the Learner's message. */
export const ASSIGNMENT_CONTEXT_PREFIX = "[Assignment context, from code]";

const MAX_TOKENS = 4000;

/** The context note: the Own Case as the Notebook shows it, each flag's sentence, and how to answer. */
export function assignmentContext(facts: AssignmentFacts): string {
  if (!facts) return [ASSIGNMENT_CONTEXT_PREFIX, "The Learner has no Own Case saved yet. Help them pick a company and find its annual report's figures."].join("\n");
  const flags = facts.flags.length
    ? ["Inputs far from the industry's usual range (the range check):", ...facts.flags.map((f) => `- ${f.sentence}`), "Name each flagged input in your reply and ask what story it assumes."]
    : ["No input is far from the industry's usual range. Ask what story the Estimate assumes."];
  return [
    ASSIGNMENT_CONTEXT_PREFIX,
    "The Learner's Own Case:",
    facts.note,
    ...flags,
    "Never call a value right or wrong, cheap or dear, undervalued or overvalued, and never say buy or sell: the Own Case is the Learner's story.",
  ].join("\n");
}

/** Code's own reply when the retry breaks a check too: it names the first flagged input and asks what story it assumes. */
export function assignmentFallback(facts: AssignmentFacts): string {
  const flag = facts?.flags[0];
  if (flag) return `${flag.sentence}\nWhat story about the company does that ${flag.name} assume?`;
  return "Your figures are in.\nWhat story about the company does your Estimate assume?";
}

/** The Learner's latest Own Case and its range-check flags, or null when they have saved none. */
export async function assignmentFacts(db: Db, learnerId: number): Promise<AssignmentFacts> {
  const [row] = await db.select().from(ownCases).where(eq(ownCases.learnerId, learnerId)).orderBy(desc(ownCases.updatedAt), desc(ownCases.id)).limit(1);
  if (!row) return null;
  const inputs = row.inputs as OwnCaseInputs;
  const estimate = row.estimate as OwnCaseEstimate;
  const flags = rangeCheck(
    { marginPercent: (inputs.operatingProfit / inputs.sales) * 100, salesToCapital: estimate.salesToCapital, costOfCapitalPercent: estimate.costOfCapitalPercent },
    { market: inputs.market, industry: inputs.industry },
  );
  return { note: row.note ?? `${row.company}, report of ${row.reportDate}.`, flags: flags.map(({ name, sentence }) => ({ name, sentence })) };
}

/** The reply checks' context in the Assignment: rupees, no quiz, and the flagged inputs' names. */
function checkContext(facts: AssignmentFacts): ReplyCheckContext {
  return { step: "none", exampleCurrency: "INR", caseCurrencies: ["INR"], openItems: [], internalWords: [ASSIGNMENT_SESSION_TOPIC], assignment: { flagged: facts?.flags.map((f) => f.name) ?? [] } };
}

export type AssignmentTurnDeps = { db: Db; client: ModelClient; learnerId: number; admin?: boolean; map?: CourseMap; now?: () => Date };

/** The turn's answer: the reply shown (with the rules its draft broke, and whether code's line stands in), or a refusal. */
export type AssignmentTurnResult =
  | { ok: true; reply: string; sessionId: number; failed: ReplyProblem["rule"][]; fallback: boolean }
  | { ok: false; status: 403 | 409 | 429; error: string };

/** Runs one Tutor Turn in the Assignment for the Learner's message. */
export async function runAssignmentTurn(deps: AssignmentTurnDeps, message: string): Promise<AssignmentTurnResult> {
  const { db, learnerId } = deps;
  const now = deps.now ?? (() => new Date());
  if (!(await assignmentOpen(db, deps.map ?? loadCourseMap(), learnerId))) return { ok: false, status: 403, error: "The Assignment opens once you pass the Spine." };
  // The daily Spend caps, as for every Tutor Turn: a refused turn writes no row.
  const { caps } = await readSettings(db);
  const capHit = await checkQuota(db, learnerId, now(), { admin: deps.admin, caps });
  if (capHit) return { ok: false, status: 429, error: CAP_MESSAGES[capHit] };
  const turn = await startTurn(db, now(), message, learnerId);
  if (!turn) return { ok: false, status: 409, error: BUSY_MESSAGE };

  const session = await sessionForTurn(db, now(), learnerId, ASSIGNMENT_SESSION_TOPIC);
  const log = await openLog(db, session.id, now);
  const turnSeq = log.nextSeq;
  await updateTurn(db, turn.id, { sessionId: session.id, turnSeq });
  const facts = await assignmentFacts(db, learnerId);
  await log.append({ role: "user", content: message });
  await log.append({ role: "user", content: assignmentContext(facts) });

  const ctx = checkContext(facts);
  let step = 0;
  let stopReason: string | null = null;
  const ask = async (extra: Message[]): Promise<string> => {
    step += 1;
    const started = performance.now();
    try {
      const result = await deps.client.step({ model: session.model, effort: session.effort as Effort, instructions: session.instructions, tools: [], messages: [...log.messages, ...extra], maxOutputTokens: MAX_TOKENS }).final();
      stopReason = result.stopReason;
      await saveStepUsage(db, session.id, turnSeq, session.model, stepUsage(session.model, step, result.usage, [], Math.round(performance.now() - started), result.stopReason), now());
      return textOf(result.content);
    } catch {
      // A failed model call counts as an unpriced step and the turn shows code's line: the turn still ends finished.
      await saveStepUsage(db, session.id, turnSeq, session.model, stepUsage(session.model, step, undefined, [], Math.round(performance.now() - started), "error"), now());
      return "";
    }
  };

  const draft = fixReply({ text: await ask([]), widgets: [] });
  const problems = draft.text ? checkReply(draft, ctx) : [{ rule: "V10" as const, message: "No reply." }];
  let reply = draft.text;
  let fallback = false;
  if (problems.length) {
    const retry = fixReply({
      text: await ask([
        { role: "assistant", content: [{ type: "text", text: draft.text }] },
        { role: "user", content: correctionText(problems, draft, ctx) },
      ]),
      widgets: [],
    });
    const retryProblems = retry.text ? checkReply(retry, ctx) : problems;
    fallback = retryProblems.length > 0;
    reply = fallback ? assignmentFallback(facts) : retry.text;
  }
  await log.append({ role: "assistant", content: [{ type: "text", text: reply }] });
  await updateTurn(db, turn.id, { status: "finished", stopReason, finishedAt: now() });
  return { ok: true, reply, sessionId: session.id, failed: problems.map((p) => p.rule), fallback };
}
