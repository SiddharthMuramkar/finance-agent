import { sumAsk } from "@/teaching/no-sums";

/**
 * Reply checks: the rules every Tutor reply must meet, written as code (spec #229, ticket #230).
 * Pure: no model, no database. A caller hands in a finished reply (its text, the Widgets it showed and
 * any rule it saved) and the turn's context (the Teaching Step, the Reply kind, the Topic's currencies,
 * the open quiz's questions), and gets back every rule the reply breaks (V1 to V10), with reasons a
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
  /**
   * Whether a Quick try is on the Learner's screen or code posts one with this reply (turn facts' openTry or tryPosted).
   * False at a Your turn with no Quick try; left out, a Your turn is taken to have one (A7, `noAskNeeded`).
   */
  quickTry?: boolean;
  /**
   * Set in the Assignment (spec #68, ticket #110): the Learner's Own Case is on screen, and `flagged` names its inputs the
   * range check found far from their industry's usual range ("operating margin"). V9 and V10 read only these replies.
   */
  assignment?: { flagged: string[] };
}

/** A finished reply: its text (message and last-line ask), the Widgets it showed and the rule it saved to the Topic Note. */
export interface ReplyDraft {
  text: string;
  widgets: ReplyWidget[];
  savedRule?: string | null;
}

export interface ReplyProblem {
  rule: "V1" | "V2" | "V3" | "V4" | "V5" | "V6" | "V7" | "V8" | "V9" | "V10";
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

/**
 * Whether a reply needs no ask of its own: at Your turn the open Quick try is the ask (spec 2026-11-12, A7; ADR 0006).
 * V2 asks for none there, and the retry is told to write none. A Your turn with no Quick try (a Topic not converted,
 * where the Tutor sets the practice itself) still ends on an ask.
 */
export function noAskNeeded(ctx: Pick<ReplyCheckContext, "step" | "quickTry">): boolean {
  return ctx.step === "your_turn" && ctx.quickTry !== false;
}

/**
 * Whether a reply describes the open Quick try instead of leaving it to show itself (spec 2026-11-12, A7; Evidence:
 * replies 1 to 3 and 6 each ended "The Quick try on your screen asks…"). Pointing at it ("Have a go at the Quick try
 * below.") is fine; retelling what it asks, wants or says is not, since the card is on screen and code shows it again.
 */
export function describesQuickTry(text: string): boolean {
  const prose = text.replace(/\s+/g, " ");
  return (
    /\b(?:the|your|this|that)\s+quick\s+try\b[^.?!]{0,60}?\b(?:asks?|asking|wants?|wanting|says|is about|reads|gives you|shows you)\b/i.test(prose) ||
    /\b(?:the|your)\s+(?:question|try)\s+(?:on|in)\s+(?:your|the)\s+(?:screen|card)\s+(?:asks?|wants?|says|is)\b/i.test(prose)
  );
}

/** The word cap for a reply at this Teaching Step with this Reply kind. */
export function capFor(step: StepKind, replyKind?: ReplyKind): number {
  if (replyKind && LONG_KINDS.has(replyKind)) return LONG_CAP;
  return SHORT_STEPS.has(step) ? SHORT_CAP : LONG_CAP;
}

const FENCE_BLOCK = /```[^\n]*\n[\s\S]*?(?:\n```|$)/g;
const CITATION_MARKER = /\[\d+\]\([^)\s]*\)/g;

