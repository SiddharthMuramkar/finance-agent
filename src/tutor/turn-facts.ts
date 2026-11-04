import { and, asc, eq, inArray } from "drizzle-orm";
import type { CourseMap, QuizCheck, Topic } from "@/course/map";
import type { Place } from "@/course/navigator";
import { selectQuestions } from "@/course/quiz";
import { questionLookup } from "@/bank/lookup";
import { caseDatasets, quizAttempts } from "@/db/schema";
import type { Db } from "@/db/types";
import { quizUnavailable } from "@/learner/quiz";
import { GO_DEEPER, OLD_CHIP_MESSAGES } from "./chips";
import { cardForFacts, ladderFacts } from "./practice";
import { blockedNumbersFrom, capFor, type OpenItem, type ReplyCheckContext, type ReplyKind, type ReplyWidget, type StepKind } from "./reply-checks";
import { isCodeWritten } from "./turn-status";

/**
 * Turn facts (spec #229, ticket #238): what code knows about this Tutor Turn before the Tutor writes a word, worked out
 * once per turn. The Course Navigator context names them to the Tutor (the word limit, the currency, the blocked
 * numbers), and the reply checks read the same object, so the Tutor is told exactly the limits its reply is held to.
 */
export interface TurnFacts {
  step: StepKind;
  /** Code's choice of Reply kind, when it knows it: today only from the Learner's own words (Go deeper, simpler). */
  replyKind?: ReplyKind;
  /** The word limit for this reply: `capFor(step, replyKind)`. The reply checks hold the reply to it. */
  cap: number;
  /**
   * A tighter word limit some Reply kinds get (`AIMS`, ticket #248), which the context names in place of the cap. The
   * reply checks still allow the cap, so a reply a few words over the aim is shown, not retried.
   */
  aim?: number;
  /** The currency of everyday examples and non-Case Widgets, such as "INR". */
  exampleCurrency: string;
  /** The currencies the Topic's Cases give amounts in, such as ["USD"]. */
  caseCurrencies: string[];
  /** The Learner is at a quiz Check whose quiz can be shown. */
  quizOpen: boolean;
  /** The open attempt's questions and the next attempt's (`openQuizItems`); empty when no quiz is open. */
  openItems: OpenItem[];
  /** Every number in the open items: `blockedNumbersFrom(openItems)`. */
  blockedNumbers: string[];
  /** Ids the Learner must never read: the Topic's, its Checks', its questions' and its Widgets'. */
  internalWords: string[];
  /** The method code picked for the next try, once the ladder exists (filled by a later ticket). */
  method?: string;
  /** Code's frustration count (filled by a later ticket). */
  frustration?: number;
  /** The Concept card on screen at this step (filled by a later ticket). */
  card?: string;
  /** At a converted Your turn or Check: each Skill's state in one plain line (fluent or not, misses in a row, last Known mistake). */
  skillLines?: string[];
  /** While a Skill of the current Check is parked: when it comes back, and what the Tutor may still do. */
  parked?: string;
}

/** The currency every Topic's everyday examples use until its file names one (spec #229: ₹ by default). */
export const DEFAULT_EXAMPLE_CURRENCY = "INR";

/**
 * The tighter word limits (ticket #248, from TUTOR_SPEC section 7): 60 words after a miss (feedback or a re-teach) and
 * for a request for the answer (hint), 40 for a quiz-me ask (quick_try). The Tutor writes up to the limit it is told,
 * so these replies are told their own; every other reply is told its step's cap.
 */
export const AIMS: Partial<Record<ReplyKind, number>> = { feedback: 60, reteach: 60, hint: 60, quick_try: 40 };

/**
 * The Reply kind a Learner's own words ask for: the Go deeper chip, a request for something simpler, a quiz-me ask, or a
 * request for the answer. A note code wrote is never the Learner's words.
 */
