import type { Check, FixedQuickTry, QuickTry, Topic } from "@/course/map";
import { testedSkills } from "@/course/map";
import { drawTemplate, type DrawnItem, type FixedItem } from "@/teaching";
import { isFluent, type SkillState } from "@/teaching/ladder";
import type { QuickTryData } from "./session-item-kinds";

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
