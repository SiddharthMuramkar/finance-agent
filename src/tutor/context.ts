import type { CaseData, CaseDataset } from "@/case-data/case-data";
import { REFERENCE_CASE } from "@/case-data/reference";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages";
import { isConverted, type ConceptCard, type Insight, type Piece } from "@/course/map";
import { plainFormulaText as plain } from "@/finance/formula-text";
import type { ExploreInfo } from "@/learner/insight";
import { formulaById, formulaGuide } from "@/finance/formulas";
import { practiceStep, stepSetting, TEACHING_STEPS, type Place } from "@/course/navigator";
import { describeCondition, writtenAheadWidgets } from "@/course/written-ahead";
import { exploreWidgetOf } from "@/course/explore-widget";
import { WIDGET_CHECK_PREFIX, widgetTaskTexts } from "@/widgets/check";
import { PROFILE_BLOCK_HEADING } from "@/learner/profile";
import { PASTE_PREFIX, type PasteSummary } from "./pasted";
import { OPENER_PREFIX } from "./turn-status";
import type { TurnFacts } from "./turn-facts";

/** Turns at explore with no attempt before the context reminds the Tutor to put the question. */
export const IDLE_TURNS_BEFORE_REMINDER = 2;

const AFTER_REVEAL =TEACHING_STEPS.indexOf("reveal");

/** A Concept card as the Tutor reads it: its title, its lines and the line to write down. */
export function cardText(card: ConceptCard): string {
  return `"${card.title}": ${card.lines.join(" ")} Write down: ${card.writeDown}`;
}

/** The Concept card code shows at this place: at the Concept step of a converted Topic's Check that has one. */
function shownCard(place: Pick<Place, "topic" | "step" | "check">): ConceptCard | undefined {
  return place.step === "concept" && isConverted(place.topic) ? place.check?.card : undefined;
}

/** What the Tutor is told at a converted Concept step: code showed the card and its Widget; the Tutor adds one sentence and one ask. */
const CARD_SHOWN = "Code has shown this Concept card and its Widget in the conversation, already set to the card's numbers. Add one sentence and one ask; never write your own version of the card.";

/** What the Tutor is told at a converted Your turn: code shows and marks the Quick tries, and finishes the step. */
const QUICK_TRIES =
  "Your turn: code shows Quick tries one at a time under your reply and marks each answer at once. Write no practice questions of your own and never mark an answer. Code finishes this step once every idea of the Check has two right answers in a row; you cannot finish it.";

/**
 * The note code writes for an opener (no Learner message comes with it): teach the Learner's saved step.
 * The Story in a Topic not yet started; otherwise the step reached, which nothing in this Session has
 * taught yet; at an open quiz, point the Learner to the Check tab, where it already shows, and offer help now.
 * With this turn's facts, the note also names the numbers to keep away from.
 */
export function openerNote(place: Place | null, { quizOpen }: { quizOpen: boolean }, facts?: TurnFacts): string {
  const lead = `${OPENER_PREFIX} the Learner has just opened this Topic, and this turn was started by the page; the Learner has written nothing yet.`;
  if (!place) return `${OPENER_PREFIX} the Learner has passed every Topic on the Course Map and opened the Study Workspace; they have written nothing yet. Greet them in a sentence or two and invite their questions.`;
  if (place.status === "not_started") return `${lead} They have not started it. Teach the Story step now: open the Topic with its Case's story.`;
  const at = place.check ? `Check ${place.topic.checks.indexOf(place.check) + 1} of ${place.topic.checks.length}` : null;
  const resumed = `${lead} They had already started it and are at the ${place.step.replace("_", " ")} step${at ? `, for ${at}` : ""}. Nothing of this step has been taught in this Session yet.`;
  if (quizOpen && at) {
    const blocked = facts?.blockedNumbers.length ? ` Keep away from these numbers: ${facts.blockedNumbers.join(", ")}.` : "";
    return `${resumed} The quiz for ${at} is open on the right, in the Check tab. Point the Learner to it in a sentence or two, and offer help now: you may teach the idea, show a Widget or start again, with numbers that are not in its questions. Never give or confirm the answer to an open question.${blocked}`;
  }
  if (shownCard(place)) return `${resumed} Code shows this step's Concept card and its Widget as this turn starts: add one sentence and one ask.`;
  if (practiceStep(place.topic, place.step, place.check)) return `${resumed} Code shows the next Quick try as this turn starts: welcome them back in a sentence and point to it.`;
  return `${resumed} Teach this step afresh.`;
}

