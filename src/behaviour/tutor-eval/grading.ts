/**
 * Grading for the live Tutor tests (ticket #236). Pure: the reply as the Learner sees it, the pass conditions
 * code can tell, the grader's prompt and the parsing of its answers, and the verdict for one run. The reply
 * checks (V1 to V7, src/tutor/reply-checks.ts) run first; then the case's conditions; then the grader's five
 * rubric questions and the case's own questions. Any "no", and a grade that cannot be read, fail the run.
 */
import { asksIn, blockedNumbersFrom, checkReply, countWords, fixReply, splitAsk, sumAsked, type ReplyCheckContext, type ReplyProblem, type ReplyWidget } from "@/tutor/reply-checks";
import type { ReplyChoicesData } from "@/tutor/session-item-kinds";
import type { Condition } from "./case";

/** The Choices code stored under a reply (D3a). */
export type SeenChoice = ReplyChoicesData["choices"][number];

/** The judge rubric, worded as TUTOR_SPEC section 7 words it. Each is a yes-or-no question. */
export const RUBRIC = [
  "Did it do what the learner asked first?",
  "Is there exactly one idea and one ask?",
  "Could a beginner follow every sentence?",
  "If this was a repeat miss, did it use a new method?",
  "Did it keep back an open quiz answer?",
] as const;

/**
 * A Widget the reply showed, with the words the Learner reads on it (its title and labels). `byCode` is set for a Widget
 * code stored itself (the Concept card's Widget, the reveal Widget, a re-teach's practice Widget): it is on screen with
 * the reply, but the Tutor did not show it, so the conditions about what the Tutor showed leave it out.
 */
export type SeenWidget = ReplyWidget & { labels: string[]; byCode?: boolean };

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
  /** What code showed below the reply in the same turn (the next Quick try), as the Learner reads it. */
  alsoShown: string[];
  /** The Choices code stored under the reply in the same turn (a reply_choices item), or none. */
  choices: SeenChoice[];
};

const BOLD = /\*\*(?=\S)[\s\S]*?\S\*\*|__(?=\S)[\s\S]*?\S__/g;

