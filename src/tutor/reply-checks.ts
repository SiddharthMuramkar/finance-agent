import { sumAsk } from "@/teaching/no-sums";

/**
 * Reply checks: the rules every Tutor reply must meet, written as code (spec #229, ticket #230).
 * Pure: no model, no database. A caller hands in a finished reply (its text, the Widgets it showed and
 * any rule it saved) and the turn's context (the Teaching Step, the Reply kind, the Topic's currencies,
 * the open quiz's questions), and gets back every rule the reply breaks (V1 to V8), with reasons a
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
  /** The ladder's drill rung: five short tries code posts; the reply is one sentence and one ask (the short cap). */
  | "drill"
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
  rule: "V1" | "V2" | "V3" | "V4" | "V5" | "V6" | "V7" | "V8";
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

/** Words that open a line telling the Learner to do something. Not "check": "Check 1 opens next" names a Check. */
const INSTRUCTION_VERBS = new Set(
  (
    "set open try do tell press say type fill work find pick choose write give name put use move drag compare guess answer " +
    "show explain convert add subtract multiply divide take calculate read look click tap think start enter"
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
  return opensWithVerb(start.replace(/^(?:now|then|next|so)\b,?\s*/i, ""), INSTRUCTION_VERBS);
}

/** Whether a line opens with one of these verbs as an instruction. "Do not…" and "Say a rate…" (a supposition) do not count. */
function opensWithVerb(line: string, verbs: ReadonlySet<string>): boolean {
  const [first, second] = bareStart(line)
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}']/gu, "").toLowerCase());
  if (!first || !verbs.has(first)) return false;
  if (first === "do" && (second === "not" || second === "you")) return false;
  if (first === "say" && ["a", "an", "we", "you", "your", "that", "it"].includes(second ?? "")) return false;
  return true;
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

/** Rewrites the prose of a reply, chunk by chunk, leaving every fenced block (Widgets, sources) exactly as it was. */
function mapProse(text: string, fn: (chunk: string) => string): string {
  const out: string[] = [];
  let chunk: string[] = [];
  let inFence = false;
  const flush = () => {
    if (chunk.length) out.push(fn(chunk.join("\n")));
    chunk = [];
  };
  for (const line of text.split("\n")) {
    const fenceLine = line.trimStart().startsWith("```");
    if (inFence || fenceLine) {
      if (!inFence) flush();
      out.push(line);
      if (fenceLine) inFence = !inFence;
      continue;
    }
    chunk.push(line);
  }
  flush();
  return out.join("\n");
}

const ARROW_CHARS = "➜➔➙➛➝➞➟➠➡➢➣➤➥➦➧➨⇒⇨⟹⟶→↳↪";
const ARROW = new RegExp(`[${ARROW_CHARS}]\\uFE0F?`, "u");
const LINE_START_ARROW = new RegExp(`^([ \\t]*(?:[-*+][ \\t]+)?)(?:[${ARROW_CHARS}]\\uFE0F?)+[ \\t]*`, "gmu");
const INLINE_ARROW = new RegExp(`[ \\t]*(?:[${ARROW_CHARS}]\\uFE0F?)+[ \\t]*`, "gu");
const EMOJI_SOURCE = "(?:[\\p{Extended_Pictographic}\\p{Regional_Indicator}]\\uFE0F?(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*|\\u20E3)";
const EMOJI = new RegExp(EMOJI_SOURCE, "u");
const LINE_START_EMOJI = new RegExp(`^([ \\t]*)${EMOJI_SOURCE}+[ \\t]*`, "gmu");
const INLINE_EMOJI = new RegExp(`[ \\t]*${EMOJI_SOURCE}+`, "gu");
const HEADING = /^([ \t]*)#{1,6}[ \t]+/gm;
const BOLD = /\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__/g;

/**
 * The fixes that cost no retry: emoji go, decorative arrows go (or read "to" between two things),
 * headings become plain lines, and only the first bold span stays bold. Widget fences are left alone.
 */
export function fixReply(draft: ReplyDraft): ReplyDraft {
  let boldKept = false;
  const text = mapProse(draft.text, (chunk) =>
    chunk
      .replace(LINE_START_ARROW, "$1")
      .replace(INLINE_ARROW, " to ")
      .replace(LINE_START_EMOJI, "$1")
      .replace(INLINE_EMOJI, "")
      .replace(HEADING, "$1")
      .replace(BOLD, (whole: string, a?: string, b?: string) => {
        if (!boldKept) {
          boldKept = true;
          return whole;
        }
        return a ?? b ?? "";
      })
      .replace(/[ \t]+$/gm, ""),
  );
  return { ...draft, text };
}

const BANNED_PHRASES = ["Great question", "Certainly", "Absolutely", "Code recorded"];
/** The task verbs that may open only the ask line. */
const TASK_VERBS = new Set(["set", "open", "try", "do", "tell", "press", "say"]);

/** Whether a message line sets the Learner a task ("Set the widget…", "Do its Guided Tasks"). */
function isTaskLine(line: string): boolean {
  return opensWithVerb(line, TASK_VERBS);
}

function quoteList(items: string[]): string {
  return items.map((s) => `"${s}"`).join(", ");
}

/** Verbs that open a line asking for a sum, beside the instruction verbs ("Compute the ratio.", "Figure out the growth."). */
const SUM_VERBS = new Set(["compute", "figure", "round"]);

/**
 * What a reply asks of the Learner, for V8: every sentence that ends in "?" or opens as an instruction, and the ask.
 * Statements are left out, so a short sum said as a fact ("1 point times 100 is 100 bp.") is never read as an ask.
 */
export function asksIn(text: string): string[] {
  const lines = text.split("\n");
  return proseLineIndices(lines)
    .flatMap((i) => sentencesOf(prose(lines[i])))
    .filter((s) => asksOrInstructs(s) || opensWithVerb(s, SUM_VERBS));
}

/** V8's message: the phrase that asks for a sum, and what to ask instead (ADR 0009). */
export const sumAskMessage = (phrase: string) =>
  `Your reply asks the Learner to work out a sum ("${phrase}"). Ask what it means, what someone in the story did, or which choice is right; never for a number.`;

/** The phrase in a reply that asks the Learner for a sum (V8), or null. */
export function sumAsked(text: string): string | null {
  for (const line of asksIn(text)) {
    const phrase = sumAsk(line);
    if (phrase) return phrase;
  }
  return null;
}

/**
 * The reply with every sentence that asks for a sum (V8) taken out, and any line left empty by it: the fallback after a
 * failed V8 retry. Statements and fences stay; the Choices under the reply carry the next move.
 */
export function dropSumAsks(text: string): string {
  const out = mapProse(text, (chunk) =>
    chunk
      .split("\n")
      .map((line) => {
        const sentences = sentencesOf(line);
        const kept = sentences.filter((s) => !((asksOrInstructs(s) || opensWithVerb(s, SUM_VERBS)) && sumAsk(prose(s))));
        return kept.length === sentences.length ? line : kept.length ? kept.join(" ") : null;
      })
      .filter((line): line is string => line !== null)
      .join("\n"),
  );
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Every rule (V1 to V8) the reply breaks, with a reason a retry can be told. Run it on the fixed draft
 * (`fixReply`), so that V3 fails only on what code cannot fix.
 */
export function checkReply(draft: ReplyDraft, ctx: ReplyCheckContext): ReplyProblem[] {
  const problems: ReplyProblem[] = [];
  const { message, ask } = splitAsk(draft.text);
  const said = prose(draft.text);

  // V1: words within the cap.
  const words = countWords(message) + (ask ? countWords(ask) : 0);
  const cap = capFor(ctx.step, ctx.replyKind);
  if (words > cap) problems.push({ rule: "V1", message: `Your reply was ${words} words. The limit is ${cap}. Keep one idea and one ask.` });

  // V2: one question in the message, one short ask, no other task lines.
  const questions = (prose(message).match(/\?/g) ?? []).length;
  if (questions > 1)
    problems.push({ rule: "V2", message: `Your message asked ${questions} questions. The limit is one, plus the ask on the last line.` });
  const tasks = prose(message).split("\n").filter(isTaskLine);
  if (!ask && tasks.length > 1)
    problems.push({
      rule: "V2",
      message: `Your message set ${tasks.length} tasks (${quoteList(tasks.map((t) => t.trim()))}). Give one thing to do, on the last line.`,
    });
  if (ask) {
    const askWords = countWords(ask);
    if (askWords > ASK_WORD_LIMIT)
      problems.push({ rule: "V2", message: `Your ask was ${askWords} words. The limit is ${ASK_WORD_LIMIT}. Make it one short sentence.` });
    if (tasks.length)
      problems.push({
        rule: "V2",
        message: `Your message set ${tasks.length} more ${tasks.length === 1 ? "task" : "tasks"} besides the ask (${quoteList(tasks.map((t) => t.trim()))}). Give one thing to do, on the last line.`,
      });
  }

  // V3: plain style.
  const banned = BANNED_PHRASES.filter((p) => new RegExp(`\\b${p}\\b`, "i").test(said));
  if (banned.length) problems.push({ rule: "V3", message: `Remove ${quoteList(banned)}. Start with the point.` });
  if (EMOJI.test(said) || ARROW.test(said)) problems.push({ rule: "V3", message: "Remove the emoji and decorative arrows. Write plain text." });
  if (/^[ \t]*#{1,6}[ \t]+/m.test(said)) problems.push({ rule: "V3", message: "Remove the headings. Write plain sentences." });
  const bold = said.match(BOLD)?.length ?? 0;
  if (bold > 1) problems.push({ rule: "V3", message: `Your reply had ${bold} bold spans. The limit is one: the rule worth writing down.` });

  // V4: one Widget a reply, and a valid one.
  if (draft.widgets.length > 1)
    problems.push({ rule: "V4", message: `Your reply showed ${draft.widgets.length} Widgets. The limit is one.` });
  for (const w of draft.widgets) {
    const reason = ctx.widgetOk?.(w) ?? null;
    if (reason) problems.push({ rule: "V4", message: `The Widget "${w.id}" cannot be shown: ${reason}` });
  }

  // V5: no open quiz answer, in the text, the saved rule or a Widget preset.
  const withRule = `${said}\n${prose(draft.savedRule ?? "")}`;
  const leaked = ctx.openItems.filter((item) => givesAnswer(item, withRule));
  for (const item of leaked)
    problems.push({
      rule: "V5",
      message: `Your reply gives the answer to an open quiz question ("${item.prompt.trim()}"). Never give or confirm an open answer. Teach the idea with other numbers.`,
    });
  const blocked = new Set(blockedNumbersFrom(ctx.openItems));
  for (const w of draft.widgets) {
    const used = unique(paramNumbers(w.params).filter((n) => blocked.has(n)));
    if (used.length)
      problems.push({
        rule: "V5",
        message: `The Widget "${w.id}" is set to ${used.join(", ")}, from the open quiz. Set it to other numbers.`,
      });
  }

  // V6: no app words.
  // The saved rule is the Learner's own typed words, not the Tutor's, so V6 and V7 read the Tutor's text only; V5 still reads both.
  const appWords = appWordsIn(said, ctx.internalWords);
  if (appWords.length) problems.push({ rule: "V6", message: `Remove the app words ${quoteList(appWords)}. Write only about the finance.` });

  // V7: the right currency for made-up examples and Widgets.
  const wrong = wrongCurrencies(said, draft.widgets, ctx);
  if (wrong.length)
    problems.push({
      rule: "V7",
      message: `Your reply uses ${wrong.join(" and ")}. This Topic's examples and Widgets use ${currencyName(ctx.exampleCurrency)}.`,
    });

  // V8: no sum asked of the Learner (ADR 0009). Only questions, instructions and the ask are read; one V8 a reply.
  const sum = sumAsked(draft.text);
  if (sum) problems.push({ rule: "V8", message: sumAskMessage(sum) });

  return problems;
}

/**
 * What the one retry is told: each failed check with its limit, one per line, then how to write it again.
 * A leak of an open answer also lists the numbers to keep away from. Empty when nothing failed.
 */
export function correctionText(problems: ReplyProblem[], draft: ReplyDraft, ctx: ReplyCheckContext): string {
  if (!problems.length) return "";
  const lines = unique(problems.map((p) => p.message));
  if (problems.some((p) => p.rule === "V5")) {
    const blocked = blockedNumbersFrom(ctx.openItems);
    if (blocked.length) lines.push(`Numbers from the open quiz, which you may not use: ${blocked.join(", ")}.`);
  }
  const ask = splitAsk(draft.text).ask ? "Keep one ask, on the last line." : "End with one ask, on the last line.";
  lines.push(`Write the whole reply again within ${capFor(ctx.step, ctx.replyKind)} words. ${ask}`);
  return lines.join("\n");
}

/**
 * The fallback when the retry fails too and there is no Concept card to show: the reply cut at its last
 * full sentence within the cap, keeping the ask line. Fences (Widgets) stay where they were; uncounted.
 */
export function trimToCap(text: string, cap: number): string {
  const { message, ask } = splitAsk(text);
  if (countWords(message) + (ask ? countWords(ask) : 0) <= cap) return text;
  let budget = cap - (ask ? countWords(ask) : 0);
  let full = false;
  const kept = mapProse(message, (chunk) =>
    chunk
      .split("\n")
      .map((line) => {
        const out: string[] = [];
        for (const sentence of sentencesOf(line)) {
          const words = countWords(sentence);
          if (full || words > budget) {
            full = true;
            break;
          }
          budget -= words;
          out.push(sentence);
        }
        return out.join(" ");
      })
      .join("\n"),
  );
  const body = kept.replace(/\n{3,}/g, "\n\n").trim();
  // The ask keeps the gap it had: its own paragraph, or the next line.
  const gap = ask && /\n[ \t]*\n\s*$/.test(text.slice(0, text.lastIndexOf(ask))) ? "\n\n" : "\n";
  return ask ? (body ? `${body}${gap}${ask}` : ask) : body;
}

/**
 * Whether the text gives an open item's answer: every number of the answer together with any number
 * of its question. An answer with no numbers counts when its words appear (two words or more) beside
 * the question's numbers, or anywhere when the question has none.
 */
function givesAnswer(item: OpenItem, text: string): boolean {
  if (!item.answer?.trim()) return false;
  const said = new Set(numbersIn(text));
  const promptNumbers = numbersIn(item.prompt);
  const withQuestion = promptNumbers.length === 0 || promptNumbers.some((n) => said.has(n));
  const answerNumbers = numbersIn(item.answer);
  if (answerNumbers.length) {
    if (withQuestion && answerNumbers.every((n) => said.has(n))) return true;
    return confirmsNumber(text, answerNumbers);
  }
  const words = item.answer.trim().toLowerCase().split(/\s+/);
  return words.length >= 2 && withQuestion && text.toLowerCase().replace(/\s+/g, " ").includes(words.join(" "));
}

/** Words that confirm or hand over an answer: "is right", "correct", "yes", "that's it", "the answer is", "you got it". */
const CONFIRM_CUE = /\b(?:(?:is|are|was)\s+(?:right|correct)|correct|yes|that(?:'|\u2019)?s\s+(?:it|right)|that\s+is\s+(?:it|right)|the\s+answer\s+is|you\s+got\s+it)\b/i;
/** How many words either side of an answer number a confirm cue still counts. */
const CUE_WINDOW = 4;

/** Whether an answer number of an open item sits within a few words of a confirm cue, with or without the question's numbers. */
function confirmsNumber(text: string, answerNumbers: string[]): boolean {
  const tokens = text.split(/\s+/).filter(Boolean);
  const answers = new Set(answerNumbers);
  return tokens.some(
    (token, i) =>
      numbersIn(token).some((n) => answers.has(n)) &&
      CONFIRM_CUE.test(tokens.slice(Math.max(0, i - CUE_WINDOW), i + CUE_WINDOW + 1).join(" ")),
  );
}

/** Every number in a Widget's params, normalised: numbers as they are, and any numbers written in strings. */
function paramNumbers(value: unknown): string[] {
  if (typeof value === "number") return Number.isFinite(value) ? [normalNumber(String(Math.abs(value)))] : [];
  if (typeof value === "string") return numbersIn(value);
  if (Array.isArray(value)) return value.flatMap(paramNumbers);
  if (value && typeof value === "object") return Object.values(value).flatMap(paramNumbers);
  return [];
}

/** Every string in a Widget's params. */
function paramStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(paramStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(paramStrings);
  return [];
}

/** App words the Learner can use: never banned, even when a caller passes one as an id. */
export const ALLOWED_APP_WORDS = ["Topic", "Check", "Check tab", "Widget", "Next", "Go deeper", "Show me in a widget", "Quick try", "Concept card"];
const INTERNAL_PHRASES = /\b(?:course navigator|session items?|reply kinds?|skill states?)\b/gi;
const SNAKE_CASE = /(?<![\w/.-])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![\w-])/g;
const CODE_VERBS =
  "recorded|records|marks|marked|saved|saves|logged|logs|noted|notes|checked|checks|tracks|tracked|counted|counts|will|has|shows|showed|says|said|keeps|kept|decides|decided|opens|opened|moves|moved|picks|picked|sees|saw|knows";
const CODE_AS_SUBJECT = new RegExp(`(?:^|[.!?]["')]*\\s+)(?:the\\s+)?code\\s+[a-z]+|\\bcode\\s+(?:${CODE_VERBS})\\b`, "gim");

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The app words in a reply: the ids it was told to keep out, tool and step names, named internals, and "Code" doing something. */
function appWordsIn(text: string, internalWords: string[]): string[] {
  const allowed = new Set(ALLOWED_APP_WORDS.map((w) => w.toLowerCase()));
  const found: string[] = [];
  for (const word of internalWords) {
    if (!word.trim() || allowed.has(word.trim().toLowerCase())) continue;
    const m = text.match(new RegExp(`(?<![\\w-])${escapeRegExp(word.trim())}(?![\\w-])`, "i"));
    if (m) found.push(m[0]);
  }
  for (const re of [SNAKE_CASE, INTERNAL_PHRASES, CODE_AS_SUBJECT]) for (const m of text.match(re) ?? []) found.push(m.replace(/^[.!?"')\s]+/, ""));
  return unique(found);
}

const USD_AMOUNT = /(?:US)?\$\s?\d|\bUSD\s?\d|\d\s?USD\b/;
const INR_AMOUNT = /₹\s?\d|\bINR\s?\d|\d\s?INR\b|\bRs\.?\s?\d/;

function currencyName(code: string): string {
  if (code === "INR") return "rupees (₹)";
  if (code === "USD") return "dollars ($)";
  return code;
}

/** The currencies a reply uses that its Topic does not allow: $ only with dollar examples or a dollar Case, ₹ likewise for rupees. */
function wrongCurrencies(text: string, widgets: ReplyWidget[], ctx: ReplyCheckContext): string[] {
  const allows = (code: string) => ctx.exampleCurrency === code || ctx.caseCurrencies.includes(code);
  const labels = widgets.flatMap((w) => paramStrings(w.params));
  const out: string[] = [];
  if (!allows("USD") && (USD_AMOUNT.test(text) || labels.some((s) => /\$|\bUSD\b/.test(s)))) out.push("dollars ($)");
  if (!allows("INR") && (INR_AMOUNT.test(text) || labels.some((s) => /₹|\bINR\b|\bRs\b/.test(s)))) out.push("rupees (₹)");
  return out;
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
