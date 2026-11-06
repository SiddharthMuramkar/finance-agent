/**
 * The Delight eval's judges and bars (spec Appendix D.2 and D.3, ticket E4b). Pure code the runner
 * (scripts/widget-eval.mjs --set delight --judge) and scripts/delight-judge.mjs share: the shape each judge must
 * return, a strict parser for it, the prompts the judges are given, the spend cap and the G2 bars. Nothing here
 * calls a model or a database, so it is tested without either.
 */
import { parse } from "yaml";
import { costUsd } from "@/tutor/pricing";

export const JUDGE_MODEL = "claude-opus-5-5";
export const DEFAULT_DELIGHT_BUDGET_USD = 13;
export const PERSONA = "20, wealthy, bright, bad at maths and bored by it, wants to sound fluent about money. Writes lower-case, short and casual.";

export type DelightPrompt = { id: string; topic: string; step: string; message: string };

export type PersonaJudgement = { id: string; fun: number; clarity: number; lingo: { score: number; terms: string[] }; exam: boolean; back: boolean; best_line: string; worst_line: string; why: string };
export type SumWhere = "reply" | "widget" | "choice" | "input";
export type MathJudgement = { id: string; sums: { where: SumWhere; quote: string; why: string }[]; count: number };
export type WidgetKind = "story" | "lingo" | "timeline" | "chart_only" | "other";
export type FitJudgement = { id: string; match: number; lively: number; emoji: { meaningful: string[]; decorative: string[] }; alone: boolean; kind: WidgetKind; source: string; why: string };
export type Verdict = "supported" | "unsupported" | "wrong" | "after_as_of";
export type HistorianJudgement = { id: string; claims: { claim: string; verdict: Verdict; source: string }[]; wrong: number; after_as_of: number; unsupported: number };

export const JUDGES = ["persona", "math", "fit", "historian"] as const;
export type JudgeName = (typeof JUDGES)[number];
export type JudgementOf = { persona: PersonaJudgement; math: MathJudgement; fit: FitJudgement; historian: HistorianJudgement };

type Obj = Record<string, unknown>;
const fail = (judge: string, why: string): never => {
  throw new Error(`The ${judge} judge's JSON is not valid: ${why}.`);
};
const obj = (judge: string, v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : fail(judge, "it is not an object"));
const str = (judge: string, o: Obj, k: string): string => (typeof o[k] === "string" ? (o[k] as string) : fail(judge, `"${k}" must be a string`));
const bool = (judge: string, o: Obj, k: string): boolean => (typeof o[k] === "boolean" ? (o[k] as boolean) : fail(judge, `"${k}" must be true or false`));
const int = (judge: string, o: Obj, k: string, min: number, max: number): number => {
  const v = o[k];
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fail(judge, `"${k}" must be a whole number from ${min} to ${max}`);
};
const strings = (judge: string, o: Obj, k: string): string[] => (Array.isArray(o[k]) && (o[k] as unknown[]).every((x) => typeof x === "string") ? (o[k] as string[]) : fail(judge, `"${k}" must be a list of strings`));
const list = (judge: string, o: Obj, k: string): unknown[] => (Array.isArray(o[k]) ? (o[k] as unknown[]) : fail(judge, `"${k}" must be a list`));
const oneOf = <T extends string>(judge: string, o: Obj, k: string, allowed: readonly T[]): T => (allowed.includes(o[k] as T) ? (o[k] as T) : fail(judge, `"${k}" must be one of ${allowed.join(" | ")}`));

