import { and, asc, eq, inArray, max, ne, sql } from "drizzle-orm";
import type { Check, ConceptCard, CourseMap, FixedQuickTry, QuickTry, Topic } from "@/course/map";
import { isConverted, testedSkills } from "@/course/map";
import { checkSkills, finishFromPractice, navigate, practiceStep, type ParkedSkills, type Place, type Progress } from "@/course/navigator";
import { revealMove, WIDGET_OPENED, writtenAheadWidgets } from "@/course/written-ahead";
import { loadCaseData } from "@/case-data/case-data";
import { messages, practiceAnswers, sessionItems, topicProgress, turns } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProgress } from "@/learner/memory";
import { noteMethodUsed, parkedSkills, parkSkill, recordAnswer, skillStates, unparkSkill } from "@/learner/skill-state";
import { loadWidgetStates, saveWidgetState } from "@/learner/widget-state";
import { drawTemplate, markAnswer, type DrawnItem, type FixedItem, type Verdict } from "@/teaching";
import { drillDue, freshSkillState, isFluent, LADDER, yourTurnDone, type AnswerEvent, type Method, type SkillState } from "@/teaching/ladder";
import { recipeById } from "@/widgets/recipes";
import { WIDGET_SHOWN, type ShownWidget } from "@/widgets/shown-widget";
import { widgetKey } from "@/widgets/widget-state";
import { cardText } from "./context";
import { ladderAction, reteachNote, rungKind, type RungKind } from "./ladder-moves";
import { backAt, PARK_DRILL, PARK_OFFER, PARK_OFFER_LINE, PARKED, parkedLine, practiceTitle, type ParkDrillData, type ParkedData, type ParkOfferData } from "./park-items";
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
import { frustrationCount, type FrustrationEvent } from "./frustration";
import { isCodeWritten, QUICK_TRY_FOLLOW_UP_PREFIX, QUIZ_FOLLOW_UP_PREFIX, turnRunning } from "./turn-status";

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
  /** The try is part of a drill of five; a string is the drill's reason ("ladder" or "parked"). */
  drill?: boolean | string;
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

/** The Skills of a Check that have Quick tries there, in card order: the ones Your turn waits on. */
function practisedSkills(topic: Topic, check: Check): string[] {
  return skillsInCardOrder(topic, check).filter((s) => check.quickTries.some((q) => skillOfTry(topic, q) === s));
}

/**
 * Your turn is done once every practised Skill of the Check is fluent. A Skill with no Quick tries at this Check is
 * left out, since no try can make it fluent here; with none practised at all, there is nothing to wait for.
 */
