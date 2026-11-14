import { appWordsIn, blockedNumbersIn, prose } from "./reply-checks";

/**
 * The stream guard (spec 2026-11-12, A5; ADR 0017). An own-question reply streams to the Learner as the model writes it,
 * but never word by word: text is held to the end of a sentence, and the whole sentence is tested before it shows for
 * the three things that may never appear: a Blocked number, a sentence that tells the Learner to buy, sell or hold
 * something, and an internal word or id (V6's app words). On a hit the stream stops: the sentence is never shown, and
 * the caller shows the fixed line of A4 after what was already shown. Pure: no model, no database.
 *
 * What the guard gives back joins up to exactly the text it was given, less a sentence it stopped on, so what the
 * Learner saw and what is stored stay the same words.
 */

/** The rule a guard hit is recorded under in reply_checks, beside V1 to V8 (reply-records.ts). */
export const GUARD_RULE = "guard";

/** Why the guard stopped the stream. */
export type GuardRule = "blocked_number" | "advice" | "internal_word";

export type GuardHit = { rule: GuardRule; sentence: string; detail: string };

/** What the guard tests against: this turn's facts (turn-facts.ts). */
export type GuardFacts = { blockedNumbers: readonly string[]; internalWords: readonly string[] };

/** What a push (or the end) gives back: the text that may show now, and, on a hit, why the stream must stop. */
export type GuardStep = { show: string; hit?: GuardHit };