/** Reads a judge's reply text as its JSON: the whole text, or the one ```json fence it sits in. Throws on anything else. */
export function parseJudge<J extends JudgeName>(judge: J, text: string): JudgementOf[J] {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  let raw: unknown;
  try {
    raw = JSON.parse(fenced ? fenced[1] : trimmed);
  } catch {
    return fail(judge, "it is not JSON");
  }
  const o = obj(judge, raw);
  const id = str(judge, o, "id");
  if (judge === "persona") {
    const lingo = obj(judge, o.lingo);
    return {
      id, fun: int(judge, o, "fun", 1, 5), clarity: int(judge, o, "clarity", 1, 5),
      lingo: { score: int(judge, lingo, "score", 1, 5), terms: strings(judge, lingo, "terms") },
      exam: bool(judge, o, "exam"), back: bool(judge, o, "back"),
      best_line: str(judge, o, "best_line"), worst_line: str(judge, o, "worst_line"), why: str(judge, o, "why"),
    } as JudgementOf[J];
  }
  if (judge === "math") {
    const sums = list(judge, o, "sums").map((s) => {
      const so = obj(judge, s);
      return { where: oneOf(judge, so, "where", ["reply", "widget", "choice", "input"] as const), quote: str(judge, so, "quote"), why: str(judge, so, "why") };
    });
    const count = int(judge, o, "count", 0, 1000);
    if (count !== sums.length) fail(judge, `"count" is ${count} but ${sums.length} sums are listed`);
    return { id, sums, count } as JudgementOf[J];
  }
  if (judge === "fit") {
    const emoji = obj(judge, o.emoji);
    return {
      id, match: int(judge, o, "match", 1, 5), lively: int(judge, o, "lively", 1, 5),
      emoji: { meaningful: strings(judge, emoji, "meaningful"), decorative: strings(judge, emoji, "decorative") },
      alone: bool(judge, o, "alone"), kind: oneOf(judge, o, "kind", ["story", "lingo", "timeline", "chart_only", "other"] as const),
      source: str(judge, o, "source"), why: str(judge, o, "why"),
    } as JudgementOf[J];
  }
  const claims = list(judge, o, "claims").map((c) => {
    const co = obj(judge, c);
    return { claim: str(judge, co, "claim"), verdict: oneOf(judge, co, "verdict", ["supported", "unsupported", "wrong", "after_as_of"] as const), source: str(judge, co, "source") };
  });
  // Like Math police's count, each Historian count must match the claims it lists, so a claim marked after_as_of or
  // wrong can never hide behind a 0 and skip the also-reported list (code, not the model, decides).
  const counts = { wrong: int(judge, o, "wrong", 0, 1000), after_as_of: int(judge, o, "after_as_of", 0, 1000), unsupported: int(judge, o, "unsupported", 0, 1000) };
  for (const k of ["wrong", "after_as_of", "unsupported"] as const) {
    const listed = claims.filter((c) => c.verdict === k).length;
    if (counts[k] !== listed) fail(judge, `"${k}" is ${counts[k]} but ${listed} claims are marked ${k}`);
  }
  return { id, claims, ...counts } as JudgementOf[J];
}

const ONLY_JSON = "Return only the JSON object shown, with no other text.";

