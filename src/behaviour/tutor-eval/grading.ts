/**
 * Grading for the live Tutor tests (ticket #236). Pure: the reply as the Learner sees it, the pass conditions
 * code can tell, the grader's prompt and the parsing of its answers, and the verdict for one run. The reply
 * checks (V1 to V7, src/tutor/reply-checks.ts) run first; then the case's conditions; then the grader's five
 * rubric questions and the case's own questions. Any "no", and a grade that cannot be read, fail the run.
 */
import { blockedNumbersFrom, checkReply, countWords, fixReply, splitAsk, type ReplyCheckContext, type ReplyProblem, type ReplyWidget } from "@/tutor/reply-checks";
import type { Condition } from "./case";

/** The judge rubric, worded as TUTOR_SPEC section 7 words it. Each is a yes-or-no question. */
export const RUBRIC = [
  "Did it do what the learner asked first?",
  "Is there exactly one idea and one ask?",
  "Could a beginner follow every sentence?",
  "If this was a repeat miss, did it use a new method?",
  "Did it keep back an open quiz answer?",
] as const;

/** A Widget the reply showed, with the words the Learner reads on it (its title and labels). */
export type SeenWidget = ReplyWidget & { labels: string[] };

/** One reply as the Learner sees it: after `fixReply`, with what code fixed noted, its Widgets, its saved rule and any park offer. */
export type SeenReply = {
  text: string;
  raw: string;
  /** The style slips code fixed without a retry (headings, emoji or arrows, extra bold). */
  fixed: string[];
  widgets: SeenWidget[];
  savedRule: string | null;
  /** Code stored a park offer item in the turn. */
  parkOffer: boolean;
};

const BOLD = /\*\*(?=\S)[\s\S]*?\S\*\*|__(?=\S)[\s\S]*?\S__/g;

/** The reply as the Learner sees it, from the turn's raw text and what it showed and saved. */
export function seen(r: { text: string; widgets: SeenWidget[]; savedRule?: string | null; parkOffer?: boolean }): SeenReply {
  const draft = fixReply({ text: r.text, widgets: r.widgets, savedRule: r.savedRule ?? null });
  const fixed: string[] = [];
  if (/^[ \t]*#{1,6}[ \t]+/m.test(r.text)) fixed.push("headings");
  if (/[\p{Extended_Pictographic}➜➔➡→⇒]/u.test(r.text)) fixed.push("emoji or arrows");
  if ((r.text.match(BOLD)?.length ?? 0) > 1) fixed.push("extra bold");
  return { text: draft.text, raw: r.text, fixed, widgets: r.widgets, savedRule: r.savedRule ?? null, parkOffer: r.parkOffer ?? false };
}

const FENCE = /```[^\n]*\n[\s\S]*?(?:\n```|$)/g;
const prose = (text: string) => text.replace(FENCE, "\n");
const sentences = (text: string) =>
  prose(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));

export const REFUSAL_WORDS = ["can't", "cannot", "can not", "not while", "unable to", "won't"];

function numbersOfParams(params: unknown): string[] {
  return blockedNumbersFrom([{ prompt: JSON.stringify(params ?? {}), choices: [] }]);
}

/** Every case condition the reply fails, each as a readable reason. */
export function codedFailures(conditions: Condition[], reply: SeenReply, ctx: ReplyCheckContext): string[] {
  const out: string[] = [];
  const { message, ask } = splitAsk(reply.text);
  for (const c of conditions) {
    switch (c.kind) {
      case "maxWords": {
        const n = countWords(message) + (ask ? countWords(ask) : 0);
        if (n > c.value) out.push(`The reply was ${n} words; the limit is ${c.value}.`);
        break;
      }
      case "maxLines": {
        const n = prose(reply.text)
          .split("\n")
          .filter((l) => l.trim()).length;
        if (n > c.value) out.push(`The reply was ${n} lines; the limit is ${c.value}.`);
        break;
      }
      case "oneAsk": {
        if (!ask) out.push("The reply ends with no ask: its last line neither asks nor tells the Learner what to do.");
        else if (prose(message).includes("?")) out.push(`The reply asks more than one thing: a question in the message as well as the ask ("${ask}").`);
        break;
      }
      case "noRefusal": {
        const words = c.words ?? REFUSAL_WORDS;
        const said = reply.text.replace(/’/g, "'").toLowerCase();
        const hit = words.filter((w) => said.includes(w.toLowerCase()));
        if (hit.length) out.push(`The reply refuses (${hit.map((w) => `"${w}"`).join(", ")}).`);
        break;
      }
      case "widget": {
        if (!reply.widgets.length) {
          out.push("No Widget was shown.");
          break;
        }
        const w = reply.widgets[0];
        const mode = (w.params as { mode?: unknown } | undefined)?.mode;
        if (c.mode && mode !== c.mode) out.push(`The Widget "${w.id}" is not in ${c.mode} mode (${mode === undefined ? "no mode" : `mode ${String(mode)}`}).`);
        const blocked = new Set(blockedNumbersFrom(ctx.openItems));
        const used = [...new Set(reply.widgets.flatMap((x) => numbersOfParams(x.params)).filter((n) => blocked.has(n)))];
        if (used.length) out.push(`The Widget uses ${used.join(", ")}, from the open quiz.`);
        break;
      }
      case "savedRule": {
        if (!reply.savedRule) out.push("No rule was saved to the Learner's notes.");
        else {
          const missing = c.contains.filter((w) => !reply.savedRule!.toLowerCase().includes(w.toLowerCase()));
          if (missing.length) out.push(`The saved rule ("${reply.savedRule}") is not the Learner's wording: it lacks ${missing.map((w) => `"${w}"`).join(", ")}.`);
        }
        break;
      }
      case "ackMaxWords": {
        const first = sentences(message)[0] ?? "";
        const n = countWords(first);
        if (n > c.value) out.push(`The acknowledgement ("${first}") was ${n} words; the limit is ${c.value}.`);
        break;
      }
      case "maxMessageSentences": {
        const n = sentences(message).length;
        if (n > c.value) out.push(`The message before the ask was ${n} sentences; the limit is ${c.value}.`);
        break;
      }
      case "parkOffer": {
        const named = /\bpark/i.test(reply.text) && /\bone more\b/i.test(reply.text);
        if (!reply.parkOffer && !named) out.push('No park offer: neither a park offer item nor both choices ("Park it, review tomorrow" and "One more short try") in the reply.');
        break;
      }
      case "plainStyle": {
        const style = checkReply({ text: reply.text, widgets: [], savedRule: reply.savedRule }, { ...ctx, openItems: [] }).filter((p) => p.rule === "V3" || p.rule === "V6");
        out.push(...style.map((p) => `Style: ${p.message}`));
        break;
      }
      case "noDollar": {
        if (prose(reply.text).includes("$")) out.push('The reply text has a "$".');
        const labelled = reply.widgets.filter((w) => w.labels.some((l) => l.includes("$")));
        if (labelled.length) out.push(`The Widget ${labelled.map((w) => `"${w.id}"`).join(", ")} has a "$" in its labels.`);
        break;
      }
    }
  }
  return out;
}