/** Where a sentence ends: ".", "!" or "?" (closing quotes, brackets, Markdown and Citation markers may follow), then a space. */
const SENTENCE_END = /[.!?]["'’”)\]*_]*(?:\[\d+\]\([^)\s]*\))*\s+/g;
const FENCE_LINE = /^[ \t]*```/;

/** The verbs of telling someone what to do with an investment. */
const VERB = "(buy|sell|hold|purchase|dump|offload)(?![\\w-])";
/** What "hold" means in a sentence that is not about an investment: "Hold on", "hold that thought", "hold the rate at 4%". */
const HOLD_IDIOM = /^\s*(?:on\b(?!\s*to)|up\b|back\b|that thought|your horses|your breath|still\b|it\s+(?:there|steady|still|fixed)\b|the\s+(?!shares?|stocks?|position)|a\s+(?!position))/i;
/** Words that open a sentence before its verb without changing what it tells: "So,", "Yes,", "Just", "Honestly", "Go ahead and". */
const LEAD_IN = /^(?:(?:so|yes|no|okay|ok|well|then|now|just|simply|definitely|honestly|personally|frankly|today|right now|go ahead and|go)\b[,:]?\s+)*/i;
/** A hypothetical said as an imperative: "Buy a bond at ₹100 and you get ₹5 a year." */
const HYPOTHETICAL = /\band\s+(?:you|it|they|that|this)\b/i;
const NEGATED = /\b(?:not|never|nobody|no one|cannot)\b|n['’]t\b/i;

/** "You should buy", "you shouldn't sell", "you'd better hold", "you might want to sell": a modal said to the Learner. Groups: the verb, then the rest. */
const YOU_MODAL = new RegExp(
  `\\byou(?:['’]d|\\s+had)?\\s+(?:should|ought\\s+to|better|might\\s+want\\s+to|may\\s+want\\s+to)(?:\\s+not|n['’]t)?(?:\\s+\\w+ly)?\\s+(?:to\\s+)?${VERB}(.*)$`,
  "i",
);
/** "I'd hold your shares", "I would buy", "I wouldn't sell", "if I were you, I'd buy": a first-person recommendation. Groups as above. */
const I_WOULD = new RegExp(`\\bi(?:['’]d|\\s+would)(?:\\s+not|n['’]t|\\s+never)?(?:\\s+\\w+ly)?\\s+${VERB}(.*)$`, "i");
/** "I recommend buying", "I suggest you sell", "my advice: hold", "our pick is to buy". */
const RECOMMEND = new RegExp(`\\b(?:(?:i|we)(?:['’]d|\\s+would)?\\s+(?:recommend|suggest|advise)|(?:my|our)\\s+(?:advice|tip|suggestion|recommendation|pick|call))\\b.*\\b(?:buy|sell|hold|purchase)(?:ing)?\\b`, "i");
/** "Now is a good time to buy", "the best moment to sell": unless the sentence says no one knows it. */
const GOOD_TIME = new RegExp(`\\b(?:good|great|right|best|perfect)\\s+(?:time|moment|day)\\s+to\\s+${VERB}`, "i");
/** An imperative after any lead-in: "Buy.", "Just sell it.", "Don't buy HDFC". Groups: the verb, then the rest. */
const IMPERATIVE = new RegExp(`^(?:(?:do\\s+not|don['’]t)\\s+)?${VERB}(.*)$`, "i");

/** Whether what follows "hold" (or "I'd hold") is an idiom or a Widget move, not an investment. */
const holdIdiom = (verb: string, rest: string) => verb.toLowerCase() === "hold" && HOLD_IDIOM.test(rest);

/**
 * Whether a sentence tells the Learner to buy, sell or hold something: an imperative ("Buy.", "Sell it.", "Don't sell
 * your shares"), a modal said to them ("You should buy HDFC Bank now"), a first-person recommendation ("I'd hold your
 * shares"), a recommendation word ("my advice: sell") or "a good time to buy". A sentence that only names buying and
 * selling ("Value It does not say what to buy or sell.", "Traders who bought in 2018…") is not one.
 */
export function tellsToBuyOrSell(sentence: string): boolean {
  const s = prose(sentence)
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*(?:[-+]\s+|\d+[.)]\s+)/, "")
    .trim();
  if (!s) return false;
  // An imperative, after any lead-in: "Buy.", "Just sell it.", "Don't buy HDFC".
  const bare = s.replace(LEAD_IN, "").replace(/^["'“‘(]+/, "");
  const imperative = IMPERATIVE.exec(bare);
  if (imperative && !holdIdiom(imperative[1], imperative[2]) && !HYPOTHETICAL.test(imperative[2])) return true;
  for (const re of [YOU_MODAL, I_WOULD]) {
    const m = re.exec(s);
    if (m && !holdIdiom(m[1], m[2])) return true;
  }
  if (RECOMMEND.test(s) && !NEGATED.test(s)) return true;
  return GOOD_TIME.test(s) && !NEGATED.test(s);
}

/** The first of the three things a sentence may never hold, or null. Fenced blocks (Widgets) are read for Blocked numbers only. */
export function guardSentence(sentence: string, facts: GuardFacts): GuardHit | null {
  const blocked = blockedNumbersIn(sentence, facts.blockedNumbers);
  if (blocked.length) return { rule: "blocked_number", sentence, detail: `Blocked numbers ${blocked.join(", ")}` };
  if (FENCE_LINE.test(sentence)) return null;
  const words = appWordsIn(prose(sentence), facts.internalWords);
  if (words.length) return { rule: "internal_word", sentence, detail: `App words ${words.map((w) => `"${w}"`).join(", ")}` };
  if (tellsToBuyOrSell(sentence)) return { rule: "advice", sentence, detail: "Tells the Learner to buy, sell or hold something" };
  return null;
}

/**
 * Holds streamed text to sentence ends and tests each whole sentence before it shows. A fenced block (a Widget) is held
 * until its closing fence and shown whole, so the browser never draws half a Widget. After a hit it shows nothing more.
 */
export class StreamGuard {
  private buffer = "";
  private stopped: GuardHit | undefined;

  constructor(private readonly facts: GuardFacts) {}

  /** The hit that stopped the stream, if one did. */
  get hit(): GuardHit | undefined {
    return this.stopped;
  }

  /** Takes the next streamed text; gives back every whole sentence that passed, and the hit if one did not. */
  push(text: string): GuardStep {
    if (this.stopped) return { show: "" };
    this.buffer += text;
    return this.release(false);
  }

  /**
   * The end of a loop step's text (or of the reply): what is left is a sentence too, tested and shown or stopped on.
   * The next step's text starts a new sentence.
   */
  end(): GuardStep {
    if (this.stopped) return { show: "" };
    return this.release(true);
  }

  private release(final: boolean): GuardStep {
    let show = "";
    for (;;) {
      const cut = this.nextCut(final);
      if (cut === null) break;
      const piece = this.buffer.slice(0, cut);
      const hit = piece.trim() ? guardSentence(piece, this.facts) : null;
      if (hit) {
        this.stopped = hit;
        this.buffer = "";
        return { show, hit };
      }
      show += piece;
      this.buffer = this.buffer.slice(cut);
    }
    return { show };
  }

  /**
   * Where the next piece to test ends in the buffer: after a sentence end or a line break, or after a whole fenced block;
   * null while the buffer holds no whole piece yet. At the end, the whole buffer is one piece.
   */
  private nextCut(final: boolean): number | null {
    if (!this.buffer) return null;
    const fence = fenceStart(this.buffer);
    if (fence === 0) {
      const close = fenceEnd(this.buffer);
      if (close !== null) return close;
      return final ? this.buffer.length : null;
    }
    // Sentences before a fence are cut as usual; the fence waits for its own turn.
    const upTo = fence ?? this.buffer.length;
    const head = this.buffer.slice(0, upTo);
    const newline = head.indexOf("\n");
    SENTENCE_END.lastIndex = 0;
    const end = SENTENCE_END.exec(head);
    // The end takes the space after it, so a Citation marker or a closing quote still to come cannot belong to it.
    const sentence = end ? end.index + end[0].length : null;
    const line = newline >= 0 ? newline + 1 : null;
    const first = [sentence, line].filter((n): n is number => n !== null).sort((a, b) => a - b)[0];
    if (first !== undefined) return first;
    if (fence !== null) return fence;
    return final ? this.buffer.length : null;
  }
}

/** Where the first fence line starts in the text (at the start of a line), or null. */
function fenceStart(text: string): number | null {
  const m = /(^|\n)[ \t]*```/.exec(text);
  if (!m) return null;
  return m.index + m[1].length;
}

/** Where the fenced block opening the text ends, after its closing fence line (and the line break after it), or null. */
function fenceEnd(text: string): number | null {
  const open = text.indexOf("\n");
  if (open < 0) return null;
  const close = /(^|\n)[ \t]*```[^\n]*(\n|$)/.exec(text.slice(open + 1));
  if (!close) return null;
  const end = open + 1 + close.index + close[0].length;
  // A closing fence at the very end of the buffer may still have text to come on its line.
  if (!close[2] && end === text.length) return null;
  return end;
}