/** The instructions each judge gets (Appendix D.2), as the system prompt. */
export const JUDGE_SYSTEM: Record<JudgeName, string> = {
  persona: `You are the Learner described here: ${PERSONA} Read the reply and look at the picture as if they just appeared on your laptop. Score each question.
fun (1-5): How much did you enjoy this? 1 = a textbook or a test; I'd close the tab. 2 = dry but short. 3 = fine, with one nice touch. 4 = a scene or picture I'll remember; I smiled once. 5 = I'd screenshot it for a friend.
clarity (1-5): Could you say back what it means? 1 = no. 3 = the gist, but one word lost me. 5 = I could explain it in one line to a friend.
lingo (score 1-5, terms): Which finance words did you learn, and could you use one? 1 = none explained. 3 = explained, but not how pros say it. 5 = plain meaning, plus how pros say it, plus seen in the story.
exam (true or false): Did it feel like an exam or homework?
back (true or false): Would you open the app again tomorrow?
${ONLY_JSON} Shape: {"id":"D01","fun":4,"clarity":5,"lingo":{"score":4,"terms":["basis point"]},"exam":false,"back":true,"best_line":"...","worst_line":"...","why":"at most 40 words"}`,
  math: `You are Math police. Question: did the Tutor, a Widget or a Choice ask the Learner to compute anything: a sum, a conversion to type, a number to work out?
Allowed: numbers given as facts; choice labels that restate a number in a unit the Topic teaches as lingo ("25 bps"); sums the Tutor says as facts ("1 point times 100 is 100 bp").
Counts: any ask, question, Widget prompt or Choice that needs arithmetic to answer; any typed-number input on screen.
List each one; do not score. "where" is one of reply | widget | choice | input. "count" equals the number of items listed.
${ONLY_JSON} Shape: {"id":"D05","sums":[{"where":"reply","quote":"...","why":"asks for the bp of a 0.4-point move"}],"count":1}`,
  fit: `You judge how well a Widget fits the reply it came with. Score:
match (1-5): Does the Widget show the reply's one idea? 1 = unrelated. 3 = same Topic, different idea. 5 = the same idea, and it adds something the words do not.
lively (1-5): Does it feel alive? 1 = a bare chart or form. 3 = clean but static. 5 = characters, motion or a story moment I want to tap.
emoji: Are the emoji meaningful (each one stands for a person, object or idea in the story) or decorative? List each decorative one.
alone (true or false): Would it make sense without the reply?
kind: one of story | lingo | timeline | chart_only | other. chart_only = its parts are only Chart, Slider, Stat or Waterfall.
source: the Widget source you were told (copy it).
${ONLY_JSON} Shape: {"id":"D03","match":5,"lively":4,"emoji":{"meaningful":["money-bag","bank"],"decorative":[]},"alone":true,"kind":"lingo","source":"lingo","why":"at most 30 words"}`,
  historian: `You are the Historian. List every factual claim in the reply, the Widget and the Choices: names, dates, figures and events. Judge each against the Case's sources, asOf and outcome (given below) and the step. Before the reveal, anything after asOf, or any hint at the outcome, is after_as_of. verdict is one of supported | unsupported | wrong | after_as_of. wrong, after_as_of and unsupported are the counts of those verdicts.
${ONLY_JSON} Shape: {"id":"D11","claims":[{"claim":"LTCM was founded in 1994","verdict":"supported","source":"<url>"}],"wrong":0,"after_as_of":0,"unsupported":0}`,
};

/** One prompt's evidence, as the runner collects it. */
export type DelightEvidence = {
  prompt: DelightPrompt;
  topicTitle: string;
  reply: string;
  choices: { label: string; says?: string; emoji?: string }[] | null;
  widgetCode: string | null;
  widgetSource: string | null;
  /** The Case's sources, asOf and outcome, for the Historian. */
  caseText?: string;
};

/** The user message every judge gets for one prompt (the screenshot travels beside it, not in it). */
export function judgeInput(judge: JudgeName, e: DelightEvidence): string {
  const parts = [
    `id: ${e.prompt.id}`,
    `Learner: ${PERSONA}`,
    `Topic: ${e.topicTitle} (${e.prompt.topic}); step: ${e.prompt.step}`,
    `Learner's message: ${e.prompt.message}`,
    `Tutor's reply:\n${e.reply || "(no reply)"}`,
    `Choices under the reply: ${e.choices ? JSON.stringify(e.choices.map((c) => c.label)) : "none"}`,
    `Widget source: ${e.widgetSource ?? "none"}`,
    `Widget program:\n${e.widgetCode ?? "(no Widget)"}`,
  ];
  if (judge === "historian") parts.push(`Case:\n${e.caseText ?? "(not available)"}`);
  return parts.join("\n\n");
}

/** The spend cap: DELIGHT_BUDGET_USD, or $13 a round. */
export function delightBudget(env: Record<string, string | undefined>): number {
  const raw = env.DELIGHT_BUDGET_USD;
  if (raw === undefined || raw.trim() === "") return DEFAULT_DELIGHT_BUDGET_USD;
  const cap = Number(raw);
  if (!Number.isFinite(cap) || cap <= 0) throw new Error(`DELIGHT_BUDGET_USD must be a positive number of dollars, not "${raw}".`);
  return cap;
}