/**
 * What the Tutor is told when a move passed the Topic (its Principle, or its last Due Check): stop. It has
 * no context for another Topic, and code starts none; the Learner chooses where to go next.
 */
export function topicCompleteContext(title: string): string {
  return `Topic complete: stop here. Code has recorded ${title} as passed. Close the Topic in a sentence or two. Do not start, teach or preview another Topic: the Learner chooses where to go next.`;
}

/**
 * The line that tells the Tutor which Widgets are open in the panel, by title, and how to update one in place:
 * code replaces a Widget written again under the same title in its own tab. Null when none is open.
 */
export function openWidgetsNote(titles: readonly string[]): string | null {
  if (!titles.length) return null;
  return `Open Widgets (tabs in the Widget panel): ${titles.map((t) => `"${t}"`).join(", ")}. To change one, write it again in full under exactly the same title: code replaces it in its tab. Draw a new Widget only for a new idea, never a near-copy under a new title, and never draw the same Case Data as an open Widget.`;
}

/**
 * The line that tells the Tutor the current Topic's written-ahead Widgets, by title and id, and that it opens one with
 * open_widget rather than drawing its own version. Null for a Topic with none.
 */
export function writtenAheadNote(widgets: readonly { id: string; title: string }[]): string | null {
  if (!widgets.length) return null;
  return `Written-ahead Widgets for this Topic (open one with open_widget; never draw your own version): ${widgets.map((w) => `"${w.title}" (id ${w.id})`).join(", ")}.`;
}

/**
 * The Teaching Step context code sends the Tutor as an appended message. The
 * Case's outcome is included only from the reveal on, so hindsight is withheld
 * by code as well as by instructions. With this turn's facts (turn-facts.ts) it also names the word limit, the
 * currency, the Reply kind and, at an open quiz, the blocked numbers; without them those lines are left out.
 */