/** The text a Learner reads as prose: Widget and sources fences and Citation markers taken out. */
export function prose(text: string): string {
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

/** Marks where one stored block ends and the next begins while a reply is fixed whole (a private-use character). */
const BLOCK_EDGE = "";

/**
 * `fixReply` over a reply stored as several text blocks (one per cited span or paragraph, and per step), giving each
 * block's fixed text. The reply is fixed as the one text the checks read (the blocks joined), so it keeps one bold
 * span reply-wide, and a rule for line starts or fences sees the lines as the Learner does, not each block alone.
 * The edges are marked in the joined text and the fixed text is cut there again; an edge goes before the newlines
 * that end its block, so a line's start stays a line start. Should an edge go missing (the reply itself held the
 * marker), each block is fixed on its own, as before.
 */
export function fixReplyBlocks(texts: string[]): string[] {
  let joined = "";
  texts.forEach((text, i) => {
    if (i > 0) {
      const tail = /[ \t\n]*$/.exec(joined)!;
      joined = joined.slice(0, tail.index) + BLOCK_EDGE + tail[0];
    }
    joined += text;
  });
  const parts = fixReply({ text: joined, widgets: [] }).text.split(BLOCK_EDGE);
  return parts.length === texts.length ? parts : texts.map((text) => fixReply({ text, widgets: [] }).text);
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
  return asksWithContext(text).map(({ ask }) => ask);
}

/** Whether a sentence sets the Learner something to answer or do: a question, an instruction, or a sum verb. */
const isAsk = (sentence: string) => asksOrInstructs(sentence) || opensWithVerb(sentence, SUM_VERBS);

/**
 * For each prose line of a reply, in order, whether it or the nearest non-blank prose line above gives a number: the
 * context V8 reads that line's asks in. A year, "Q3" or a rate two lines away is not the ask's to work from.
 */
function numbersNearLines(text: string): boolean[] {
  const lines = text.split("\n");
  const said = proseLineIndices(lines).map((i) => prose(lines[i]));
  return said.map((line, k) => {
    const above = said.slice(0, k).findLast((l) => l.trim() !== "");
    return /\d/.test(line) || (above !== undefined && /\d/.test(above));
  });
}

/** Every ask in a reply (as `asksIn`), each with whether its own line or the line above gives numbers. */
function asksWithContext(text: string): { ask: string; numbers: boolean }[] {
  const lines = text.split("\n");
  const near = numbersNearLines(text);
  return proseLineIndices(lines).flatMap((i, k) =>
    sentencesOf(prose(lines[i]))
      .filter(isAsk)
      .map((ask) => ({ ask, numbers: near[k] })),
  );
}

/** V8's message: the phrase that asks for a sum, and what to ask instead (ADR 0002). */
export const sumAskMessage = (phrase: string) =>
  `Your reply asks the Learner to work out a sum ("${phrase}"). Ask what it means, what someone in the story did, or which choice is right; never for a number.`;

/**
 * The phrase in a reply that asks the Learner for a sum (V8), or null. Each ask is read with the numbers on its own line
 * and the line above as context (prose only: fences and Citation markers out), so a figure asked for after a statement
 * that gives the numbers ("…₹30 profit on ₹100 of sales. What is its margin?") is caught although the ask sentence
 * holds no digit.
 */
export function sumAsked(text: string): string | null {
  for (const { ask, numbers } of asksWithContext(text)) {
    const phrase = sumAsk(ask, { numbers });
    if (phrase) return phrase;
  }
  return null;
}

/**
 * The reply with every sentence that asks for a sum (V8) taken out, and any line left empty by it: the fallback after a
 * failed V8 retry. Statements and fences stay; the Choices under the reply carry the next move.
 */
export function dropSumAsks(text: string): string {
  // mapProse hands over the prose lines in the order numbersNearLines lists them (fence lines out).
  const near = numbersNearLines(text);
  let k = 0;
  const out = mapProse(text, (chunk) =>
    chunk
      .split("\n")
      .map((line) => {
        const context = { numbers: near[k++] };
        const sentences = sentencesOf(line);
        const kept = sentences.filter((s) => !(isAsk(s) && sumAsk(prose(s), context)));
        return kept.length === sentences.length ? line : kept.length ? kept.join(" ") : null;
      })
      .filter((line): line is string => line !== null)
      .join("\n"),
  );
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Every rule (V1 to V10) the reply breaks, with a reason a retry can be told. Run it on the fixed draft
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

  // V2: one question in the message, one short ask, no other task lines. At Your turn no ask is needed: the open Quick
  // try is the ask (spec 2026-11-12, A7; ADR 0006), so a reply there that asks nothing passes and is never told to add one.
  const questions = (prose(message).match(/\?/g) ?? []).length;
  if (questions > 1)
    problems.push({
      rule: "V2",
      message: `Your message asked ${questions} questions. The limit is one${noAskNeeded(ctx) ? "" : ", plus the ask on the last line"}.`,
    });
  // At Your turn the open Quick try is the ask and is on screen: a reply never retells it (A7). "Quiz me" (Reply kind
  // quick_try) is the one reply told to name the try and what it asks, in one fun line.
  if (noAskNeeded(ctx) && ctx.replyKind !== "quick_try" && describesQuickTry(said))
    problems.push({ rule: "V2", message: "Do not describe the Quick try: it is on the Learner's screen. Answer, then stop; code shows the Quick try again under your reply." });
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

  // V4: a valid Widget, at most one a reply (B6, ADR 0008). A reply with none is not a fault: the Widget showing stays,
  // or code adds the step's scene or a Lingo card after the checks (companion.ts). More than one is still refused.
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

  // V8: no sum asked of the Learner (ADR 0002). Only questions, instructions and the ask are read; one V8 a reply.
  const sum = sumAsked(draft.text);
  if (sum) problems.push({ rule: "V8", message: sumAskMessage(sum) });

  if (ctx.assignment) {
    // V9: no verdict or advice words in the Assignment (spec #68 voice rules): the Own Case is the Learner's story.
    const verdicts = verdictWordsIn(said);
    if (verdicts.length)
      problems.push({
        rule: "V9",
        message: `Remove ${quoteList(verdicts)}. Never call a value right or wrong, cheap or dear, or say buy or sell: ask what story the input assumes.`,
      });
    // V10: with a flagged input, the reply names one, so the Learner hears which input to think about.
    const { flagged } = ctx.assignment;
    if (flagged.length && !flagged.some((name) => new RegExp(`\\b${name.replace(/\s+/g, "\\s+")}\\b`, "i").test(said)))
      problems.push({ rule: "V10", message: `Name the flagged ${flagged.length === 1 ? "input" : "inputs"} (${quoteList(flagged)}) and ask what story it assumes.` });
  }

  return problems;
}

/**
 * Verdict and advice words (spec #68 voice rules): a value called right or wrong, cheap or dear, under- or overvalued, and
 * buy or sell advice. "Buy" and "sell" count only as advice about the shares (G23): a company that sells tea or buys
 * leaves is the Own Case's business, and the course's cards use "sells" so.
 */
const VERDICT_WORDS = [
  /\b(?:right|wrong|correct)\s+(?:value|price|valuation)\b/gi,
  /\b(?:cheap|cheaper|dear|dearer|undervalued|overvalued|under-valued|over-valued|bargain)\b/gi,
  // Buying or selling the shares: "sell the shares", "buying its stock", "buy some of this equity".
  /\b(?:buy|buys|buying|sell|sells|selling)\s+(?:(?:the|its|this|that|these|those|your|my|our|their|some|more|any|a\s+few)\s+)?(?:(?:of\s+)?(?:the|its|this|that|these|those|company['’]s|firm['’]s)\s+)?(?:shares?|stocks?|equity)\b/gi,
  // Advice to act, said to or by someone holding the shares: "you should buy", "I would not sell", "I'd buy", "should
  // you sell", "don't buy". Not "you would sell more tea": a business selling more or less of something.
  /\b(?:(?:i|you|we|investors|one)\s+(?:should|shouldn['’]t|would|wouldn['’]t|could|must|might)|i['’]d|you['’]d|we['’]d|should\s+(?:i|you|we|investors|one)|don['’]t|do\s+not)\s+(?:not\s+|never\s+|still\s+)?(?:buy|sell)\b(?!\s+(?:more|less|fewer)\b)/gi,
  // A call: "a buy", "a strong sell", "buy signal", "buy or sell", "buy, hold or sell", "buy now", "worth buying".
  /\b(?:an?\s+(?:strong\s+|clear\s+)?(?:buy|sell)|(?:buy|sell)\s+(?:signal|rating|call|recommendation|opportunity|now|today)|(?:buy|sell|hold)\s*(?:,|or)\s*(?:hold|sell|buy)|buying\s+opportunity|(?:worth|time\s+to)\s+(?:buying|selling|buy|sell))(?![\w-])/gi,
];

/** The verdict and advice words a reply holds, as written, once each. */
export function verdictWordsIn(text: string): string[] {
  const found = VERDICT_WORDS.flatMap((re) => [...prose(text).matchAll(re)].map((m) => m[0].toLowerCase().replace(/\s+/g, " ")));
  return unique(found);
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
  const ask = noAskNeeded(ctx)
    ? "Write no ask of your own and do not describe the Quick try: it is on the Learner's screen, and it is the ask."
    : splitAsk(draft.text).ask
      ? "Keep one ask, on the last line."
      : "End with one ask, on the last line.";
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
export function paramNumbers(value: unknown): string[] {
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

/**
 * App words the Learner can use: never banned, even when a caller passes one as an id. The places of the app a Learner
 * goes to (the Course Map, the Notebook, Settings, Home) and the Topic Start card's "I know this: quiz me" are among them
 * (spec 2026-11-12, A6), so the Tutor can say how to open another Topic or take a Check now.
 */
export const ALLOWED_APP_WORDS = [
  "Topic",
  "Check",
  "Check tab",
  "Widget",
  "Next",
  "Go deeper",
  "Show me in a widget",
  "Quick try",
  "Concept card",
  "Course Map",
  "Notebook",
  "Settings",
  "Home",
  "Topic Start card",
  "I know this: quiz me",
];
const INTERNAL_PHRASES = /\b(?:course navigator|session items?|reply kinds?|skill states?)\b/gi;
const SNAKE_CASE = /(?<![\w/.-])[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?![\w-])/g;
const CODE_VERBS =
  "recorded|records|marks|marked|saved|saves|logged|logs|noted|notes|checked|checks|tracks|tracked|counted|counts|will|has|shows|showed|says|said|keeps|kept|decides|decided|opens|opened|moves|moved|picks|picked|sees|saw|knows";
const CODE_AS_SUBJECT = new RegExp(`(?:^|[.!?]["')]*\\s+)(?:the\\s+)?code\\s+[a-z]+|\\bcode\\s+(?:${CODE_VERBS})\\b`, "gim");

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The app words in a reply: the ids it was told to keep out, tool and step names, named internals, and "Code" doing
 * something. V6 reads it, and so does the stream guard (stream-guard.ts), sentence by sentence.
 */
export function appWordsIn(text: string, internalWords: readonly string[]): string[] {
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

/**
 * The Own Case markets' other currencies (#113-#115): yen, won and euros, by symbol or code. Read only in the Assignment,
 * where the one currency allowed is known (the Own Case's). A Topic's allowed currencies are read from its Cases'
 * dollar and rupee amounts only (turn-facts.ts), so a Topic whose Cases quote yen, won or euros (the annual-report
 * Topic's Kikkoman, Samsung and LVMH) would be refused its own figures if V7 read these there.
 */
const OTHER_CURRENCIES = [
  { code: "JPY", name: "yen (¥)", amount: /¥\s?\d|\bJPY\s?\d|\d\s?JPY\b/, label: /¥|\bJPY\b/ },
  { code: "KRW", name: "won (₩)", amount: /₩\s?\d|\bKRW\s?\d|\d\s?KRW\b/, label: /₩|\bKRW\b/ },
  { code: "EUR", name: "euros (€)", amount: /€\s?\d|\d\s?€|\bEUR\s?\d|\d\s?EUR\b/, label: /€|\bEUR\b/ },
] as const;

/** A currency code in the words a reply is told: "rupees (₹)", "yen (¥)". */
export function currencyName(code: string): string {
  if (code === "INR") return "rupees (₹)";
  if (code === "USD") return "dollars ($)";
  return OTHER_CURRENCIES.find((c) => c.code === code)?.name ?? code;
}

/**
 * The currencies a reply uses that its Topic does not allow: $ only with dollar examples or a dollar Case, ₹ likewise for
 * rupees; in the Assignment also ¥, ₩ and € unless the Own Case is in them (G19).
 */
function wrongCurrencies(text: string, widgets: ReplyWidget[], ctx: ReplyCheckContext): string[] {
  const allows = (code: string) => ctx.exampleCurrency === code || ctx.caseCurrencies.includes(code);
  const labels = widgets.flatMap((w) => paramStrings(w.params));
  const out: string[] = [];
  if (!allows("USD") && (USD_AMOUNT.test(text) || labels.some((s) => /\$|\bUSD\b/.test(s)))) out.push("dollars ($)");
  if (!allows("INR") && (INR_AMOUNT.test(text) || labels.some((s) => /₹|\bINR\b|\bRs\b/.test(s)))) out.push("rupees (₹)");
  if (ctx.assignment)
    for (const c of OTHER_CURRENCIES) if (!allows(c.code) && (c.amount.test(text) || labels.some((s) => c.label.test(s)))) out.push(c.name);
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

/** The Blocked numbers a piece of text uses, normalised as `numbersIn` reads them (the stream guard's first test). */
export function blockedNumbersIn(text: string, blocked: readonly string[]): string[] {
  if (!blocked.length) return [];
  const set = new Set(blocked);
  return unique(numbersIn(text).filter((n) => set.has(n)));
}

/**
 * The numbers the Tutor may not use while a quiz is open: every number in the open attempt's questions,
 * choices and answers (and the next attempt's, when the caller passes them), normalised.
 */
export function blockedNumbersFrom(items: OpenItem[]): string[] {
  return unique(items.flatMap((item) => [item.prompt, ...item.choices, item.answer ?? ""].flatMap(numbersIn)));
}