/** What one judge call is expected to cost until a real one is known: a screenshot, the reply and the rubric on Opus. */
export const FIRST_JUDGE_CALL_USD = 0.15;
/**
 * What one prompt's Tutor turns are expected to cost until a real prompt is known. A prompt is two paid turns (the
 * Topic's opener and the reply to the prompt), each a few Opus steps; $0.60 is well above what one costs.
 */
export const FIRST_PROMPT_TURNS_USD = 0.6;

/**
 * The most output one Tutor step can write (src/tutor/turn.ts MAX_TOKENS; compose_widget's is 4 000, so this bounds it
 * too). The reserve for a try whose usage never settled prices each step at this.
 */
export const TUTOR_MAX_OUTPUT_TOKENS = 16_000;
/**
 * How far apart the two matching usage reads of a settled try are: longer than compose_widget's 12 s cap
 * (COMPOSE_LIMIT_MS), so a compose call in flight when its turn was cut off has saved its step by the second read.
 */
export const SETTLE_POLL_MS = 15_000;
/** How long an unfinished try's usage is watched before the reserve is charged instead. */
export const SETTLE_TIMEOUT_MS = 240_000;

export type TokenUse = { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number };
/** One model call the app recorded for a Tutor turn (a `usage` step row). */
export type TurnStep = TokenUse & { model: string };

function priceOf(model: string, usage: TokenUse): number {
  const cost = costUsd(model, { cacheReadTokens: 0, cacheWriteTokens: 0, ...usage });
  if (cost === null) throw new Error(`The model "${model}" has no price in src/tutor/pricing.ts, so its spend cannot be capped.`);
  return cost;
}

/**
 * Counts the round's spend, Tutor turns and judges together, against the one cap (spec D.3: "<= $13 a round, about 22
 * turns plus 80 judge calls"). `allows` says whether something of about `next` dollars still fits; `chargeTurns` adds
 * a prompt's turns and `chargeJudge` a judge call, each at its real token use; `nextPrompt` and `nextJudgeCall` are
 * the estimates the runner checks before starting either.
 */
export class Spend {
  spent = 0;
  /** The Tutor turns' part of `spent`, and the most one prompt's turns have cost. */
  readonly tutor = { usd: 0, prompts: 0, costliest: 0 };
  /** The judges' part of `spent`, and the calls that made it. */
  readonly judges = { usd: 0, calls: 0 };
  /**
   * Why the round's spend is no longer known, once a try's turns could not be charged (their usage read failed, or a
   * model has no price). From then on `allows` refuses everything, so no further paid turn or judge call starts.
   */
  uncounted: string | null = null;
  /**
   * The part of `spent` that is a reserve, not a read (E4b-C2): a try whose turn was still running when it ended and
   * whose usage never settled is charged what was read plus `turnCeiling()`, so `allows` still fails closed before the
   * cap. With any reserve the report's spend is a floor-with-reserve, not an exact total.
   */
  readonly reserve = { usd: 0, why: [] as string[] };
  /** The steps of the costliest prompt read so far (no reserve in it), which `turnCeiling` reprices at max output. */
  private costliestSteps: readonly TurnStep[] = [];
  private costliestRead = 0;
  constructor(readonly cap: number) {}
  allows(next: number): boolean {
    return this.uncounted === null && this.spent + next <= this.cap;
  }
  charge(model: string, usage: TokenUse): number {
    const cost = priceOf(model, usage);
    this.spent += cost;
    return cost;
  }
  /**
   * Charges one prompt's Tutor turns (every step the app recorded for them) and returns what they cost. A `reserve`
   * (with why) is added on top when the steps are only what was read before the try's usage stopped being watched.
   */
  chargeTurns(steps: readonly TurnStep[], reserve?: { usd: number; why: string }): number {
    const read = steps.reduce((sum, st) => sum + priceOf(st.model, st), 0);
    if (read > this.costliestRead) {
      this.costliestRead = read;
      this.costliestSteps = steps;
    }
    const cost = read + (reserve?.usd ?? 0);
    if (reserve) {
      this.reserve.usd += reserve.usd;
      this.reserve.why.push(reserve.why);
    }
    this.spent += cost;
    this.tutor.usd += cost;
    this.tutor.prompts += 1;
    this.tutor.costliest = Math.max(this.tutor.costliest, cost);
    return cost;
  }
  /** Charges one judge call and returns what it cost. */
  chargeJudge(model: string, usage: TokenUse): number {
    const cost = this.charge(model, usage);
    this.judges.usd += cost;
    this.judges.calls += 1;
    return cost;
  }
  /**
   * The reserve for one try whose usage never settled: the most expensive prompt's turns read so far with every step's
   * output raised to TUTOR_MAX_OUTPUT_TOKENS, and never less than FIRST_PROMPT_TURNS_USD.
   */
  turnCeiling(): number {
    const atMax = this.costliestSteps.reduce((sum, st) => sum + priceOf(st.model, { ...st, outputTokens: Math.max(st.outputTokens, TUTOR_MAX_OUTPUT_TOKENS) }), 0);
    return Math.max(FIRST_PROMPT_TURNS_USD, atMax);
  }
  /** What the next prompt's turns are expected to cost: the costliest prompt so far, or FIRST_PROMPT_TURNS_USD before one is known. */
  nextPrompt(): number {
    return this.tutor.costliest > 0 ? this.tutor.costliest : FIRST_PROMPT_TURNS_USD;
  }
  /** What the next judge call is expected to cost: the judges' own average so far (never the Tutor's), or FIRST_JUDGE_CALL_USD. */
  nextJudgeCall(): number {
    return this.judges.calls ? this.judges.usd / this.judges.calls : FIRST_JUDGE_CALL_USD;
  }
}