export function stepContext(
  place: Place | null,
  caseData: CaseData[] = [],
  pastes: PasteSummary = { count: 0, words: 0 },
  /** The current quiz Check's questions cannot be found, so no quiz is shown (see `quizUnavailable`). */
  quizUnavailable = false,
  /** The Topic's Insight attempts so far, for the explore and principle steps. */
  explore?: ExploreInfo,
  /** This turn's facts. */
  facts?: TurnFacts,
): string {
  if (!place) return "Course Navigator: every Topic on the Course Map is passed. Answer the Learner's questions.";
  const { topic, step, check } = place;
  const revealed = TEACHING_STEPS.indexOf(step) >= AFTER_REVEAL;
  const lines = [
    "Course Navigator: where the Learner is now.",
    `Topic: ${topic.title} (${topic.stage} Stage).`,
    `Teaching Step: ${step}${check ? ` (Check ${topic.checks.indexOf(check) + 1} of ${topic.checks.length}: ${check.id})` : ""}.`,
  ];
  if (facts) lines.push(...factLines(facts, step));
  if (topic.goal) lines.push(`Topic goal (the Learner sees this line in the Topic bar): ${plain(topic.goal)}`);
  if (topic.terms.length) {
    lines.push(`Terms this Topic introduces (define any you use where it first appears): ${topic.terms.map((t) => `${t.term}: ${plain(t.means)}`).join(" ")}`);
  }
  lines.push(...stepSettingLines(place));
  const formulas = topic.formulas.flatMap((id) => formulaById(id) ?? []);
  if (formulas.length) {
    lines.push(
      `Formulas this Topic teaches (show each only as a FormulaCard widget; describe any other formula in words, never with typed symbols): ${formulas.map(formulaGuide).join(" ")}`,
    );
  }
  if (place.unmetPrerequisites.length) lines.push(`Prerequisites not yet passed: ${place.unmetPrerequisites.join(", ")}.`);
  for (const c of topic.cases) {
    lines.push("", `Case: ${c.title}, as of ${c.asOf}.`, `Story (only what was known on ${c.asOf}): ${plain(c.story.trim())}`);
    if (c.piece) lines.push(...pieceLines(c.piece, pastes));
    if (revealed) lines.push(`Reveal (what happened): ${plain(c.reveal.trim())}`);
    lines.push(...caseDataLines(caseData.find((d) => d.caseId === c.id)));
  }
  lines.push(...referenceLines(caseData.find((d) => d.caseId === REFERENCE_CASE)));
  const card = shownCard(place);
  const practice = practiceStep(topic, step, check);
  // The card goes in place of the concept text; with this turn's facts it is already in their lines, so it is not written twice.
  if (card) lines.push("", ...(facts?.card ? [] : [`Concept card on screen: ${plain(cardText(card))}`]), CARD_SHOWN);
  else if (practice && check?.card) lines.push("", `Concept card (on screen earlier): ${plain(cardText(check.card))}`, QUICK_TRIES);
  else if (step === "concept" || step === "explore" || step === "your_turn") lines.push("", `Concept: ${plain(topic.concept.trim())}`);
  if (practice && !check?.card) lines.push(QUICK_TRIES);
  if (step === "explore" && topic.insight) lines.push(...exploreLines(topic.insight, explore, exploreWidgetOf(topic)?.code));
  // A Check's prompt and pass criteria go to the Tutor only while that Check is current.
  if (check && step === "check") {
    if (check.kind === "conversation") {
      lines.push(
        "",
        `Check prompt: ${plain(check.prompt.trim())}`,
        `Pass criteria: ${plain(check.passCriteria.trim())}`,
        "While this Check is open, teach with numbers other than the prompt's, and never state the reasoning the pass criteria ask for about the prompt's own move: that is the Learner's to give.",
      );
    } else if (quizUnavailable) {
      lines.push(
        "",
        `Check: quiz ${check.id}, but the quiz for this Check cannot be shown: too few of its questions can be found, so the Learner sees no quiz and no Check tab. Check the Learner in conversation instead: ask them to explain the Concept below in their own words and apply it to a small example of your own, and question their reasoning. Do not mention a quiz or a Check tab.`,
        `Concept: ${plain(topic.concept.trim())}`,
      );
    } else {
      lines.push(
        "",
        `Check: quiz ${check.id}. Code shows the questions on the right, in the Check tab, and marks the answers; the Learner answers there. Code sends you the result in your next turn: after a miss, code starts that turn itself so you can go over what was missed.`,
        "While the quiz is open, help freely: teach the idea, show a Widget or start again from the beginning, using numbers that are not in the open questions. Never give or confirm the answer to an open question, and never mark anything yourself; show the method on other numbers instead.",
        ...(facts?.blockedNumbers.length ? [`Blocked numbers (in the open quiz questions and the next attempt's): ${facts.blockedNumbers.join(", ")}.`] : []),
        facts?.card ? `Concept card: ${plain(facts.card.trim())}` : `Concept: ${plain(topic.concept.trim())}`,
      );
    }
  }
  if (step === "principle") {
    lines.push("", `Principle: ${plain(topic.principle.trim())}`);
    if (topic.insight && explore?.words) {
      lines.push(`The Learner's own words about the Insight (${explore.settled === "told" ? "after being told it" : "found by themselves"}): "${explore.words}". Tie the principle back to them.`);
    }
    if (topic.connections.length) {
      lines.push(
        "",
        "Connections: after the principle, give the Learner these links from this Topic's idea to others, in your own words and in this order. Link each to its Course Map Topic by title, and add no figures of your own.",
        ...topic.connections.map((c, i) => `${i + 1}. ${plain(c.text.trim())} (links to: ${c.titles.join("; ")})`),
      );
    }
  }
  lines.push(
    "",
    step === "explore" && !explore?.settled
      ? "You cannot finish explore yet: code accepts it only once record_insight_attempt has recorded the Insight as found or told."
      : practice
      ? "Do not call finish_teaching_step for your_turn: code finishes it from the Quick tries."
      : step !== "check"
      ? `When this Teaching Step is done, call finish_teaching_step with step "${step}".`
      : check && quizUnavailable
        ? `When you can judge whether the Learner understands the Concept, call record_check_verdict with check_id "${check.id}", verdict "pass" or "not_yet", and your reasons. Never tell the Learner they passed unless code says a pass was recorded.`
        : check?.kind === "conversation"
        ? `Put the Check prompt to the Learner and question their reasoning. When you can judge it against the pass criteria, call record_check_verdict with check_id "${check.id}", verdict "pass" or "not_yet", and your reasons. Never tell the Learner they passed unless code says a pass was recorded.`
        : "Code records the quiz result; you cannot finish this step yourself. Never tell the Learner they passed unless code says a pass was recorded. If the Learner asks about the quiz, help now with other numbers, and point them to the quiz on the right, in the Check tab.",
  );
  if (!revealed) lines.push("Do not reveal or hint at the Case's outcome before the reveal step.");
  return lines.join("\n");
}

