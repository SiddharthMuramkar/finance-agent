import { and, eq, inArray, max, sql } from "drizzle-orm";
import type { Check, ConceptCard, CourseMap, FixedQuickTry, QuickTry, Topic } from "@/course/map";
import { isConverted, testedSkills } from "@/course/map";
import { finishFromPractice, navigate, practiceStep, type Place, type Progress } from "@/course/navigator";
import { WIDGET_OPENED, writtenAheadWidgets } from "@/course/written-ahead";
import { messages, practiceAnswers, sessionItems, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { recordAnswer, skillStates } from "@/learner/skill-state";
import { loadWidgetStates, saveWidgetState } from "@/learner/widget-state";
import { drawTemplate, markAnswer, type DrawnItem, type FixedItem, type Verdict } from "@/teaching";
import { freshSkillState, isFluent, yourTurnDone, type SkillState } from "@/teaching/ladder";
import { recipeById } from "@/widgets/recipes";
import { WIDGET_SHOWN, type ShownWidget } from "@/widgets/shown-widget";
import { widgetKey } from "@/widgets/widget-state";
import { liveSession } from "./session-log";
import { loadSessionItems, saveItemAfterLatest, stepDivider, type StoredItem } from "./session-items";
import {
  CONCEPT_CARD,
  QUICK_TRY,
  QUICK_TRY_RESULT,
  STEP_DIVIDER,
  type ConceptCardData,
  type QuickTryData,
  type QuickTryResultData,
  type SessionItem,
} from "./session-item-kinds";
import { QUICK_TRY_FOLLOW_UP_PREFIX, turnRunning } from "./turn-status";

/**
 * Practice at Your turn (spec #229, ticket #243). The pure part: which Quick try comes next, and the item a key names.
 * Code shows the tries and marks them with no model call (the database part is below the picker).
 */

/** How many tries a drill has (the return drill after a park). */
export const DRILL_OF = 5;

export type PickOptions = {
  /** Keep to this Skill (a new try after a Known mistake), when it is not fluent. */
  skillId?: string;
  /** Give a half-done try, however many tries the Skill has had. */
  easier?: boolean;
  /** The try is part of a drill of five. */
  drill?: boolean;
  /** The Session the try is shown in: it makes the key unique to the Learner across Sessions. */
  session?: number;
};

/** What a key names: a fixed try by its id, or a template's draw, half-done or full. */
type Ref = { fixed: string } | { template: string; half: boolean };

const refText = (r: Ref) => ("fixed" in r ? r.fixed : `t:${r.template}${r.half ? ":half" : ""}`);

/** A Quick try's key: `qt:<session>:<n>:<ref>`. It names the item, and seeds the draw of a template. */
const keyOf = (session: number, n: number, r: Ref) => `qt:${session}:${n}:${refText(r)}`;

function refOfKey(key: string): Ref | null {
  const parts = key.split(":");
  if (parts[0] !== "qt" || parts.length < 4) return null;
  const rest = parts.slice(3);
  if (rest[0] === "t" && rest[1]) return { template: rest[1], half: rest[2] === "half" };
  return rest.length === 1 && rest[0] ? { fixed: rest[0] } : null;
}

const isFixed = (q: QuickTry): q is FixedQuickTry => "id" in q;

/** The Skills of a Check in card order: as the Topic's Concept cards (this Check's and those before it) list them, then any others. */
function skillsInCardOrder(topic: Topic, check: Check): string[] {
  const tested = testedSkills(topic, check);
  const upTo = topic.checks.slice(0, topic.checks.indexOf(check) + 1);
  const carded = upTo.flatMap((c) => c.card?.skills ?? []).filter((s) => tested.includes(s));
  return [...new Set([...carded, ...tested])];
}

function skillOfTry(topic: Topic, q: QuickTry): string | undefined {
  return isFixed(q) ? q.skill : topic.templates.find((t) => t.id === q.template)?.skill;
}

/**
 * The Quick try to show next at a converted Your turn, or null once every Skill of the Check is fluent (or has no
 * tries). The first Skill not yet fluent, in card order, opens with a half-done try (R5); unused fixed tries follow,
 * easiest (first in the file) first, then fresh template draws. `shown` is the tries already shown for this Check, in
 * order. Pure: the same inputs give the same try, so a reload draws it again.
 */
export function nextQuickTry(
  topic: Topic,
  check: Check,
  states: Readonly<Record<string, SkillState>>,
  shown: readonly QuickTryData[],
  opts: PickOptions = {},
): QuickTryData | null {
  const open = skillsInCardOrder(topic, check).filter((s) => !(states[s] && isFluent(states[s])));
  const skillId = opts.skillId && open.includes(opts.skillId) ? opts.skillId : open[0];
  if (!skillId) return null;
  const tries = check.quickTries.filter((q) => skillOfTry(topic, q) === skillId);
  if (!tries.length) return null;
  const used = new Set(shown.map((s) => refOfKey(s.key)).flatMap((r) => (r ? [refText(r)] : [])));
  const ofSkill = shown.filter((s) => s.skillId === skillId).length;
  const ref = pick(tries, used, opts.easier || ofSkill === 0, ofSkill);
  const n = shown.length;
  const key = keyOf(opts.session ?? 0, n, ref);
  const drills = shown.filter((s) => s.skillId === skillId && s.drill).length;
  const drill = opts.drill ? { n: drills + 1, of: DRILL_OF, reason: "Back after a break: a few short tries on this idea." } : undefined;
  return { ...dataOf(topic, check, key, ref), ...(drill && { drill }) };
}

/** The ref to show: half-done when wanted (a fixed one unused, else a template's half-done draw), else the next full try. */
function pick(tries: QuickTry[], used: Set<string>, half: boolean, count: number): Ref {
  const fixedHalf = tries.filter((q): q is FixedQuickTry => isFixed(q) && Boolean(q.halfDone));
  const templateHalf = tries.flatMap((q) => (!isFixed(q) && q.halfDone ? [q.template] : []));
  const fixedFull = tries.filter((q): q is FixedQuickTry => isFixed(q) && !q.halfDone);
  const templateFull = tries.flatMap((q) => (!isFixed(q) && !q.halfDone ? [q.template] : []));
  if (half) {
    const unused = fixedHalf.find((q) => !used.has(q.id));
    if (unused) return { fixed: unused.id };
    if (templateHalf.length) return { template: templateHalf[0], half: true };
    if (fixedHalf.length) return { fixed: fixedHalf[count % fixedHalf.length].id };
  }
  const unused = fixedFull.find((q) => !used.has(q.id));
  if (unused) return { fixed: unused.id };
  if (templateFull.length) return { template: templateFull[count % templateFull.length], half: false };
  if (templateHalf.length) return { template: templateHalf[0], half: true };
  const any = tries.filter(isFixed);
  return { fixed: any[count % any.length].id };
}

/** A fixed try's id, from any Check of the Topic. */
function fixedTry(topic: Topic, id: string): FixedQuickTry | undefined {
  for (const c of topic.checks) for (const q of c.quickTries) if (isFixed(q) && q.id === id) return q;
  return undefined;
}

/** What a key names, worked out from the Topic file: the item to mark, with its first step when half-done. Null for an unknown key. */
export function quickTryItem(topic: Topic, key: string): { item: FixedItem | DrawnItem; halfDone?: string } | null {
  const ref = refOfKey(key);
  if (!ref) return null;
  if ("fixed" in ref) {
    const q = fixedTry(topic, ref.fixed);
    if (!q) return null;
    const { halfDone, ...item } = q;
    return { item, ...(halfDone && { halfDone }) };
  }
  const template = topic.templates.find((t) => t.id === ref.template);
  if (!template || (ref.half && !template.halfDone)) return null;
  try {
    const drawn = drawTemplate(template, key, { halfDone: ref.half });
    if (!ref.half) return { item: drawn };
    // The half-done draw's prompt is the ask, then the first step shown done: split them at the step's fixed opening.
    const opening = template.halfDone!.shows.split("{")[0];
    const at = opening ? drawn.prompt.lastIndexOf(opening) : -1;
    if (at <= 0) return { item: drawn };
    return { item: { ...drawn, prompt: drawn.prompt.slice(0, at).trim() }, halfDone: drawn.prompt.slice(at).trim() };
  } catch {
    return null;
  }
}

function dataOf(topic: Topic, check: Check, key: string, ref: Ref): QuickTryData {
  const found = quickTryItem(topic, key);
  if (!found) throw new Error(`Quick try ${refText(ref)} in Topic ${topic.id} cannot be shown`);
  const { item, halfDone } = found;
  const prompt = "templateId" in item ? item.prompt : item.ask;
  const unit = "templateId" in item ? item.unit : item.kind === "number" ? item.unit : undefined;
  return {
    key,
    checkId: check.id,
    skillId: item.skill,
    prompt,
    kind: item.kind,
    ...(unit && { unit }),
    ...(halfDone && { halfDone }),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The database part: storing the card, its Widget and the tries as Session items, and marking answers.
// Every read or write of skill_state and practice_answers is for a converted Topic only.

/** A Concept card as the Tutor reads it: its title, its lines and the line to write down. */
export function cardText(card: ConceptCard): string {
  return `"${card.title}": ${card.lines.join(" ")} Write down: ${card.writeDown}`;
}

/** The Learner's place when it is about a Check of a converted Topic, else null. */
function convertedPlace(place: Place | null): (Place & { check: Check }) | null {
  return place && place.check && isConverted(place.topic) ? (place as Place & { check: Check }) : null;
}

/** The Concept card for this turn's facts: at a converted Concept step and at a converted quiz Check, else undefined. */
export function cardForFacts(place: Place | null): string | undefined {
  const at = convertedPlace(place);
  if (!at?.check.card) return undefined;
  if (at.step === "concept" || (at.step === "check" && at.check.kind === "quiz")) return cardText(at.check.card);
  return undefined;
}

const dataOfItem = <T>(i: { data: Record<string, unknown> }) => i.data as T;

/** The Widget's starting values, as its program declares them: `$old = 4` gives { $old: 4 }. */
function startValues(code: string): Record<string, number> {
  const values: Record<string, number> = {};
  for (const m of code.matchAll(/^\s*(\$[A-Za-z_]\w*)\s*=\s*(-?\d+(?:\.\d+)?)\s*$/gm)) values[m[1]] = Number(m[2]);
  return values;
}

/**
 * Stores the card's Widget preset after the card: a recipe built as the lesson lint builds it (no model call), or the
 * written-ahead Widget it names. When the Widget's key already has saved state in this Session, the state is set back
 * to the preset's starting values (ticks kept), so the card always opens at its own numbers.
 */
async function storePreset(db: Db, topic: Topic, check: Check, card: ConceptCard, learnerId: number, sessionId: number, now: Date, n: number): Promise<SessionItem | null> {
  const preset = card.widget;
  if (!preset) return null;
  const states = await loadWidgetStates(db, sessionId, learnerId);
  const reset = async (key: string, values: Record<string, number>, always: boolean) => {
    const saved = states[key];
    if (!saved && !always) return;
    await saveWidgetState(db, { sessionId, widgetKey: key, values, ticked: saved?.ticked ?? [] }, learnerId, now);
  };
  if ("recipe" in preset) {
    const built = recipeById(preset.recipe)?.build({ title: preset.title ?? card.title, inputs: preset.inputs, refs: {}, facts: {} });
    if (!built?.ok) {
      console.error(`Concept card of Check "${check.id}": its Widget preset does not build${built ? `: ${built.error}` : ""}.`);
      return null;
    }
    const data: ShownWidget = { id: `card-${check.id}-${n}`, recipe: preset.recipe, params: built.params, title: built.title, code: built.code, source: "recipe" };
    const item = { kind: WIDGET_SHOWN, data };
    await saveItemAfterLatest(db, learnerId, sessionId, item, now);
    const key = widgetKey(built.title);
    if (key) await reset(key, startValues(built.code), false);
    return item;
  }
  const widget = writtenAheadWidgets(topic).find((w) => w.id === preset.widget);
  if (!widget) return null;
  const item = { kind: WIDGET_OPENED, data: { id: widget.id, title: widget.title } };
  await saveItemAfterLatest(db, learnerId, sessionId, item, now);
  const values = Object.fromEntries(Object.entries(preset.values).map(([k, v]) => [k.startsWith("$") ? k : `$${k}`, v]));
  await reset(widget.id, { ...startValues(widget.code), ...values }, true);
  return item;
}

/** The Quick tries shown in a Session for one Check, in order, the keys that have a result, and the open one. */
function triesIn(items: readonly StoredItem[], checkId: string) {
  const shown = items
    .filter((i) => i.kind === QUICK_TRY)
    .map((i) => dataOfItem<QuickTryData>(i))
    .filter((t) => t.checkId === checkId);
  const answered = new Set(items.filter((i) => i.kind === QUICK_TRY_RESULT).map((i) => dataOfItem<QuickTryResultData>(i).key));
  return { shown, answered, open: shown.find((t) => !answered.has(t.key)) };
}

/** Stores the next Quick try for the Learner's converted Your turn, unless one is open (or every Skill is fluent). */
async function postTry(db: Db, place: Place & { check: Check }, learnerId: number, sessionId: number, now: Date, opts: PickOptions = {}): Promise<SessionItem | null> {
  const { shown, open } = triesIn(await loadSessionItems(db, sessionId, learnerId), place.check.id);
  if (open) return null;
  const states = await skillStates(db, learnerId, place.topic.id);
  const next = nextQuickTry(place.topic, place.check, states, shown, { ...opts, session: sessionId });
  if (!next) return null;
  const item = { kind: QUICK_TRY, data: next };
  await saveItemAfterLatest(db, learnerId, sessionId, item, now);
  return item;
}

/**
 * What code shows on entering the Learner's step, stored as Session items (idempotent). At a converted Concept step,
 * the card and then its Widget preset, unless the card was stored since the latest step divider. At a converted Your
 * turn, the next Quick try when none is open. Anything else stores nothing, so a Topic not converted is as before.
 */
export async function enterStepItems(db: Db, map: CourseMap, learnerId: number, sessionId: number, now: Date): Promise<SessionItem[]> {
  const place = convertedPlace(navigate(map, await loadProgress(db, learnerId)));
  if (!place) return [];
  const { topic, check, step } = place;
  if (step === "concept" && check.card) {
    const items = await loadSessionItems(db, sessionId, learnerId);
    const divider = items.findLastIndex((i) => i.kind === STEP_DIVIDER);
    const since = items.slice(divider + 1);
    if (since.some((i) => i.kind === CONCEPT_CARD && dataOfItem<ConceptCardData>(i).checkId === check.id)) return [];
    const data: ConceptCardData = { checkId: check.id, title: check.card.title, lines: [...check.card.lines], writeDown: check.card.writeDown };
    const card: SessionItem = { kind: CONCEPT_CARD, data };
    await saveItemAfterLatest(db, learnerId, sessionId, card, now);
    const cards = items.filter((i) => i.kind === CONCEPT_CARD).length;
    const preset = await storePreset(db, topic, check, check.card, learnerId, sessionId, now, cards);
    return preset ? [card, preset] : [card];
  }
  if (practiceStep(topic, step, check)) {
    const item = await postTry(db, place, learnerId, sessionId, now);
    return item ? [item] : [];
  }
  return [];
}

export type QuickTryAnswer = { ok: true; items: SessionItem[]; followUp: boolean } | { ok: false; status: 400 | 404 | 409; error: string };

/** One of the Learner's stored items of a kind, by its key; undefined when there is none. */
async function itemByKey(db: Db, learnerId: number, kind: string, key: string) {
  const [row] = await db
    .select({ sessionId: sessionItems.sessionId, data: sessionItems.data })
    .from(sessionItems)
    .where(and(eq(sessionItems.learnerId, learnerId), eq(sessionItems.kind, kind), sql`${sessionItems.data}->>'key' = ${key}`))
    .limit(1);
  return row;
}

/** The line under a marked try. */
const lineOf = (v: Verdict) => (v.verdict === "right" ? "Right." : v.verdict === "known_mistake" ? v.fix : "Not quite.");

/**
 * Marks the Learner's answer to one of their Quick tries, with no model call. 409 while a turn runs; 404 for a key that
 * is not theirs. The answer counts once per key: a second send changes nothing. Right posts the next try, or finishes
 * Your turn once every Skill of the Check is fluent (then `followUp`: the page starts a turn that points to the Check).
 * A Known mistake shows its fix, then a new try on the same Skill. A wrong answer with no Known mistake shows "Not
 * quite." and asks for a follow-up turn, after which code posts a fresh try.
 */
export async function answerQuickTry(db: Db, map: CourseMap, learnerId: number, key: string, input: string, now: Date): Promise<QuickTryAnswer> {
  if (!input.trim()) return { ok: false, status: 400, error: "Type an answer, or pick True or False." };
  if (await turnRunning(db, now, learnerId)) return { ok: false, status: 409, error: "Wait for the Tutor to finish, then answer." };
  const row = await itemByKey(db, learnerId, QUICK_TRY, key);
  const shown = row ? dataOfItem<QuickTryData>(row) : undefined;
  const check = shown ? map.check(shown.checkId) : undefined;
  const topic = check ? map.topic(check.topicId) : undefined;
  const found = topic ? quickTryItem(topic, key) : null;
  if (!row || !shown || !check || !topic || !found) return { ok: false, status: 404, error: "That Quick try does not exist." };
  if (await itemByKey(db, learnerId, QUICK_TRY_RESULT, key)) return { ok: true, items: [], followUp: false };

  const marked = markAnswer(found.item, input);
  const drawn = "templateId" in found.item ? found.item : null;
  await recordAnswer(
    db,
    {
      learnerId,
      topicId: topic.id,
      skillId: shown.skillId,
      sessionId: row.sessionId,
      itemKey: key,
      itemId: found.item.id,
      templateId: drawn?.templateId ?? null,
      params: drawn?.params ?? {},
      input: input.trim(),
      verdict: marked.verdict,
      mistakeTag: marked.verdict === "known_mistake" ? marked.tag : null,
      source: "quick_try",
    },
    now,
  );
  const resultData: QuickTryResultData = { key, verdict: marked.verdict, line: lineOf(marked) };
  const result: SessionItem = { kind: QUICK_TRY_RESULT, data: resultData };
  await saveItemAfterLatest(db, learnerId, row.sessionId, result, now);
  const items = [result];
  if (marked.verdict === "wrong") return { ok: true, items, followUp: true };

  const progress = await loadProgress(db, learnerId);
  const place = convertedPlace(navigate(map, progress));
  if (!place || place.check.id !== check.id || !practiceStep(place.topic, place.step, place.check)) return { ok: true, items, followUp: false };
  if (marked.verdict === "right") {
    const states = await skillStates(db, learnerId, topic.id);
    const done = yourTurnDone(testedSkills(topic, place.check).map((s) => states[s] ?? freshSkillState()));
    const move = finishFromPractice(map, progress, done);
    if (move.ok) {
      await saveTopicStep(db, learnerId, topic.id, move.progress, now);
      const divider = stepDivider(map, move.progress, topic.id);
      if (divider) {
        await saveItemAfterLatest(db, learnerId, row.sessionId, divider, now);
        items.push(divider);
      }
      return { ok: true, items, followUp: true };
    }
  }
  const next = await postTry(db, place, learnerId, row.sessionId, now, marked.verdict === "known_mistake" ? { skillId: shown.skillId } : {});
  if (next) items.push(next);
  return { ok: true, items, followUp: false };
}

/** Saves the Topic's new step after Your turn finished from practice (the Navigator's move; the Topic's row exists). */
async function saveTopicStep(db: Db, learnerId: number, topicId: string, progress: Progress, now: Date) {
  const t = progress.topics[topicId];
  await db
    .update(topicProgress)
    .set({ step: t.step, revealShown: t.revealShown, status: t.status, updatedAt: now })
    .where(and(eq(topicProgress.learnerId, learnerId), eq(topicProgress.topicId, topicId)));
}

/** The seq of the Session's latest Tutor message, or -1. */
async function lastReplySeq(db: Db, sessionId: number): Promise<number> {
  const [{ last }] = await db
    .select({ last: max(messages.seq) })
    .from(messages)
    .where(and(eq(messages.sessionId, sessionId), eq(messages.role, "assistant")));
  return last ?? -1;
}

/** Marked tries as the Tutor reads them: each ask, what the Learner gave and the verdict. */
async function resultLines(db: Db, map: CourseMap, learnerId: number, items: readonly StoredItem[], results: readonly QuickTryResultData[]): Promise<string[]> {
  if (!results.length) return [];
  const tries = new Map(items.filter((i) => i.kind === QUICK_TRY).map((i) => [dataOfItem<QuickTryData>(i).key, dataOfItem<QuickTryData>(i)]));
  const given = await db
    .select({ itemKey: practiceAnswers.itemKey, input: practiceAnswers.input })
    .from(practiceAnswers)
    .where(and(eq(practiceAnswers.learnerId, learnerId), inArray(practiceAnswers.itemKey, results.map((r) => r.key))));
  const inputs = new Map(given.map((g) => [g.itemKey, g.input]));
  return results.map((r) => {
    const t = tries.get(r.key);
    const check = t ? map.check(t.checkId) : undefined;
    const topic = check ? map.topic(check.topicId) : undefined;
    const found = topic ? quickTryItem(topic, r.key) : null;
    const input = inputs.get(r.key) ?? "";
    const expected = found ? markAnswer(found.item, input).expected : undefined;
    const verdict =
      r.verdict === "right"
        ? "right"
        : r.verdict === "known_mistake"
          ? `a Known mistake, and code showed its fix ("${r.line}")`
          : `not right${expected ? `; the answer is ${expected}` : ""}`;
    const ask = t ? [t.prompt, t.halfDone].filter(Boolean).join(" ") : r.key;
    return `- "${ask}" The Learner gave "${input}": ${verdict}.`;
  });
}

/**
 * The Quick-try results stored in a Session since the Tutor's last reply, as a note for the next turn (the way quiz
 * results reach it), or null when there are none. Item order shows what is new, so nothing is marked as told.
 */
export async function pendingQuickTryNote(db: Db, map: CourseMap, learnerId: number, sessionId: number): Promise<string | null> {
  const items = await loadSessionItems(db, sessionId, learnerId);
  if (!items.some((i) => i.kind === QUICK_TRY_RESULT)) return null;
  const since = await lastReplySeq(db, sessionId);
  const results = items.filter((i) => i.kind === QUICK_TRY_RESULT && i.afterSeq >= since).map((i) => dataOfItem<QuickTryResultData>(i));
  const lines = await resultLines(db, map, learnerId, items, results);
  if (!lines.length) return null;
  return ["Quick try results since your last reply (code showed and marked them; never mark them again):", ...lines].join("\n");
}

/**
 * The note for a Quick-try follow-up turn, or null when there is nothing to follow up (another tab already did, or the
 * latest result needs none): after a wrong answer with no Known mistake, name the slip; after the try that finished
 * Your turn, point to the Check.
 */
export async function quickTryFollowUpNote(db: Db, map: CourseMap, learnerId: number): Promise<string | null> {
  const place = navigate(map, await loadProgress(db, learnerId));
  const session = place && isConverted(place.topic) ? await liveSession(db, learnerId, place.topic.id) : undefined;
  if (!place || !session) return null;
  const items = await loadSessionItems(db, session.id, learnerId);
  const latest = items.findLast((i) => i.kind === QUICK_TRY_RESULT);
  if (!latest || (await lastReplySeq(db, session.id)) > latest.afterSeq) return null;
  const result = dataOfItem<QuickTryResultData>(latest);
  if (result.verdict === "wrong") {
    const [line] = await resultLines(db, map, learnerId, items, [result]);
    return `${QUICK_TRY_FOLLOW_UP_PREFIX} the Learner answered a Quick try, and code marked it with no Known mistake to match:\n${line}\nReply kind: feedback. Name the slip in one sentence and give the fix. Do not teach the idea again, and write no practice question of your own: code shows a fresh Quick try after your reply.`;
  }
  if (result.verdict === "right" && place.step === "check" && place.check) {
    const where = place.check.kind === "quiz" ? "point them to the quiz on the right, in the Check tab" : "put the Check's prompt to them";
    return `${QUICK_TRY_FOLLOW_UP_PREFIX} the Learner has two right answers in a row on every idea of this Check, so Your turn is done and code moved them on to the Check. Say so in one sentence, then ${where}.`;
  }
  return null;
}

/**
 * The checked-replies fallback at a converted step with a card (reply-fallback.ts calls it): the card's write-down
 * line, then, at Your turn, the next Quick try. Null where there is no card.
 */
export async function practiceFallback(db: Db, map: CourseMap, learnerId: number, place: Place | null, now = new Date()): Promise<{ text: string; items: SessionItem[] } | null> {
  const at = convertedPlace(place);
  if (!at?.check.card || (at.step !== "concept" && !practiceStep(at.topic, at.step, at.check))) return null;
  const session = await liveSession(db, learnerId, at.topic.id);
  const items = session && at.step === "your_turn" ? await enterStepItems(db, map, learnerId, session.id, now) : [];
  return { text: at.check.card.writeDown, items };
}