/** One try at a prompt. It sets `seen.learnerId` as soon as it knows the Learner it runs as, so a failed try is charged too. */
export type PromptTry<R> = (seen: { learnerId: number | null }) => Promise<R>;

/** A clock for the settle wait; the real one by default, a fake in tests. */
export type SettleClock = { now?: () => number; sleep?: (ms: number) => Promise<void>; pollMs?: number; timeoutMs?: number };

/**
 * Reads a Learner's usage until it settles (E4b-C2): two consecutive reads, `pollMs` apart, that match while no turn of
 * the Learner is running. `settled: false` (with the last read) when that does not happen within `timeoutMs`.
 */
export async function settleUsage(o: { learnerId: number; usageOf: (learnerId: number) => Promise<TurnStep[]>; openTurns: (learnerId: number) => Promise<number> } & SettleClock): Promise<{ steps: TurnStep[]; settled: boolean }> {
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollMs = o.pollMs ?? SETTLE_POLL_MS;
  const timeoutMs = o.timeoutMs ?? SETTLE_TIMEOUT_MS;
  const start = now();
  let previous: string | null = null;
  for (;;) {
    const open = await o.openTurns(o.learnerId);
    const steps = await o.usageOf(o.learnerId);
    const key = JSON.stringify(steps);
    if (open === 0 && key === previous) return { steps, settled: true };
    previous = open === 0 ? key : null;
    if (now() - start + pollMs > timeoutMs) return { steps, settled: false };
    await sleep(pollMs);
  }
}

/**
 * Runs one prompt under the round's cap, tried at most twice (only an infrastructure failure is retried; the caller's
 * try throws for that alone). Before each try it refuses to start when the prompt's turns would pass the cap
 * (`refused`, with the last error if a try failed first); after each try, a failed one too, it charges the steps the
 * app recorded for the Learner the try ran as. A try that threw, or whose row `finished` says did not finish (the
 * turn timed out), may leave a turn running on the server, so it is charged only once its usage settles
 * (settleUsage); if it never does, it is charged what was read plus `spend.turnCeiling()` as a reserve (E4b-C2). A
 * charge that fails (the usage read, or an unpriced model) keeps the try's outcome and sets `spend.uncounted`, which
 * refuses every later prompt and judge call. With no Spend (the built-in Widget eval) it runs uncapped and reads
 * nothing.
 */