const CURRENCY_NAMES: Record<string, string> = { INR: "₹ (rupees)", USD: "$ (dollars)" };
const currencyName = (code: string) => CURRENCY_NAMES[code] ?? code;

/**
 * The lines code writes from this turn's facts: the word limit, the currency, and the Reply kind, method, frustration
 * count and Concept card whenever code knows them. (The blocked numbers and, at a quiz Check, the card go with the quiz's lines.)
 */
function factLines(facts: TurnFacts, step: Place["step"]): string[] {
  const others = facts.caseCurrencies.filter((c) => c !== facts.exampleCurrency);
  const lines = [
    `Word limit for this reply: ${facts.cap} words.`,
    `Currency for everyday examples and Widgets: ${currencyName(facts.exampleCurrency)}.${others.length ? ` The Case's own figures stay in ${others.map(currencyName).join(" and ")}.` : ""}`,
  ];
  if (facts.replyKind) lines.push(`Reply kind: ${facts.replyKind}.`);
  if (facts.method) lines.push(`Method for this reply: ${facts.method}.`);
  if (facts.frustration) lines.push(`Frustration: ${facts.frustration}. Acknowledge it in eight words or fewer, then give a smaller step.`);
  if (facts.card && step !== "check") lines.push(`Concept card on screen (code showed it; never write your own version): ${plain(facts.card.trim())}`);
  return lines;
}

/**
 * What this Topic's file says the current step does by itself: the Widget code opened when the step began (so the Tutor
 * points to it and does not open or draw one), and the Widget condition that finishes the step.
 */
function stepSettingLines({ topic, step, check }: Place): string[] {
  const setting = stepSetting(topic, step, check);
  if (!setting) return [];
  const lines: string[] = [];
  const opened = setting.opens ? writtenAheadWidgets(topic).find((w) => w.id === setting.opens) : undefined;
  if (opened) {
    lines.push(
      `Code opened the Widget "${opened.title}" (id ${opened.id}) when this step began: it is in the Widget panel, with a chip in the conversation. Point the Learner to it; do not call open_widget for it or draw a Widget of your own for the same idea.`,
    );
  }
  if (setting.doneWhen) {
    lines.push(
      `This step is done once the Learner has ${describeCondition(topic, setting.doneWhen)}; code sees that itself and offers Next. React to what they did, and do not ask them to report it.`,
    );
  }
  return lines;
}

