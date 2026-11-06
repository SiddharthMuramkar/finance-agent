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
  return { id, claims, wrong: int(judge, o, "wrong", 0, 1000), after_as_of: int(judge, o, "after_as_of", 0, 1000), unsupported: int(judge, o, "unsupported", 0, 1000) } as JudgementOf[J];
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

/** Counts the round's spend against the cap. `charge` adds a call's real cost; `allows` says whether another call of about `next` dollars still fits. */
export class Spend {
  spent = 0;
  constructor(readonly cap: number) {}
  allows(next: number): boolean {
    return this.spent + next <= this.cap;
  }
  charge(model: string, usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }): number {
    const cost = costUsd(model, { cacheReadTokens: 0, cacheWriteTokens: 0, ...usage });
    if (cost === null) throw new Error(`The model "${model}" has no price in src/tutor/pricing.ts, so its spend cannot be capped.`);
    this.spent += cost;
    return cost;
  }
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

/** The Appendix D.3 bars over the prompts, each with its number. A bar with no data says so (pass null), never passes. */
export function computeBars(results: PromptResult[], total = results.length): Bar[] {
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
    if (list.length === 0) return { actual: "not judged", pass: null };
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