export async function runUnderCap<R>(o: {
  spend: Spend | null;
  attempt: PromptTry<R>;
  usageOf: (learnerId: number) => Promise<TurnStep[]>;
  /** Whether a try's row ended with its turns finished; a row counts as finished when this is left out. */
  finished?: (row: R) => boolean;
  /** How many of the Learner's turns are still running; none when left out. */
  openTurns?: (learnerId: number) => Promise<number>;
  settle?: SettleClock;
  onRetry?: (error: unknown) => void;
}): Promise<{ row: R } | { error: unknown } | { refused: true; error?: unknown }> {
  let failed: { error: unknown } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (o.spend && !o.spend.allows(o.spend.nextPrompt())) return failed ? { refused: true, error: failed.error } : { refused: true };
    if (failed) o.onRetry?.(failed.error);
    const seen: { learnerId: number | null } = { learnerId: null };
    let done = false;
    try {
      const row = await o.attempt(seen);
      done = o.finished ? o.finished(row) : true;
      return { row };
    } catch (error) {
      failed = { error };
    } finally {
      if (o.spend && seen.learnerId !== null) {
        const learnerId = seen.learnerId;
        // A failed charge must not replace the try's row or error, nor escape to the runner (which would abort the
        // round with no report for the prompts already paid for, finding E4b-C1). The spend is then unknown, so the
        // Spend fails closed: nothing more starts, and the report says why.
        try {
          if (done) o.spend.chargeTurns(await o.usageOf(learnerId));
          else {
            const { steps, settled } = await settleUsage({ learnerId, usageOf: o.usageOf, openTurns: o.openTurns ?? (async () => 0), ...o.settle });
            const why = `the Tutor turns of Learner ${learnerId} were still running or still saving after ${(o.settle?.timeoutMs ?? SETTLE_TIMEOUT_MS) / 1000}s, so a reserve was charged for them`;
            o.spend.chargeTurns(steps, settled ? undefined : { usd: o.spend.turnCeiling(), why });
          }
        } catch (e) {
          o.spend.uncounted ??= `the Tutor turns of Learner ${learnerId} could not be charged: ${String((e as Error)?.message ?? e).split("\n")[0]}`;
        }
      }
    }
  }
  return failed!;
}

/**
 * The round's rows in plan order, exactly one per planned prompt (E4b-B1): a prompt with no row (the loop stopped
 * early) gets `missing(prompt)`, a failed row with its reason, so the bars' total is always every planned prompt and
 * an early stop can never read as a pass.
 */
export function everyPlanned<P extends { n: number }, Row extends { n: number }>(planned: readonly P[], rows: readonly Row[], missing: (prompt: P) => Row): Row[] {
  const byN = new Map(rows.map((r) => [r.n, r]));
  return planned.map((p) => byN.get(p.n) ?? missing(p));
}

/** Everything the bars read, one entry per prompt (a judge that failed twice is missing). */
export type PromptResult = {
  id: string;
  widgetSource: string | null;
  choicesCount: number | null;
  persona?: PersonaJudgement;
  math?: MathJudgement;
  fit?: FitJudgement;
  historian?: HistorianJudgement;
};

export type Bar = { name: string; target: string; actual: string; pass: boolean | null };

const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pctOf = (n: number, of: number) => `${Math.round((n / of) * 1000) / 10} %`;

/**
 * The Appendix D.3 bars over the prompts, each with its number. A judged bar never passes without every prompt's
 * judgement. `judgeRan` says whether --judge ran: without it the judged bars read "not judged" (pass null); with it, a
 * bar whose judge answered for no prompt at all (every call refused, or the cap ran out first) fails like a partial one.
 * It defaults to true, so a caller that forgets it fails closed.
 */