/**
 * The line that tells the Tutor to mark an answer that leaves the Topic as an Off-Topic answer. Not part of the step
 * context until the Tutor has a tool that stores the block (storeOffTopic in off-topic.ts); then it is added with that tool.
 */
export function offTopicNote(title: string): string {
  return `When your answer leaves ${title} (the Learner asked about something else), answer it briefly and mark it as an Off-Topic answer; code then draws a quiet block with a way back. Never move the Learner to another Topic, and return to the current Teaching Step in one line.`;
}

/**
 * The Guided Tasks under the explore Widget, as the Learner reads them. They tick themselves in the
 * browser, are practice only, and say nothing the Tutor needs to mark.
 */
function guidedTaskLines(widgetCode: string | undefined): string[] {
  const tasks = widgetCode ? widgetTaskTexts(widgetCode) : [];
  if (!tasks.length) return [];
  return [
    `Guided Tasks under the Explore Widget (they tick themselves, in order, as the Learner moves the slider; practice only): ${tasks.map((t, i) => `${i + 1}. ${t}`).join(" ")} You can point the Learner to them, but do not mark them, ask the Learner to report them done, or treat a ticked task as their Insight.`,
  ];
}

/**
 * The explore step's lines. The written Insight appears only once it is settled (found or told);
 * until then the Tutor has the question, how to tell it is found, and the hints already released.
 */
function exploreLines(insight: Insight, explore: ExploreInfo | undefined, widgetCode: string | undefined): string[] {
  const lines = [
    "",
    widgetCode
      ? "Explore: the Learner finds this Topic's Insight by playing with the Topic's own Explore Widget. Code has put it on screen already, in the Widget panel as an \"Explore\" chip (and in the conversation column on a narrow screen), and keeps it there until the Topic is passed. Do not draw it yourself; point the Learner to it, then they say what they noticed in their own words."
      : "Explore: the Learner finds this Topic's Insight by playing with the Widget you drew at the concept step (keep it available), then says what they noticed in their own words.",
    ...guidedTaskLines(widgetCode),
    `Insight question: ${insight.question.trim()}`,
    `The Insight is found when: ${insight.foundWhen.trim()}`,
  ];
  if (explore?.settled) {
    lines.push(
      `The Insight is settled (${explore.settled === "told" ? "the Learner was told it" : "the Learner found it"}). Written Insight: ${insight.written.trim()}`,
      ...(explore.words ? [`The Learner's words: "${explore.words}".`] : []),
    );
    return lines;
  }
  lines.push(
    explore?.hints.length ? `Hints released so far: ${explore.hints.map((h, i) => `hint ${i + 1}: ${h.trim()}`).join(" ")}` : "No hint has been released yet.",
    "Put the question to the Learner, then wait for their own words. Do not state, paraphrase or hint at the Insight yourself, and do not draw a conclusion for them. When they answer, call record_insight_attempt with outcome found, not_yet or asked_to_be_told (when they ask you to just tell them), and their words copied exactly from their message this turn. A turn code started when the Learner pressed a button (Next, Finish this reply), with no words of theirs, is not an attempt. Code replies with the hint or the written Insight; write your confirmation or hint after that result, as the final text of your reply.",
  );
  if ((explore?.idleTurns ?? 0) >= IDLE_TURNS_BEFORE_REMINDER) {
    lines.push(`Reminder: the Learner has not yet tried the question after ${explore!.idleTurns} turns at explore. Put the Insight question to them now, point them to the Widget, and invite their own words.`);
  }
  return lines;
}

/**
 * Where the Tutor gets a studied piece's text: the Library through the source filter, or only what
 * the Learner has pasted in this Session, counted by code so the Tutor knows what it has seen.
 */