export const GRADER_SYSTEM =
  'You grade one reply from an AI finance Tutor to a beginner, strictly and fairly. Answer every numbered question yes or no about the Tutor\'s reply only. Answer yes when a question does not apply (for example a repeat-miss question when there was no repeat miss, or a quiz question when no quiz is open). Respond with one JSON object and nothing else: {"answers":[{"n":1,"answer":"yes","why":"a few words quoting the reply"}, ...]}, one entry for every question.';

function describeWidget(w: SeenWidget): string {
  const params = w.params ? ` set to ${JSON.stringify(w.params)}` : "";
  const labels = w.labels.length ? `; it reads: ${w.labels.join(" | ").slice(0, 600)}` : "";
  return `${w.kind === "recipe" ? "Widget recipe" : w.kind === "written" ? "Written-ahead Widget" : "Widget"} "${w.id}"${params}${labels}`;
}

/** The grader's message: where the Learner is, what they said, the reply as they saw it, and the questions. */
export function buildGraderPrompt(args: { stateNote: string; message: string; reply: SeenReply; extra: string[] }): string {
  const questions = [...RUBRIC, ...args.extra];
  return [
    "The Tutor teaches a beginner with no finance background, one idea at a time. A term the course has not taught yet should be explained where it first appears.",
    "",
    `Where the Learner is: ${args.stateNote}`,
    "",
    `Learner: ${args.message}`,
    "",
    "Tutor's reply, as the Learner sees it:",
    args.reply.text,
    "",
    args.reply.widgets.length ? `Shown with the reply: ${args.reply.widgets.map(describeWidget).join("; ")}.` : "No Widget was shown with the reply.",
    args.reply.savedRule ? `Saved to the Learner's notes: "${args.reply.savedRule}".` : "Nothing was saved to the Learner's notes.",
    "",
    "Questions:",
    ...questions.map((q, i) => `${i + 1}. ${q}`),
  ].join("\n");
}

export type GradeAnswer = { n: number; question?: string; yes: boolean; why: string };
export type Grade = { ok: true; answers: GradeAnswer[] } | { ok: false; reason: string; text: string };

/** The grader's answers to `count` questions, or not a grade when any is missing, repeated or not yes or no. */
export function parseGrade(text: string, count: number): Grade {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return { ok: false, reason: "no JSON object in the grader's reply", text };
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { ok: false, reason: "the grader's JSON does not parse", text };
  }
  const list = (raw as { answers?: unknown })?.answers;
  if (!Array.isArray(list)) return { ok: false, reason: 'no "answers" list', text };
  const answers: GradeAnswer[] = [];
  for (let n = 1; n <= count; n++) {
    const found = list.filter((a) => (a as { n?: unknown })?.n === n);
    if (found.length !== 1) return { ok: false, reason: `question ${n} has ${found.length} answers`, text };
    const a = found[0] as { answer?: unknown; why?: unknown };
    const answer = typeof a.answer === "string" ? a.answer.trim().toLowerCase() : "";
    if (answer !== "yes" && answer !== "no") return { ok: false, reason: `question ${n} is answered "${String(a.answer)}", not yes or no`, text };
    answers.push({ n, yes: answer === "yes", why: typeof a.why === "string" ? a.why : "" });
  }
  return { ok: true, answers };
}

/** One run's verdict: it passes only when nothing failed. Reasons list every failure in full. */
export function judgeRun(args: { problems: ReplyProblem[]; coded: string[]; grade: Grade | null; questions: readonly string[] }): { passed: boolean; reasons: string[] } {
  const reasons = [...args.problems.map((p) => `${p.rule}: ${p.message}`), ...args.coded];
  if (!args.grade) reasons.push("Not graded.");
  else if (!args.grade.ok) reasons.push(`The grade could not be read (${args.grade.reason}), so the run is not passed.`);
  else for (const a of args.grade.answers) if (!a.yes) reasons.push(`Grader: no to "${args.questions[a.n - 1] ?? `question ${a.n}`}"${a.why ? ` (${a.why})` : ""}`);
  return { passed: reasons.length === 0, reasons };
}
