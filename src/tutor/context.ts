import type { CaseData, CaseDataset } from "@/case-data/case-data";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages";
import type { Insight, Piece } from "@/course/map";
import type { ExploreInfo } from "@/learner/insight";
import { formulaById, formulaGuide } from "@/finance/formulas";
import { TEACHING_STEPS, type Place } from "@/course/navigator";
import { WIDGET_CHECK_PREFIX } from "@/widgets/check";
import { PASTE_PREFIX, type PasteSummary } from "./pasted";

/** Turns at explore with no attempt before the context reminds the Tutor to put the question. */
export const IDLE_TURNS_BEFORE_REMINDER = 2;

const AFTER_REVEAL =TEACHING_STEPS.indexOf("reveal");

/** Prefixed to the context in the first turn after the Learner chose a Topic on the Course Map page or went back to the default path. */
export const JUMP_NOTE =
  "The Learner chose this Topic on the Course Map (or went back to the default path), so this is where they are now. Pick up at the Teaching Step below and teach it afresh; nothing of it has been taught in this conversation yet.";

/**
 * The Teaching Step context code sends the Tutor as an appended message. The
 * Case's outcome is included only from the reveal on, so hindsight is withheld
 * by code as well as by instructions.
 */
export function stepContext(
  place: Place | null,
  caseData: CaseData[] = [],
  pastes: PasteSummary = { count: 0, words: 0 },
  /** The current quiz Check's questions cannot be found, so no quiz is shown (see `quizUnavailable`). */
  quizUnavailable = false,
  /** The Topic's Insight attempts so far, for the explore and principle steps. */
  explore?: ExploreInfo,
): string {
  if (!place) return "Course Navigator: every Topic on the Course Map is passed. Answer the Learner's questions.";
  const { topic, step, check } = place;
  const revealed = TEACHING_STEPS.indexOf(step) >= AFTER_REVEAL;
  const lines = [
    "Course Navigator: where the Learner is now.",
    `Topic: ${topic.title} (${topic.stage} Stage).`,
    `Teaching Step: ${step}${check ? ` (Check ${topic.checks.indexOf(check) + 1} of ${topic.checks.length}: ${check.id})` : ""}.`,
  ];
  const formulas = topic.formulas.flatMap((id) => formulaById(id) ?? []);
  if (formulas.length) {
    lines.push(
      `Formulas this Topic teaches (show each only as a FormulaCard widget; describe any other formula in words, never with typed symbols): ${formulas.map(formulaGuide).join(" ")}`,
    );
  }
  if (place.unmetPrerequisites.length) lines.push(`Prerequisites not yet passed: ${place.unmetPrerequisites.join(", ")}.`);
  for (const c of topic.cases) {
    lines.push("", `Case: ${c.title}, as of ${c.asOf}.`, `Story (only what was known on ${c.asOf}): ${c.story.trim()}`);
    if (c.piece) lines.push(...pieceLines(c.piece, pastes));
    if (revealed) lines.push(`Reveal (what happened): ${c.reveal.trim()}`);
    lines.push(...caseDataLines(caseData.find((d) => d.caseId === c.id)));
  }
  if (step === "concept" || step === "explore" || step === "your_turn") lines.push("", `Concept: ${topic.concept.trim()}`);
  if (step === "explore" && topic.insight) lines.push(...exploreLines(topic.insight, explore, Boolean(topic.explore?.widget)));
  // A Check's prompt and pass criteria go to the Tutor only while that Check is current.
  if (check && step === "check") {
    if (check.kind === "conversation") {
      lines.push("", `Check prompt: ${check.prompt.trim()}`, `Pass criteria: ${check.passCriteria.trim()}`);
    } else if (quizUnavailable) {
      lines.push(
        "",
        `Check: quiz ${check.id}, but the quiz for this Check cannot be shown: too few of its questions can be found, so the Learner sees no quiz panel. Check the Learner in conversation instead: ask them to explain the Concept below in their own words and apply it to a small example of your own, and question their reasoning. Do not mention a quiz panel.`,
        `Concept: ${topic.concept.trim()}`,
      );
    } else {
      lines.push(
        "",
        `Check: quiz ${check.id}. Code shows the questions in a panel beside the conversation and marks the answers; the Learner answers there. Do not write quiz questions, hint at answers or mark anything yourself. Code will send you the result with the Learner's next message.`,
      );
    }
  }
  if (step === "principle") {
    lines.push("", `Principle: ${topic.principle.trim()}`);
    if (topic.insight && explore?.words) {
      lines.push(`The Learner's own words about the Insight (${explore.settled === "told" ? "after being told it" : "found by themselves"}): "${explore.words}". Tie the principle back to them.`);
    }
    if (topic.connections.length) {
      lines.push(
        "",
        "Connections: after the principle, give the Learner these links from this Topic's idea to others, in your own words and in this order. Link each to its Course Map Topic by title, and add no figures of your own.",
        ...topic.connections.map((c, i) => `${i + 1}. ${c.text.trim()} (links to: ${c.titles.join("; ")})`),
      );
    }
  }
  lines.push(
    "",
    step === "explore" && !explore?.settled
      ? "You cannot finish explore yet: code accepts it only once record_insight_attempt has recorded the Insight as found or told."
      : step !== "check"
      ? `When this Teaching Step is done, call finish_teaching_step with step "${step}".`
      : check && quizUnavailable
        ? `When you can judge whether the Learner understands the Concept, call record_check_verdict with check_id "${check.id}", verdict "pass" or "not_yet", and your reasons. Never tell the Learner they passed unless code says a pass was recorded.`
        : check?.kind === "conversation"
        ? `Put the Check prompt to the Learner and question their reasoning. When you can judge it against the pass criteria, call record_check_verdict with check_id "${check.id}", verdict "pass" or "not_yet", and your reasons. Never tell the Learner they passed unless code says a pass was recorded.`
        : "Code records the quiz result; you cannot finish this step yourself. Never tell the Learner they passed unless code says a pass was recorded. If the Learner asks, point them to the quiz panel.",
  );
  if (!revealed) lines.push("Do not reveal or hint at the Case's outcome before the reveal step.");
  return lines.join("\n");
}