function pieceLines(piece: Piece, pastes: PasteSummary): string[] {
  const lines = [`Piece studied: ${piece.author}, "${piece.title}", published ${piece.published} (${piece.url}). The Learner reads the piece itself; you walk its argument step by step with them.`];
  if (piece.from === "paste") {
    lines.push(
      "Its text is not in the Library and you cannot fetch it: you see only what the Learner pastes into this Session, from the writer's own site.",
      pastes.count
        ? `Passages the Learner pasted in this Session: ${pastes.count} (${pastes.words} words), each in a Learner message marked "${PASTE_PREFIX.split(" (")[0]}". Work only from those passages. If the Learner refers to a part you have not been given, say plainly that you have not seen it and ask them to paste it; never describe, quote or summarise unseen parts from memory.`
        : "The Learner has not pasted any of it in this Session, so you have not seen its text. Ask them to paste the part being studied, and do not describe, quote or summarise the piece from memory.",
    );
    return lines;
  }
  lines.push(
    `Its text is in the Library: call search_library with source "${piece.librarySource}" and words from the part you are discussing (never the writer's name), and work from the passages it returns. Quote only short passages with credit, within the limit the search result gives, and put the rest in your own words. If a search does not return the part the Learner means, say plainly that you have not seen that passage rather than reconstructing it from memory.`,
  );
  return lines;
}

/** A series this long is summarised by its first and last points; shorter ones are listed in full. */
const LISTED_POINTS = 5;

function describeDataset(caseId: string, d: CaseDataset): string {
  const points =
    d.points.length <= LISTED_POINTS
      ? d.points.map((p) => `${p.date} ${p.value}`).join("; ")
      : `${d.points.length} points from ${d.points[0].date} (${d.points[0].value}) to ${d.points.at(-1)!.date} (${d.points.at(-1)!.value})`;
  return `- "${caseId}/${d.id}": ${d.label} (${d.unit}): ${points}. Source: ${d.source}.`;
}

/**
 * The reference datasets (real, sourced series that belong to no Case), as a short block: id, label, unit
 * and latest date. The series are already under the as-of rule for the Learner's current Topic.
 */
function referenceLines(data: CaseData | undefined): string[] {
  if (!data?.datasets.length) return [];
  return [
    "",
    'Reference data you can show in any Topic (real, sourced series, read as Query("case_data", {dataset: "reference/<id>"}, …); never type these figures yourself):',
    ...data.datasets.map((d) => `- "reference/${d.id}": ${d.label} (${d.unit}), latest ${d.points.at(-1)!.date}.`),
  ];
}

/**
 * The Case Data lines of the context: which checked datasets the Tutor may show, already under
 * the as-of rule. These are the only historical figures the Tutor has for the Case.
 */
function caseDataLines(data: CaseData | undefined): string[] {
  const missing = "If the Learner asks for data that is not listed, say plainly that it is not available here; never estimate or recall historical figures.";
  if (!data?.datasets.length) return [`Case Data: none is available for this Case. ${missing}`];
  return [
    'Case Data you can show, in widgets through Query("case_data", …) or HistoryChart (checked, sourced datasets):',
    ...data.datasets.map((d) => describeDataset(data.caseId, d)),
    `These are the only historical figures you have for this Case. ${missing}`,
  ];
}

/**
 * The context for a Learner who is still at a Check after a turn that recorded
 * no verdict: a note first, then the usual context, so it still ends the same.
 */
export function noVerdictContext(
  place: Place & { check: NonNullable<Place["check"]> },
  caseData: CaseData[] = [],
  pastes?: PasteSummary,
  /** This turn's facts, passed on to `stepContext`. */
  facts?: TurnFacts,
): string {
  // A Check step never needs explore info, which is why none is taken here.
  return `No verdict was recorded for Check ${place.check.id} in the last turn, so the Learner is still at this Check.\n${stepContext(place, caseData, pastes, false, undefined, facts)}`;
}

