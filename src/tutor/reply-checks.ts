/**
 * Reply checks: the rules every Tutor reply must meet, written as code (spec #229, ticket #230).
 * Pure: no model, no database. A caller hands in a finished reply (its text, the Widgets it showed and
 * any rule it saved) and the turn's context (the Teaching Step, the Reply kind, the Topic's currencies,
 * the open quiz's questions), and gets back every rule the reply breaks (V1 to V7), with reasons a
 * retry can be told. Small style slips (emoji, arrows, headings, extra bold) are fixed by `fixReply`
 * without a retry. Nothing here is wired into the Tutor Turn yet.
 */

export type StepKind = "story" | "concept" | "explore" | "your_turn" | "check" | "reveal" | "principle" | "none";

export type ReplyKind =
  | "feedback"
  | "rule"
  | "worked_example"
  | "quick_try"
  | "reteach"
  | "hint"
  | "answer_question"
  | "offer_park"
  | "go_deeper"
  | "simpler";

/** One question of the open quiz attempt (or the next one). `answer` is the right choice's text, known only on the server. */
export interface OpenItem {
  prompt: string;
  choices: string[];
  answer?: string;
}

export interface ReplyWidget {
  kind: "written" | "recipe";
  id: string;
  params?: Record<string, unknown>;
}

export interface ReplyCheckContext {
  step: StepKind;
  /** Code's choice of Reply kind, when it knows it. */
  replyKind?: ReplyKind;
  /** The Topic's currency for everyday examples, such as "INR". */
  exampleCurrency: string;
  /** The currencies of the Topic's Cases, such as ["USD"]. */
  caseCurrencies: string[];
  /** The open quiz attempt's questions (and the next attempt's); empty when none is open. */
  openItems: OpenItem[];
  /** Ids the Learner must never read: Topic, Check, question and Widget ids. */
  internalWords: string[];
  /** The Widget validator (V4), injected by the caller: null means valid, otherwise the reason. */
  widgetOk?: (w: ReplyWidget) => string | null;
}

/** A finished reply: its text (message and last-line ask), the Widgets it showed and the rule it saved to the Topic Note. */
export interface ReplyDraft {
  text: string;
  widgets: ReplyWidget[];
  savedRule?: string | null;
}

export interface ReplyProblem {
  rule: "V1" | "V2" | "V3" | "V4" | "V5" | "V6" | "V7";
  message: string;
}

/** The short cap: Concept, Your turn and Check. */
export const SHORT_CAP = 80;
/** The long cap: a worked example, a Go deeper reply, and the Story, Explore, Reveal and Principle steps. */
export const LONG_CAP = 120;
/** The most words the last-line ask may have. */
export const ASK_WORD_LIMIT = 25;

const SHORT_STEPS: ReadonlySet<StepKind> = new Set(["concept", "your_turn", "check"]);
const LONG_KINDS: ReadonlySet<ReplyKind> = new Set(["worked_example", "go_deeper"]);

/** The word cap for a reply at this Teaching Step with this Reply kind. */
export function capFor(step: StepKind, replyKind?: ReplyKind): number {
  if (replyKind && LONG_KINDS.has(replyKind)) return LONG_CAP;
  return SHORT_STEPS.has(step) ? SHORT_CAP : LONG_CAP;
}

const FENCE_BLOCK = /```[^\n]*\n[\s\S]*?(?:\n```|$)/g;
const CITATION_MARKER = /\[\d+\]\([^)\s]*\)/g;

/** The text a Learner reads as prose: Widget and sources fences and Citation markers taken out. */
function prose(text: string): string {
  return text.replace(FENCE_BLOCK, "\n").replace(CITATION_MARKER, "");
}

/** Words the Learner reads: Widget fences, Citation markers and bare Markdown symbols are not counted. */
export function countWords(text: string): number {
  return prose(text)
    .split(/\s+/)
    .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/** Where a sentence ends: after ".", "!" or "?" (and any Citation markers on it), before a space. */
const SENTENCE_END = /(?<=[.!?]["')*_]*(?:\[\d+\]\([^)\s]*\))*)\s+(?=\S)/;

/** The sentences of one line of text. */
function sentencesOf(line: string): string[] {
  return line
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Words that open a line telling the Learner to do something. */
const INSTRUCTION_VERBS = new Set(
  (
    "set open try do tell press say type fill work find pick choose write give name put use move drag compare guess answer " +
    "show explain convert add subtract multiply divide take calculate read look click tap think start enter check"
  ).split(" "),
);

/** The line with leading Markdown (list markers, quote marks, bold) taken off. */
function bareStart(line: string): string {
  return line.replace(/^\s*(?:[-*+>]\s+|\d+[.)]\s+)*[*_"']*/, "");
}

/** Whether a sentence asks a question or tells the Learner what to do next. */
function asksOrInstructs(sentence: string): boolean {
  const s = prose(sentence).trim();
  if (/\?[*_"')\]]*$/.test(s)) return true;
  const start = bareStart(s);
  if (/^your turn\b/i.test(start)) return true;
  const first = start
    .replace(/^(?:now|then|next|so)\b,?\s*/i, "")
    .match(/^[\p{L}']+/u)?.[0]
    ?.toLowerCase();
  return first !== undefined && INSTRUCTION_VERBS.has(first);
}

/** The indices of the lines outside fences. */
function proseLineIndices(lines: string[]): number[] {
  const out: number[] = [];
  let inFence = false;
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      return;
    }
    if (!inFence) out.push(i);
  });
  return out;
}

/**
 * Splits a reply into its message and its ask. The ask is the reply's last line (outside any fence)
 * when it asks a question or tells the Learner what to do; when that line holds several sentences,
 * only its last sentence is the ask and the rest stays in the message. Null when the last line only tells.
 */
export function splitAsk(text: string): { message: string; ask: string | null } {
  const lines = text.split("\n");
  const last = proseLineIndices(lines)
    .filter((i) => lines[i].trim())
    .pop();
  if (last === undefined) return { message: text.trim(), ask: null };
  const sentences = sentencesOf(lines[last]);
  const ask = sentences.pop();
  if (!ask || !asksOrInstructs(ask)) return { message: text.trim(), ask: null };
  const rest = sentences.join(" ");
  const kept = [...lines.slice(0, last), ...(rest ? [rest] : []), ...lines.slice(last + 1)];
  return { message: kept.join("\n").trim(), ask: ask.trim() };
}

/**
 * The numbers in a piece of text, normalised so that 4.5, 4.50 and 4.50% are one number:
 * Indian or Western thousands commas dropped, the sign dropped (a fall of −30 bp is 30), currency symbols ignored.
 */
function numbersIn(text: string): string[] {
  const found = text.match(/(?<![\p{L}\p{N}_.])(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?|(?<![\p{L}\p{N}_.])\.\d+/gu) ?? [];
  return found.map(normalNumber);
}

function normalNumber(raw: string): string {
  return String(Math.abs(Number(raw.replace(/,/g, ""))));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * The numbers the Tutor may not use while a quiz is open: every number in the open attempt's questions,
 * choices and answers (and the next attempt's, when the caller passes them), normalised.
 */
export function blockedNumbersFrom(items: OpenItem[]): string[] {
  return unique(items.flatMap((item) => [item.prompt, ...item.choices, item.answer ?? ""].flatMap(numbersIn)));
}