/** The reply as the Learner sees it, from the turn's raw text and what it showed and saved. */
export function seen(r: { text: string; widgets: SeenWidget[]; savedRule?: string | null; parkOffer?: boolean; alsoShown?: string[]; choices?: SeenChoice[] }): SeenReply {
  const draft = fixReply({ text: r.text, widgets: r.widgets, savedRule: r.savedRule ?? null });
  const fixed: string[] = [];
  if (/^[ \t]*#{1,6}[ \t]+/m.test(r.text)) fixed.push("headings");
  if (/[\p{Extended_Pictographic}➜➔➡→⇒]/u.test(r.text)) fixed.push("emoji or arrows");
  if ((r.text.match(BOLD)?.length ?? 0) > 1) fixed.push("extra bold");
  return { text: draft.text, raw: r.text, fixed, widgets: r.widgets, savedRule: r.savedRule ?? null, parkOffer: r.parkOffer ?? false, alsoShown: r.alsoShown ?? [], choices: r.choices ?? [] };
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

/**
 * The mode a recipe Widget was set to. A recipe keeps its inputs under `params.inputs` (rate_move: `inputs.mode`), so
 * that is read first; a flat `params.mode` is read as well. Undefined when the Widget has no mode (a written-ahead one).
 */
export function modeOf(w: ReplyWidget): unknown {
  const params = w.params as { inputs?: { mode?: unknown }; mode?: unknown } | undefined;
  return params?.inputs?.mode ?? params?.mode;
}

/**
 * Indirect sum asks, which V8's reading misses (run 16, critics MP-1, MP-2, MP-4): a sum worked on other numbers, then
 * "Now do the same steps on the Quick try's numbers", "Work it out", "Your turn to calculate". Each is read only in a
 * question, an instruction or the ask (`asksIn`), so "Traders do the same thing every morning." stays a statement.
 */
const INDIRECT_SUM_ASKS: RegExp[] = [
  /\b(?:do|try|repeat|redo|run|apply|use|follow)\s+(?:the\s+|that\s+|those\s+|this\s+)?same\s+(?:steps?|moves?|maths?|sums?|method|working|calculations?|rule)\b/i,
  /\b(?:do|try)\s+(?:the\s+)?same\b[^.?!]{0,40}?\b(?:on|with|for)\b[^.?!]{0,40}?\bnumbers\b/i,
  /\b(?:do|try|apply|use|run|repeat)\b[^.?!]{0,60}?\b(?:on|to|with)\s+(?:the\s+)?(?:quick try['’]s|try['’]s|card['’]s|widget['’]s|its|these|those|their|your|other|new)\s+(?:own\s+)?numbers\b/i,
  /\bwork\s+(?:it|this|that|them|those|these)\s+out\b|^\W*work\s+out\b/i,
  /\byour\s+turn\s+to\s+(?:calculate|compute|work|figure|count|convert|do\s+the\s+(?:maths?|sums?|arithmetic))\b/i,
  /\b(?:now|then|next|you|try\s+to|go\s+ahead\s+and)\s+(?:calculate|compute|convert|figure\s+out|count\s+up)\b/i,
];

/** Verbs V8's instruction reading does not list, which open an indirect sum ask ("Now apply that to the card's numbers."). */
const MORE_ASK_VERBS = /^\W*(?:(?:now|then|next|so),?\s+)?(?:apply|repeat|redo|follow|run)\b/i;

/** The phrase of an indirect sum ask in the reply (see INDIRECT_SUM_ASKS), or null. */
export function indirectSumAsk(text: string): string | null {
  const more = sentences(text).filter((s) => MORE_ASK_VERBS.test(s));
  for (const line of [...asksIn(text), ...more]) {
    for (const pattern of INDIRECT_SUM_ASKS) {
      const hit = pattern.exec(line.trim());
      if (hit) return hit[0];
    }
  }
  return null;
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
        // Only a Widget the Tutor showed counts: the Concept card's Widget is code's, and is on screen whatever the Tutor does.
        const own = reply.widgets.filter((w) => !w.byCode);
        if (!own.length) {
          out.push(reply.widgets.length ? `The Tutor showed no Widget; the only one on screen is code's (${reply.widgets.map((w) => `"${w.id}"`).join(", ")}).` : "No Widget was shown.");
          break;
        }
        if (c.mode && !own.some((w) => modeOf(w) === c.mode)) {
          const modes = own.map((w) => `"${w.id}" is in ${modeOf(w) === undefined ? "no mode" : `mode ${String(modeOf(w))}`}`).join(", ");
          out.push(`No Widget the Tutor showed is in ${c.mode} mode (${modes}).`);
        }
        const blocked = new Set(blockedNumbersFrom(ctx.openItems));
        const used = [...new Set(own.flatMap((x) => numbersOfParams(x.params)).filter((n) => blocked.has(n)))];
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
        // The seen reply is the fixed one, so a slip that code fixed would pass the check above: the Tutor still made it.
        if (reply.fixed.length) out.push(`Style: the raw reply needed fixing (${reply.fixed.join(", ")}); the Tutor should write plain text.`);
        break;
      }
      case "noDollar": {
        if (prose(reply.text).includes("$")) out.push('The reply text has a "$".');
        const labelled = reply.widgets.filter((w) => w.labels.some((l) => l.includes("$")));
        if (labelled.length) out.push(`The Widget ${labelled.map((w) => `"${w.id}"`).join(", ")} has a "$" in its labels.`);
        break;
      }
      case "noSum": {
        // The reading V8 uses: questions, instructions and the ask; a sum said as a fact is allowed (ADR 0009).
        // Indirect asks ("do the same steps on the Quick try's numbers") count too (run 16, MP-4).
        const phrase = sumAsked(reply.text) ?? indirectSumAsk(reply.text);
        if (phrase) out.push(`The reply asks for a sum ("${phrase}").`);
        break;
      }
      case "choicesStored": {
        const n = reply.choices.length;
        if (!n) out.push("No Choices were stored under the reply.");
        else if (n < 2 || n > 3) out.push(`${n} Choices were stored under the reply; there should be 2 or 3.`);
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
  const by = w.byCode ? " (code showed this one, not the Tutor)" : "";
  return `${w.kind === "recipe" ? "Widget recipe" : w.kind === "written" ? "Written-ahead Widget" : "Widget"} "${w.id}"${by}${params}${labels}`;
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
    // Not the Tutor's words: code shows the next Quick try below a reply, so "the try below" in a reply points at something real.
    ...(args.reply.alsoShown.length ? [`Code then showed the Learner, below the reply (the Tutor did not write it, and it is not the Tutor's ask): ${args.reply.alsoShown.join("; ")}.`] : []),
    ...(args.reply.widgets.length ? ["A Widget's Guided Tasks (lines such as \"Move the new rate to 4%\") are optional play the Learner may ignore. They are not asks and not extra ideas: do not count them against \"one idea and one ask\"."] : []),
    // The reply check V5 keeps an open question's numbers out of a Widget's inputs, so sliders the Learner can move are not a leak.
    ...(args.reply.widgets.length ? ["A Widget's sliders are not a leak of an open quiz answer: code's reply checks already keep the open questions' numbers out of its inputs."] : []),
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