/**
 * Opens the "Where the Learner stands" block: the Learner's summary and Learner Profile. It opens the
 * Session's first message, and is sent again, as a new message, whenever it changes.
 */
export const OPENING_PREFIX = "Where the Learner stands:";

/** The Where the Learner stands block, from the Learner summary and the Learner Profile block (if shared). */
export function standsBlock(summary: string, profile: string | null): string {
  return `${OPENING_PREFIX}\n${summary}${profile ? `\n\n${profile}` : ""}`;
}

/**
 * Whether the latest Where the Learner stands block in these messages is this one. A sent block is
 * followed by a blank line and the rest of its message (a quiz result, the Course Navigator context).
 */
export function standsAlreadySent(msgs: BetaMessageParam[], stands: string): boolean {
  const sent = lastStandsSent(msgs);
  if (sent === undefined || !(sent === stands || sent.startsWith(`${stands}\n\n`))) return false;
  // A block without a profile is a prefix of the same block with one.
  return !sent.slice(stands.length + 2).startsWith(PROFILE_BLOCK_HEADING);
}

/** The last message text that holds a Where the Learner stands block: a context message, or a Session's first message. */
function lastStandsSent(msgs: BetaMessageParam[]): string | undefined {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const { role, content } = msgs[i];
    if (role === "system" && typeof content === "string" && content.startsWith(OPENING_PREFIX)) return content;
    if (role === "user" && Array.isArray(content)) {
      const opening = content.find((b) => b.type === "text" && b.text.startsWith(OPENING_PREFIX));
      if (opening && opening.type === "text") return opening.text;
    }
  }
  return undefined;
}

/** Every Course Navigator context contains this; other tool results (such as a saved misconception) do not. */
export const CONTEXT_MARK = "Course Navigator:";

/** The last Course Navigator context the Tutor saw: a context message (which may open with a summary) or a finish_teaching_step result. */
export function lastContextSent(msgs: BetaMessageParam[]): string | undefined {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const { role, content } = msgs[i];
    if (role === "system" && typeof content === "string") return content;
    if (role === "user" && Array.isArray(content)) {
      const result = content.findLast(
        (b) => b.type === "tool_result" && !b.is_error && typeof b.content === "string" && b.content.includes(CONTEXT_MARK),
      );
      if (result && result.type === "tool_result") return result.content as string;
      const opening = content.find((b) => b.type === "text" && b.text.startsWith(OPENING_PREFIX));
      if (opening && opening.type === "text") return opening.text;
    }
  }
  return undefined;
}

/**
 * Whether the last turn ended with the Tutor at this Check (its last context was this Check's)
 * without a verdict for it being recorded.
 */
export function endedAtCheckWithoutVerdict(msgs: BetaMessageParam[], checkId: string, checkContext: string): boolean {
  if (!lastContextSent(msgs)?.endsWith(checkContext)) return false;
  const learner = msgs.findLastIndex(
    ({ role, content }) =>
      role === "user" &&
      (typeof content === "string" ? !content.startsWith(WIDGET_CHECK_PREFIX) : content.some((b) => b.type === "text")),
  );
  const turn = msgs.slice(Math.max(learner, 0));
  const verdictCalls = new Set(
    turn.flatMap(({ role, content }) =>
      role === "assistant" && Array.isArray(content)
        ? content.flatMap((b) =>
            b.type === "tool_use" && b.name === "record_check_verdict" && (b.input as { check_id?: unknown }).check_id === checkId ? [b.id] : [],
          )
        : [],
    ),
  );
  const recorded = turn.some(
    ({ role, content }) =>
      role === "user" && Array.isArray(content) && content.some((b) => b.type === "tool_result" && !b.is_error && verdictCalls.has(b.tool_use_id)),
  );
  return !recorded;
}