export function replyKindOf(learnerText?: string): ReplyKind | undefined {
  const text = learnerText?.trim();
  if (!text || isCodeWritten(text)) return undefined;
  if (text === GO_DEEPER) return "go_deeper";
  if ((OLD_CHIP_MESSAGES as readonly string[]).includes(text) || /\b(?:simpler|more simply)\b/i.test(text)) return "simpler";
  if (/\b(?:ask|quiz|test) me\b/i.test(text)) return "quick_try";
  if (/\b(?:tell|give|show) me the answers?\b|\bwhat(?:'s| is) the answer\b/i.test(text)) return "hint";
  return undefined;
}

/** This turn's facts, for the Learner's place (null once every Topic is passed) and the words that started the turn. */
export async function turnFacts(db: Db, map: CourseMap, learnerId: number, place: Place | null, turn?: { learnerText?: string }): Promise<TurnFacts> {
  const step: StepKind = place?.step ?? "none";
  // The repair ladder (ticket #245): the Reply kind and method code chose, the frustration count, Skill state and parking.
  const ladder = await ladderFacts(db, map, learnerId, place, turn?.learnerText);
  const replyKind = replyKindOf(turn?.learnerText) ?? ladder.replyKind;
  const check = place?.step === "check" && place.check?.kind === "quiz" ? place.check : null;
  const quizOpen = check !== null && !(await quizUnavailable(db, map, check));
  const openItems = quizOpen && check ? await openQuizItems(db, map, learnerId, check) : [];
  const currencies = place ? await topicCurrencies(db, place.topic) : { exampleCurrency: DEFAULT_EXAMPLE_CURRENCY, caseCurrencies: [] };
  // The Concept card code shows (a converted Concept step) or teaches from (a converted quiz Check).
  const card = cardForFacts(place);
  const cap = capFor(step, replyKind);
  const aim = replyKind && AIMS[replyKind];
  return {
    step,
    ...(replyKind && { replyKind }),
    cap,
    ...(aim && aim < cap && { aim }),
    ...currencies,
    quizOpen,
    openItems,
    blockedNumbers: blockedNumbersFrom(openItems),
    internalWords: place ? internalWordsOf(place.topic) : [],
    ...(card && { card }),
    ...(ladder.method && { method: ladder.method }),
    ...(ladder.frustration && { frustration: ladder.frustration }),
    ...(ladder.skillLines.length && { skillLines: ladder.skillLines }),
    ...(ladder.parked && { parked: ladder.parked }),
  };
}

/** The context the reply checks take, from this turn's facts; the caller may set the Reply kind it chose and the Widget validator. */
export function replyCheckContext(f: TurnFacts, o: { replyKind?: ReplyKind; widgetOk?: (w: ReplyWidget) => string | null } = {}): ReplyCheckContext {
  const replyKind = o.replyKind ?? f.replyKind;
  return {
    step: f.step,
    ...(replyKind && { replyKind }),
    exampleCurrency: f.exampleCurrency,
    caseCurrencies: f.caseCurrencies,
    openItems: f.openItems,
    internalWords: f.internalWords,
    ...(o.widgetOk && { widgetOk: o.widgetOk }),
  };
}

/**
 * The questions whose answers the Tutor keeps back at this quiz Check: the open attempt's, plus the next attempt's
 * (whose questions are already fixed by `selectQuestions`). After a miss, with no attempt open, only the next one's.
 * It reads rows only and never makes an attempt. Ids resolve through the Course Map and the Question Bank; one that
 * neither holds is skipped. Each item's answer is the right choice's text (or the key as it is, when no choice has it).
 */
export async function openQuizItems(db: Db, map: CourseMap, learnerId: number, check: QuizCheck): Promise<OpenItem[]> {
  const rows = await db
    .select({ attemptNo: quizAttempts.attemptNo, questionIds: quizAttempts.questionIds, submittedAt: quizAttempts.submittedAt })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.learnerId, learnerId), eq(quizAttempts.checkId, check.id)))
    .orderBy(asc(quizAttempts.id));
  const open = rows.find((r) => r.submittedAt === null);
  // A new attempt is numbered by how many this Learner already has (see `openQuiz`).
  const ids = [...new Set([...(open?.questionIds ?? []), ...selectQuestions(check, rows.length)])];
  const lookup = await questionLookup(db, map, ids);
  return ids.flatMap((id) => {
    const q = lookup.question(id);
    if (!q) return [];
    const answer = q.choices.find((c) => c.id === q.answer)?.text ?? q.answer;
    return [{ prompt: q.prompt.trim(), choices: q.choices.map((c) => c.text), answer }];
  });
}

const USD_IN_STORY = /US\$|\$\s?\d/;
const INR_IN_STORY = /₹\s?\d|\bRs\.?\s?\d/;
const USD_UNIT = /\bUSD\b|US\$|\$|dollar/i;
const INR_UNIT = /\bINR\b|₹|rupee/i;

/**
 * The Topic's currencies, in one place: its everyday-example currency (₹ until Topic files name one) and the
 * currencies its Cases give amounts in, read from `$` or `US$` amounts in each story and from its Case Data units.
 */
async function topicCurrencies(db: Db, topic: Topic): Promise<{ exampleCurrency: string; caseCurrencies: string[] }> {
  const caseIds = topic.cases.map((c) => c.id);
  const units = caseIds.length ? (await db.select({ unit: caseDatasets.unit }).from(caseDatasets).where(inArray(caseDatasets.caseId, caseIds))).map((r) => r.unit) : [];
  const stories = topic.cases.map((c) => c.story);
  const caseCurrencies = [
    ...(stories.some((s) => USD_IN_STORY.test(s)) || units.some((u) => USD_UNIT.test(u)) ? ["USD"] : []),
    ...(stories.some((s) => INR_IN_STORY.test(s)) || units.some((u) => INR_UNIT.test(u)) ? ["INR"] : []),
  ];
  return { exampleCurrency: topic.exampleCurrency ?? DEFAULT_EXAMPLE_CURRENCY, caseCurrencies };
}

/** The ids of a Topic the Learner must never read in a reply. */
function internalWordsOf(topic: Topic): string[] {
  const questionIds = topic.checks.flatMap((c) => (c.kind === "quiz" ? c.questions : []));
  return [...new Set([topic.id, ...topic.checks.map((c) => c.id), ...questionIds, ...topic.widgets.map((w) => w.id)])];
}