export function computeBars(results: PromptResult[], total = results.length, judgeRan = true): Bar[] {
  const widgets = results.filter((r) => r.widgetSource && r.widgetSource !== "none").length;
  const choices = results.filter((r) => r.choicesCount !== null && r.choicesCount >= 2 && r.choicesCount <= 3).length;
  const personas = results.map((r) => r.persona).filter((p): p is PersonaJudgement => !!p);
  const maths = results.map((r) => r.math).filter((p): p is MathJudgement => !!p);
  const fits = results.map((r) => r.fit).filter((p): p is FitJudgement => !!p);
  const fun = median(personas.map((p) => p.fun));
  const lingo = personas.filter((p) => p.lingo.score >= 4).length;
  const exam = personas.filter((p) => p.exam).length;
  const chartOnly = fits.filter((f) => f.kind === "chart_only").length;
  const sums = maths.reduce((s, m) => s + m.count, 0);
  const judged = (list: unknown[], pass: (n: number) => boolean, actual: string): Pick<Bar, "actual" | "pass"> => {
    if (!judgeRan) return { actual: "not judged", pass: null };
    if (list.length === 0) return { actual: `not judged (0 of ${total} judged)`, pass: false };
    if (list.length < total) return { actual: `${actual} (${list.length} of ${total} judged)`, pass: false };
    return { actual, pass: pass(list.length) };
  };
  return [
    { name: "A Widget with every reply", target: `${total} of ${total}`, actual: `${widgets} of ${total}`, pass: widgets === total },
    { name: "No sum asked", target: "0", ...judged(maths, () => sums === 0, String(sums)) },
    { name: "Choices on every reply", target: `${total} of ${total}`, actual: `${choices} of ${total}`, pass: choices === total },
    { name: "Fun (median)", target: ">= 4", ...judged(personas, () => fun !== null && fun >= 4, fun === null ? "-" : String(fun)) },
    { name: "Lingo learned", target: ">= 80 %", ...judged(personas, () => lingo / total >= 0.8, `${pctOf(lingo, total)} (${lingo} of ${total})`) },
    { name: "Felt like an exam", target: `false on ${total} of ${total}`, ...judged(personas, () => exam === 0, `true on ${exam}`) },
    { name: "No chart-only Widget", target: "0", ...judged(fits, () => chartOnly === 0, String(chartOnly)) },
  ];
}

/** The also-reported rows: each failure opens a needs-triage issue with the JSON. */
export function alsoReported(results: PromptResult[]): { name: string; ids: string[]; note: string }[] {
  const fits = results.map((r) => r.fit).filter((p): p is FitJudgement => !!p);
  const m = median(fits.map((f) => f.match));
  return [
    { name: "Historian wrong + after_as_of > 0", ids: results.filter((r) => r.historian && r.historian.wrong + r.historian.after_as_of > 0).map((r) => r.id), note: "each opens a needs-triage issue with the JSON" },
    { name: "Widget fit median match < 4", ids: m !== null && m < 4 ? results.map((r) => r.id) : [], note: `median match ${m ?? "-"}` },
  ];
}

/** A Topic's title and the Case text the Historian judges against (its title, asOf, outcome and sources in course/outline.yaml). */
export function caseOf(outlineText: string, topicId: string): { title: string; caseText: string } {
  const outline = parse(outlineText) as { topics?: { id: string; title?: string; cases?: { title?: string; asOf?: unknown; outcome?: string; sources?: string[] }[] }[] };
  const topic = outline.topics?.find((t) => t.id === topicId);
  if (!topic) throw new Error(`course/outline.yaml has no Topic "${topicId}".`);
  const c = topic.cases?.[0];
  const asOf = c?.asOf instanceof Date ? c.asOf.toISOString().slice(0, 10) : String(c?.asOf ?? "");
  const caseText = c ? [`Case: ${c.title ?? ""}`, `asOf: ${asOf}`, `outcome: ${c.outcome ?? ""}`, `sources:`, ...(c.sources ?? []).map((u) => `- ${u}`)].join("\n") : "(this Topic has no Case in the outline)";
  return { title: topic.title ?? topicId, caseText };
}