/**
 * The explore step's lines. The written Insight appears only once it is settled (found or told);
 * until then the Tutor has the question, how to tell it is found, and the hints already released.
 */
function exploreLines(insight: Insight, explore: ExploreInfo | undefined, widgetOnScreen: boolean): string[] {
  const lines = [
    "",
    widgetOnScreen
      ? "Explore: the Learner finds this Topic's Insight by playing with the Topic's own Explore Widget. Code has put it on screen already, in the Widget panel as an \"Explore\" chip (and in the conversation column on a narrow screen), and keeps it there until the Topic is passed. It has an interest-rate slider and the sourced figures. Do not draw it yourself; point the Learner to it, then they say what they noticed in their own words."
      : "Explore: the Learner finds this Topic's Insight by playing with the Widget you drew at the concept step (keep it available), then says what they noticed in their own words.",
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
    "Put the question to the Learner, then wait for their own words. Do not state, paraphrase or hint at the Insight yourself, and do not draw a conclusion for them. When they answer, call record_insight_attempt with outcome found, not_yet or asked_to_be_told (when they ask you to just tell them), and their words copied exactly from their message this turn. Pressing Continue is not an attempt. Code replies with the hint or the written Insight; write your confirmation or hint after that result, as the final text of your reply.",
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
 * The Case Data lines of the context: which checked datasets the Tutor may show, already under
 * the as-of rule. These are the only historical figures the Tutor has for the Case.
 */
function caseDataLines(data: CaseData | undefined): string[] {
  const missing = "If the Learner asks for data that is not listed, say plainly that it is not available here; never estimate or recall historical figures.";
  if (!data?.datasets.length) return [`Case Data: none is available for this Case. ${missing}`];
  return [
    "Case Data you can show, by reference only (checked, sourced datasets):",
    ...data.datasets.map((d) => describeDataset(data.caseId, d)),
    `These are the only historical figures you have for this Case. ${missing}`,
  ];
}

/**
 * The context for a Learner who is still at a Check after a turn that recorded
 * no verdict: a note first, then the usual context, so it still ends the same.
 */
export function noVerdictContext(place: Place & { check: NonNullable<Place["check"]> }, caseData: CaseData[] = [], pastes?: PasteSummary): string {
  // A Check step never needs explore info, which is why none is taken here.
  return `No verdict was recorded for Check ${place.check.id} in the last turn, so the Learner is still at this Check.\n${stepContext(place, caseData, pastes)}`;
}

/** Opens the Session's first message: the Learner's summary and the Course Navigator's context. */
export const OPENING_PREFIX = "Where the Learner stands:";

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