function practiceDone(topic: Topic, check: Check, states: Readonly<Record<string, SkillState>>): boolean {
  const skills = practisedSkills(topic, check);
  return !skills.length || yourTurnDone(skills.map((s) => states[s] ?? freshSkillState()));
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
  // A Skill with no Quick tries at this Check is skipped: it cannot hold Your turn open (practisedSkills).
  const open = practisedSkills(topic, check).filter((s) => !(states[s] && isFluent(states[s])));
  const skillId = opts.skillId && open.includes(opts.skillId) ? opts.skillId : open[0];
  if (!skillId) return null;
  const tries = check.quickTries.filter((q) => skillOfTry(topic, q) === skillId);
  const used = new Set(shown.map((s) => refOfKey(s.key)).flatMap((r) => (r ? [refText(r)] : [])));
  const ofSkill = shown.filter((s) => s.skillId === skillId).length;
  const ref = pick(tries, used, opts.easier || ofSkill === 0, ofSkill);
  const n = shown.length;
  const key = keyOf(opts.session ?? 0, n, ref);
  const drills = shown.filter((s) => s.skillId === skillId && s.drill).length;
  const reason = typeof opts.drill === "string" ? opts.drill : "Back after a break: a few short tries on this idea.";
  const drill = opts.drill ? { n: drills + 1, of: DRILL_OF, reason } : undefined;
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
 * At a converted Topic's reveal, its reveal Widget, once a Session: a recipe whose "{before}" and "{after}" inputs take the
 * move the Case's dataset made across its as-of date, read from Case Data. Nothing when the Topic has none, when the Case
 * Data does not give the move, or when the recipe does not build.
 */
async function storeRevealWidget(db: Db, map: CourseMap, place: Place, progress: Progress, learnerId: number, sessionId: number, now: Date): Promise<SessionItem | null> {
  const { topic } = place;
  const r = topic.revealWidget;
  if (!r) return null;
  const id = `reveal-${topic.id}`;
  const stored = await loadSessionItems(db, sessionId, learnerId);
  if (stored.some((i) => i.kind === WIDGET_SHOWN && i.data.id === id)) return null;
  // The reveal has begun, so the as-of rule gives the move even before the step is saved as shown.
  const record = progress.topics[topic.id];
  const shown: Progress = record ? { ...progress, topics: { ...progress.topics, [topic.id]: { ...record, revealShown: true } } } : progress;
  const move = revealMove(await loadCaseData(db, map, shown, r.case), r.dataset);
  if (!move) return null;
  const inputs = Object.fromEntries(Object.entries(r.inputs).map(([k, v]) => [k, v === "{before}" ? move.before : v === "{after}" ? move.after : v]));
  const title = r.title ?? topic.cases.find((c) => c.id === r.case)?.title ?? topic.title;
  const built = recipeById(r.recipe)?.build({ title, inputs, refs: {}, facts: {} });
  if (!built?.ok) {
    console.error(`Reveal Widget of Topic "${topic.id}" does not build${built ? `: ${built.error}` : ""}.`);
    return null;
  }
  const data: ShownWidget = { id, recipe: r.recipe, params: built.params, title: built.title, code: built.code, source: "recipe" };
  const item = { kind: WIDGET_SHOWN, data };
  await saveItemAfterLatest(db, learnerId, sessionId, item, now);
  return item;
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

/**
 * Stores the next Quick try for the Learner's converted Your turn, unless one is open (or every Skill is fluent). A
 * drill under way goes on first, one try at a time. While a Skill of the Check is parked nothing is posted: the Topic
 * waits for its drill. `opts.skillId` with `force` posts a try on that Skill even when it is fluent (One more short
 * try, a drill). With `store` false it only works out the try (the checked-replies fallback stores it itself).
 */
async function postTry(
  db: Db,
  place: Place & { check: Check },
  learnerId: number,
  sessionId: number,
  now: Date,
  opts: PickOptions & { force?: boolean } = {},
  store = true,
): Promise<SessionItem | null> {
  const { shown, open } = triesIn(await loadSessionItems(db, sessionId, learnerId), place.check.id);
  if (open) return null;
  const states = await skillStates(db, learnerId, place.topic.id);
  const running = drillUnderWay(shown);
  if (running) return storeTry(db, place, learnerId, sessionId, now, states, shown, { skillId: running.skillId, drill: running.reason, force: true, store });
  if (place.parked?.length && !opts.force) return null;
  return storeTry(db, place, learnerId, sessionId, now, states, shown, { ...opts, store });
}

async function storeTry(
  db: Db,
  place: Place & { check: Check },
  learnerId: number,
  sessionId: number,
  now: Date,
  states: Record<string, SkillState>,
  shown: readonly QuickTryData[],
  opts: PickOptions & { force?: boolean; store?: boolean },
): Promise<SessionItem | null> {
  // A forced Skill counts as not fluent, so the picker keeps to it.
  const forced = opts.force && opts.skillId ? { ...states, [opts.skillId]: freshSkillState() } : states;
  const easier = opts.easier || (await frustratedNow(db, place, learnerId, sessionId, states));
  const next = nextQuickTry(place.topic, place.check, forced, shown, { ...opts, easier, session: sessionId });
  if (!next) return null;
  const data = next.drill ? { ...next, drill: { ...next.drill, n: drillCount(shown, next.skillId) + 1 } } : next;
  const item = { kind: QUICK_TRY, data };
  if (opts.store !== false) await saveItemAfterLatest(db, learnerId, sessionId, item, now);
  return item;
}

/** The drill the latest try belongs to while it has tries to go: its Skill and reason. */
function drillUnderWay(shown: readonly QuickTryData[]): { skillId: string; reason: string } | null {
  const last = shown[shown.length - 1];
  return last?.drill && last.drill.n < last.drill.of ? { skillId: last.skillId, reason: last.drill.reason } : null;
}

/** How many tries of the drill under way on this Skill are already shown (the trailing run of drill tries). */
function drillCount(shown: readonly QuickTryData[], skillId: string): number {
  let n = 0;
  for (let i = shown.length - 1; i >= 0 && shown[i].drill && shown[i].skillId === skillId; i--) {
    n++;
    if (shown[i].drill!.n === 1) break;
  }
  return n;
}

/**
 * Frustration makes the next try easier (spec #229, "Frustration"): the Learner's signal phrases in their last three
 * messages since their last right answer, or two misses in a row on the try's Skill.
 */
async function frustratedNow(db: Db, place: Place & { check: Check }, learnerId: number, sessionId: number, states: Record<string, SkillState>): Promise<boolean> {
  const current = checkSkills(place.topic, place.check).find((s) => states[s] && !isFluent(states[s]));
  const count = frustrationCount(await frustrationEvents(db, learnerId, sessionId, place.topic.id), current ? states[current] : null);
  return count > 0;
}

/**
 * What code shows on entering the Learner's step, stored as Session items (idempotent). At a converted Concept step,
 * the card and then its Widget preset, unless the card was stored since the latest step divider. At a converted Your
 * turn, the next Quick try when none is open. Anything else stores nothing, so a Topic not converted is as before.
 */
export async function enterStepItems(db: Db, map: CourseMap, learnerId: number, sessionId: number, now: Date): Promise<SessionItem[]> {
  const { progress, place: at } = await placeWithParked(db, map, learnerId);
  if (at?.step === "reveal" && isConverted(at.topic)) {
    const item = await storeRevealWidget(db, map, at, progress, learnerId, sessionId, now);
    return item ? [item] : [];
  }
  const place = convertedPlace(at);
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
  // A parked Skill whose time has come opens on its drill of five, at whatever step the Topic waits.
  const drill = await drillItems(db, place, learnerId, sessionId, now);
  if (drill) return drill;
  if (practiceStep(topic, step, check)) {
    const item = await postTry(db, place, learnerId, sessionId, now);
    return item ? [item] : await finishWhenDone(db, map, learnerId, sessionId, now);
  }
  return [];
}

/**
 * Finishes a converted Your turn that has nothing left to practise: every practised Skill of the Check is already
 * fluent (from a quiz, or an earlier Check) and no try is open. Stores the divider, then what the next step shows.
 * Nothing while a Skill is parked (the Topic waits for its drill) or while a try is open.
 */
async function finishWhenDone(db: Db, map: CourseMap, learnerId: number, sessionId: number, now: Date): Promise<SessionItem[]> {
  const { progress, parked, place: at } = await placeWithParked(db, map, learnerId);
  const place = convertedPlace(at);
  if (!place || !practiceStep(place.topic, place.step, place.check)) return [];
  if (triesIn(await loadSessionItems(db, sessionId, learnerId), place.check.id).open) return [];
  const done = practiceDone(place.topic, place.check, await skillStates(db, learnerId, place.topic.id));
  const move = finishFromPractice(map, progress, done, parked);
  if (!move.ok) return [];
  await saveTopicStep(db, learnerId, place.topic.id, move.progress, now);
  const divider = stepDivider(map, move.progress, place.topic.id);
  if (divider) await saveItemAfterLatest(db, learnerId, sessionId, divider, now);
  return [...(divider ? [divider] : []), ...(await enterStepItems(db, map, learnerId, sessionId, now))];
}

/**
 * The Learner's place, with the parked Skills of a converted current Topic filled in. Only a converted Topic reads
 * skill_state, so production reads nothing new until a Topic is converted.
 */
export async function placeWithParked(db: Db, map: CourseMap, learnerId: number): Promise<{ progress: Progress; parked: ParkedSkills; place: Place | null }> {
  const progress = await loadProgress(db, learnerId);
  const bare = navigate(map, progress);
  const parked = bare && isConverted(bare.topic) ? await parkedSkills(db, learnerId, [bare.topic.id]) : {};
  return { progress, parked, place: navigate(map, progress, parked) };
}

/** Whether the Learner's current Topic opens on a drill now: a Skill of its Check is parked and its 20 hours have passed. */
export async function drillIsDue(db: Db, map: CourseMap, learnerId: number, now: Date): Promise<boolean> {
  const { place } = await placeWithParked(db, map, learnerId);
  const due = place?.parked?.filter((p) => now.getTime() >= p.until.getTime()) ?? [];
  if (!place || !due.length) return false;
  // A drill already begun (its divider stored since the Skill was parked) is not started again.
  const session = await liveSession(db, learnerId, place.topic.id);
  const items = session ? await loadSessionItems(db, session.id, learnerId) : [];
  return due.some((p) => {
    const parkedAt = items.findLastIndex((i) => i.kind === PARKED && i.data.skillId === p.skillId);
    return !items.some((i, n) => n > parkedAt && i.kind === PARK_DRILL && i.data.skillId === p.skillId);
  });
}

/**
 * The drill after a park: when a parked Skill of the Check is due and no drill or try is under way, a divider
 * ("Drill · <rule>") and the first of five tries on it. Null when no drill starts now.
 */
async function drillItems(db: Db, bare: Place & { check: Check }, learnerId: number, sessionId: number, now: Date): Promise<SessionItem[] | null> {
  const parked = await parkedSkills(db, learnerId, [bare.topic.id]);
  const place = { ...bare, parked: checkSkills(bare.topic, bare.check).flatMap((skillId) => (parked[bare.topic.id]?.[skillId] ? [{ skillId, until: parked[bare.topic.id][skillId] }] : [])) };
  const states = await skillStates(db, learnerId, place.topic.id);
  const due = place.parked.find((p) => drillDue(states[p.skillId] ?? { ...freshSkillState(), parkedUntil: p.until }, now));
  if (!due) return null;
  const { shown, open } = triesIn(await loadSessionItems(db, sessionId, learnerId), place.check.id);
  if (open || drillUnderWay(shown)) return null;
  const rule = place.topic.skills.find((s) => s.id === due.skillId)?.rule ?? "this idea";
  const divider: SessionItem = { kind: PARK_DRILL, data: { skillId: due.skillId, label: `Drill · ${rule}` } satisfies ParkDrillData };
  await saveItemAfterLatest(db, learnerId, sessionId, divider, now);
  const first = await storeTry(db, place, learnerId, sessionId, now, states, shown, { skillId: due.skillId, drill: "parked", force: true });
  return first ? [divider, first] : [divider];
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
  const after = await recordAnswer(
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
  const event: AnswerEvent = marked.verdict === "known_mistake" ? { verdict: "known_mistake", tag: marked.tag } : { verdict: marked.verdict };
  if (shown.drill) {
    // A drill of five is five answered tries, right or wrong. The return drill's fifth ends the park, and the step goes on.
    if (shown.drill.n >= shown.drill.of && shown.drill.reason === "parked") await unparkSkill(db, learnerId, topic.id, shown.skillId, now);
  } else {
    // The repair ladder: a second miss in a row brings a re-teach turn, a third the park offer, with no Tutor turn.
    const action = ladderAction(after, event);
    if (action.kind === "park_offer") {
      items.push(await storeParkOffer(db, learnerId, row.sessionId, shown.skillId, now));
      return { ok: true, items, followUp: false };
    }
    if (action.kind === "reteach") return { ok: true, items, followUp: true };
  }
  if (marked.verdict === "wrong") return { ok: true, items, followUp: true };

  const { progress, parked, place: at } = await placeWithParked(db, map, learnerId);
  const place = convertedPlace(at);
  if (!place || place.check.id !== check.id) return { ok: true, items, followUp: false };
  if (!practiceStep(place.topic, place.step, place.check)) {
    // A drill at a quiz Check goes on try by try; once it ends the Check is open as before.
    const next = drillUnderWay(triesIn(await loadSessionItems(db, row.sessionId, learnerId), check.id).shown) ? await postTry(db, place, learnerId, row.sessionId, now) : null;
    if (next) items.push(next);
    return { ok: true, items, followUp: false };
  }
  if (marked.verdict === "right") {
    const done = practiceDone(topic, place.check, await skillStates(db, learnerId, topic.id));
    const move = finishFromPractice(map, progress, done, parked);
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
  // No try left to give and nothing to wait for: Your turn ends here rather than leaving the Learner stuck.
  const finished = next ? [] : await finishWhenDone(db, map, learnerId, row.sessionId, now);
  items.push(...finished);
  return { ok: true, items, followUp: finished.some((i) => i.kind === STEP_DIVIDER) };
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
  const reteach = await reteachFor(db, map, learnerId, items, result, session.id);
  if (reteach) return reteach;
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
  // The Tutor Turn stores the returned items itself, so the next try is picked here but not stored.
  const next = session && at.step === "your_turn" ? await postTry(db, at, learnerId, session.id, now, {}, false) : null;
  void map;
  return { text: at.check.card.writeDown, items: next ? [next] : [] };
}

// ---------------------------------------------------------------------------------------------------------------------
// The repair ladder's code-side moves (spec #229, "Repair ladder and Reply kinds" and "Parking"; ticket #245).

/** The try a result answers, and the Learner's state on its Skill now. */
async function triedSkill(db: Db, map: CourseMap, learnerId: number, items: readonly StoredItem[], key: string) {
  const tried = items.find((i) => i.kind === QUICK_TRY && dataOfItem<QuickTryData>(i).key === key);
  const data = tried ? dataOfItem<QuickTryData>(tried) : undefined;
  const check = data ? map.check(data.checkId) : undefined;
  if (!data || !check) return null;
  const states = await skillStates(db, learnerId, check.topicId);
  return { data, check, topicId: check.topicId, state: states[data.skillId] ?? freshSkillState() };
}

/**
 * The re-teach note after a second miss in a row on a Skill (a Known mistake too): `Reply kind: reteach` and the next
 * method in plain words. Code notes the method as used, so the next re-teach on this Skill names another.
 */
async function reteachFor(db: Db, map: CourseMap, learnerId: number, items: readonly StoredItem[], result: QuickTryResultData, sessionId: number): Promise<string | null> {
  if (result.verdict === "right") return null;
  const tried = await triedSkill(db, map, learnerId, items, result.key);
  if (!tried || tried.data.drill) return null;
  const event: AnswerEvent = result.verdict === "known_mistake" ? { verdict: "known_mistake", tag: "known" } : { verdict: "wrong" };
  const action = ladderAction(tried.state, event);
  if (action.kind !== "reteach") return null;
  await noteMethodUsed(db, learnerId, tried.topicId, tried.data.skillId, action.method);
  const [line] = await resultLines(db, map, learnerId, items, [result]);
  const rule = map.topic(tried.topicId)?.skills.find((s) => s.id === tried.data.skillId)?.rule;
  void sessionId;
  return [
    `${QUICK_TRY_FOLLOW_UP_PREFIX} the Learner missed a Quick try on the same idea twice in a row:`,
    line,
    ...(rule ? [`The idea: ${rule}`] : []),
    action.note,
    "Teach it again this way only, in a few short lines with numbers other than the try's, then one ask. Write no practice question of your own: code shows the next Quick try after your reply.",
  ].join("\n");
}

/** The method a re-teach note names, read back from the turn's note. */
export function methodInNote(note: string | null | undefined): Method | null {
  for (const m of LADDER) if (note?.includes(reteachNote(m))) return m;
  return null;
}

/**
 * What code shows after a re-teach turn, by its method: a half-done try (boxes), the card's Widget in practice mode
 * under its own title, then a try (widget), the first of a drill of five (drill), or the next try as usual (restate,
 * worked example). Stored as Session items.
 */
export async function afterReteachItems(db: Db, map: CourseMap, learnerId: number, sessionId: number, method: Method, now: Date): Promise<SessionItem[]> {
  const { place: at } = await placeWithParked(db, map, learnerId);
  const place = convertedPlace(at);
  if (!place) return [];
  const items = await loadSessionItems(db, sessionId, learnerId);
  const latest = items.findLast((i) => i.kind === QUICK_TRY_RESULT);
  const tried = latest ? await triedSkill(db, map, learnerId, items, dataOfItem<QuickTryResultData>(latest).key) : null;
  const skillId = tried?.data.skillId;
  const out: SessionItem[] = [];
  if (method === "widget" && skillId) {
    const widget = await storePracticeWidget(db, place.topic, skillId, learnerId, sessionId, now);
    if (widget) out.push(widget);
  }
  const opts: PickOptions & { force?: boolean } =
    method === "boxes" || (method === "widget" && !out.length) ? { skillId, easier: true } : method === "drill5" ? { skillId, drill: "ladder", force: true } : { skillId };
  const next = await postTry(db, place, learnerId, sessionId, now, opts);
  if (next) out.push(next);
  return out;
}

/** The Skill's card preset opened in practice mode, under "<card title> · practice", so its key is its own. Recipe presets only. */
async function storePracticeWidget(db: Db, topic: Topic, skillId: string, learnerId: number, sessionId: number, now: Date): Promise<SessionItem | null> {
  const card = topic.checks.map((c) => c.card).find((c) => c?.skills.includes(skillId) && c.widget && "recipe" in c.widget);
  const preset = card?.widget;
  if (!card || !preset || !("recipe" in preset)) return null;
  const title = practiceTitle(preset.title ?? card.title);
  const built = recipeById(preset.recipe)?.build({ title, inputs: { ...preset.inputs, mode: "practice" }, refs: {}, facts: {} });
  if (!built?.ok) return null;
  const data: ShownWidget = { id: `practice-${skillId}-${now.getTime()}`, recipe: preset.recipe, params: built.params, title: built.title, code: built.code, source: "recipe" };
  const item = { kind: WIDGET_SHOWN, data };
  await saveItemAfterLatest(db, learnerId, sessionId, item, now);
  return item;
}

/** Stores the park offer: code's own line and two buttons. */
async function storeParkOffer(db: Db, learnerId: number, sessionId: number, skillId: string, now: Date): Promise<SessionItem> {
  const item: SessionItem = { kind: PARK_OFFER, data: { skillId, line: PARK_OFFER_LINE } satisfies ParkOfferData };
  await saveItemAfterLatest(db, learnerId, sessionId, item, now);
  return item;
}

/**
 * The park offer after a third miss in a row on a quiz question's Skill (T13 records quiz answers too): stored in the
 * Topic's live Session unless one is already waiting there for that Skill. Converted Topics only.
 */
export async function parkOfferFor(db: Db, map: CourseMap, learnerId: number, topicId: string, skillId: string, now: Date): Promise<SessionItem | null> {
  const session = await liveSession(db, learnerId, topicId);
  if (!session) return null;
  const items = await loadSessionItems(db, session.id, learnerId);
  const waiting = items.some((i) => i.kind === PARK_OFFER && i.data.skillId === skillId && !i.data.chosen);
  if (waiting) return null;
  return storeParkOffer(db, learnerId, session.id, skillId, now);
}

export type ParkResult = { ok: true; items: SessionItem[] } | { ok: false; status: 404 | 409; error: string };

/** The Learner's latest park offer on this Skill that no button has answered yet, in their current Topic's live Session. */
async function waitingOffer(db: Db, map: CourseMap, learnerId: number, skillId: string) {
  const { place } = await placeWithParked(db, map, learnerId);
  const topic = place?.topic;
  if (!topic || !isConverted(topic) || !topic.skills.some((s) => s.id === skillId)) return null;
  const session = await liveSession(db, learnerId, topic.id);
  if (!session) return null;
  const [row] = await db
    .select({ id: sessionItems.id, data: sessionItems.data })
    .from(sessionItems)
    .where(and(eq(sessionItems.learnerId, learnerId), eq(sessionItems.sessionId, session.id), eq(sessionItems.kind, PARK_OFFER), sql`${sessionItems.data}->>'skillId' = ${skillId}`))
    .orderBy(sql`${sessionItems.id} desc`)
    .limit(1);
  if (!row || row.data.chosen) return null;
  return { row, topic, sessionId: session.id, place: place as Place };
}

/** Marks the offer answered, so each button works once. */
async function answerOffer(db: Db, id: number, data: Record<string, unknown>, chosen: "park" | "one_more") {
  await db.update(sessionItems).set({ data: { ...data, chosen } }).where(eq(sessionItems.id, id));
}

/**
 * "Park it, review tomorrow": parks the Skill for 20 hours and stores the parked line ("Back tomorrow after <weekday,
 * time>"). The Topic waits at its step; the Learner may study any other Topic meanwhile.
 */
export async function parkFromOffer(db: Db, map: CourseMap, learnerId: number, skillId: string, now: Date): Promise<ParkResult> {
  if (await turnRunning(db, now, learnerId)) return { ok: false, status: 409, error: "Wait for the Tutor to finish, then choose." };
  const offer = await waitingOffer(db, map, learnerId, skillId);
  if (!offer) return { ok: false, status: 404, error: "There is no park offer waiting for that idea." };
  await answerOffer(db, offer.row.id, offer.row.data, "park");
  const state = await parkSkill(db, learnerId, offer.topic.id, skillId, now);
  const until = state.parkedUntil ?? now;
  const item: SessionItem = { kind: PARKED, data: { skillId, line: parkedLine(until), until: until.toISOString() } satisfies ParkedData };
  await saveItemAfterLatest(db, learnerId, offer.sessionId, item, now);
  return { ok: true, items: [item] };
}

/** "One more short try": one more Quick try on that Skill now. A miss on it offers the park again. */
export async function oneMoreFromOffer(db: Db, map: CourseMap, learnerId: number, skillId: string, now: Date): Promise<ParkResult> {
  if (await turnRunning(db, now, learnerId)) return { ok: false, status: 409, error: "Wait for the Tutor to finish, then choose." };
  const offer = await waitingOffer(db, map, learnerId, skillId);
  const place = offer && convertedPlace(offer.place);
  if (!offer || !place) return { ok: false, status: 404, error: "There is no park offer waiting for that idea." };
  await answerOffer(db, offer.row.id, offer.row.data, "one_more");
  const states = await skillStates(db, learnerId, place.topic.id);
  const { shown } = triesIn(await loadSessionItems(db, offer.sessionId, learnerId), place.check.id);
  const next = await storeTry(db, place, learnerId, offer.sessionId, now, states, shown, { skillId, force: true });
  return { ok: true, items: next ? [next] : [] };
}

/**
 * Start again (spec #229): the Topic's Concept cards re-posted in order, then its first Quick try. The step and any open
 * quiz attempt stay where they are. Null for a Topic not converted.
 */
export async function startAgainItems(db: Db, map: CourseMap, learnerId: number, sessionId: number, now: Date): Promise<SessionItem[] | null> {
  const place = navigate(map, await loadProgress(db, learnerId));
  if (!place || !isConverted(place.topic)) return null;
  const out: SessionItem[] = [];
  for (const check of place.topic.checks) {
    if (!check.card) continue;
    const data: ConceptCardData = { checkId: check.id, title: check.card.title, lines: [...check.card.lines], writeDown: check.card.writeDown };
    const card: SessionItem = { kind: CONCEPT_CARD, data };
    await saveItemAfterLatest(db, learnerId, sessionId, card, now);
    out.push(card);
  }
  const first = place.topic.checks.find((c) => c.quickTries.length);
  if (first) {
    const { shown } = triesIn(await loadSessionItems(db, sessionId, learnerId), first.id);
    const firstTry = nextQuickTry(place.topic, first, {}, shown, { session: sessionId, easier: true });
    if (firstTry) {
      const item = { kind: QUICK_TRY, data: firstTry };
      await saveItemAfterLatest(db, learnerId, sessionId, item, now);
      out.push(item);
    }
  }
  return out;
}

/**
 * What the frustration count reads in a Session, oldest first: the Learner's own typed messages, and each right
 * answer code marked in this Topic (converted Topics only; an unconverted Topic reads no practice answers).
 */
export async function frustrationEvents(db: Db, learnerId: number, sessionId: number, topicId: string, converted = true, current?: string): Promise<FrustrationEvent[]> {
  // The running turn's message is not in the Session yet: it is passed as `current` and counted last.
  const typed = await db
    .select({ input: turns.input, at: turns.startedAt })
    .from(turns)
    .where(and(eq(turns.learnerId, learnerId), eq(turns.sessionId, sessionId), ne(turns.status, "running")))
    .orderBy(asc(turns.id));
  const said = typed.flatMap((t) => (t.input && !isCodeWritten(t.input) ? [{ at: t.at.getTime(), e: { kind: "learner", text: t.input } as FrustrationEvent }] : []));
  const rights = converted
    ? (
        await db
          .select({ at: practiceAnswers.createdAt })
          .from(practiceAnswers)
          .where(and(eq(practiceAnswers.learnerId, learnerId), eq(practiceAnswers.topicId, topicId), eq(practiceAnswers.verdict, "right")))
      ).map((r) => ({ at: r.at.getTime(), e: { kind: "right" } as FrustrationEvent }))
    : [];
  const latest = current && !isCodeWritten(current) ? [{ kind: "learner", text: current } as FrustrationEvent] : [];
  return [...[...said, ...rights].sort((a, b) => a.at - b.at).map((x) => x.e), ...latest];
}

/** What the ladder tells the Tutor this turn, through TurnFacts and the context. */
export type LadderFacts = { replyKind?: "feedback" | "offer_park" | RungKind; method?: string; frustration?: number; skillLines: string[]; parked?: string };

const METHOD_NAMES: Record<Method, string> = { restate: "restate the rule", worked: "a worked example", boxes: "fill-in boxes", widget: "the Widget in practice mode", drill5: "a drill of five" };

/** A Known mistake's fix line, by its tag, from the Topic file: never the tag itself, which the Tutor must not repeat. */
function mistakeWords(topic: Topic, tag: string): string | undefined {
  for (const t of topic.templates) for (const m of t.mistakes) if (m.tag === tag) return m.fix;
  for (const c of topic.checks) for (const q of c.quickTries) if (isFixed(q)) for (const m of q.mistakes ?? []) if (m.tag === tag) return m.fix;
  for (const q of topic.questions) for (const c of q.choices) if (c.mistake?.tag === tag) return c.mistake.fix;
  return undefined;
}

/**
 * The ladder's facts for this turn (spec #229, ticket #245): the Reply kind and method a code-written re-teach note
 * named; the frustration count; at a converted Your turn or Check, each Skill's state in one plain line; and, while a
 * Skill of the Check is parked, when it comes back. Only a converted Topic reads skill_state and practice_answers.
 */
export async function ladderFacts(db: Db, map: CourseMap, learnerId: number, bare: Place | null, learnerText?: string, now = new Date()): Promise<LadderFacts> {
  const out: LadderFacts = { skillLines: [] };
  const method = methodInNote(learnerText);
  if (method) {
    out.method = METHOD_NAMES[method];
    out.replyKind = rungKind(method);
  } else if (learnerText && isCodeWritten(learnerText) && /Reply kind: feedback\b/.test(learnerText)) out.replyKind = "feedback";
  if (!bare) return out;
  const converted = isConverted(bare.topic);
  const session = await liveSession(db, learnerId, bare.topic.id);
  const parked = converted ? await parkedSkills(db, learnerId, [bare.topic.id]) : {};
  const place = navigate(map, await loadProgress(db, learnerId), parked) ?? bare;
  const states = converted ? await skillStates(db, learnerId, bare.topic.id) : {};
  const skills = converted && place.check && (place.step === "your_turn" || place.step === "check") ? checkSkills(place.topic, place.check) : [];
  const current = skills.find((s) => states[s] && !isFluent(states[s]));
  if (session) {
    const count = frustrationCount(await frustrationEvents(db, learnerId, session.id, bare.topic.id, converted, learnerText), current ? states[current] : null);
    if (count > 0) out.frustration = count;
  }
  const ruleOf = (id: string) => (place.topic.skills.find((s) => s.id === id)?.rule ?? "this idea").replace(/\.$/, "");
  out.skillLines = skills.map((id) => {
    const s = states[id] ?? freshSkillState();
    const mistake = s.lastMistake ? mistakeWords(place.topic, s.lastMistake) : undefined;
    const how = isFluent(s) ? "fluent" : `not fluent yet, ${s.missesInRow} ${s.missesInRow === 1 ? "miss" : "misses"} in a row`;
    return `- ${ruleOf(id)}: ${how}${mistake ? `; last Known mistake: ${mistake}` : ""}.`;
  });
  const waiting = place.parked?.filter((p) => now.getTime() < p.until.getTime()) ?? [];
  if (waiting.length) {
    out.parked = `Parked until ${backAt(waiting[0].until)}: ${waiting.map((p) => ruleOf(p.skillId)).join("; ")}. The Topic waits at this step, and code shows no Quick try and no Next until then. You may still answer the Learner's questions, and you may suggest another Topic on the Course Map.`;
    out.replyKind ??= "offer_park";
  }
  return out;
}

/**
 * The quiz follow-up on the repair ladder (spec #229; ticket #245). T13 records each Skill-tagged quiz answer with
 * `recordAnswer`, so misses in a row count across Quick tries and quiz questions. Code reads the first missed
 * question's Skill: at two misses in a row the note gains the re-teach lines and the method is noted as used; at three
 * or more code stores the park offer and the note tells the Tutor to say one short sentence. Otherwise the note is as
 * T04 wrote it. Converted Topics only, so production reads nothing new before a Topic is converted.
 */
export async function quizLadderNote(db: Db, map: CourseMap, learnerId: number, note: string, now: Date): Promise<{ note: string; items: SessionItem[] }> {
  const place = navigate(map, await loadProgress(db, learnerId));
  if (!place || !isConverted(place.topic)) return { note, items: [] };
  const topicId = place.topic.id;
  const [latest] = await db
    .select({ itemKey: practiceAnswers.itemKey })
    .from(practiceAnswers)
    .where(and(eq(practiceAnswers.learnerId, learnerId), eq(practiceAnswers.topicId, topicId), eq(practiceAnswers.source, "quiz")))
    .orderBy(sql`${practiceAnswers.id} desc`)
    .limit(1);
  const attempt = latest?.itemKey.split(":")[1];
  if (!attempt) return { note, items: [] };
  const [missed] = await db
    .select({ skillId: practiceAnswers.skillId, verdict: practiceAnswers.verdict, mistakeTag: practiceAnswers.mistakeTag })
    .from(practiceAnswers)
    .where(and(eq(practiceAnswers.learnerId, learnerId), sql`${practiceAnswers.itemKey} like ${`quiz:${attempt}:%`}`, sql`${practiceAnswers.verdict} <> 'right'`))
    .orderBy(asc(practiceAnswers.id))
    .limit(1);
  if (!missed) return { note, items: [] };
  const state = (await skillStates(db, learnerId, topicId))[missed.skillId] ?? freshSkillState();
  const event: AnswerEvent = missed.verdict === "known_mistake" && missed.mistakeTag ? { verdict: "known_mistake", tag: missed.mistakeTag } : { verdict: "wrong" };
  const action = ladderAction(state, event);
  if (action.kind === "reteach") {
    await noteMethodUsed(db, learnerId, topicId, missed.skillId, action.method, now);
    return {
      note: `${note}\nThis is the second miss in a row on this idea, so code overrides "do not re-teach": teach this one idea again this way, then ask the one similar question.\n${action.note}`,
      items: [],
    };
  }
  if (action.kind === "park_offer") {
    const offer = await parkOfferFor(db, map, learnerId, topicId, missed.skillId, now);
    return {
      note: `${QUIZ_FOLLOW_UP_PREFIX} the Learner missed the quiz, and this is their third miss in a row on the same idea. Code has shown them a park offer: park the idea and review it tomorrow, or have one more short try now. Reply kind: offer_park. Say one short sentence that leaves the choice to them. No new explanation and no question of your own.`,
      items: offer ? [offer] : [],
    };
  }
  return { note, items: [] };
}
