import type { FixedQuickTry, Topic } from "./map.ts";

// Every text in a Topic, each with where it is and the group it belongs to, for the course checks that read a Topic's
// words: the typed-formula check (formula-check.ts, ADR 0003), lesson lint L5 (the currency rule), the formula-marker
// check in the Topic schema (map.ts) and the Case as-of leak test (compounding-leak.test.ts). Each check takes the groups
// it needs, so a text added here is read by every check that takes its group. A new text field in the Topic file
// belongs here, in the group that says how it is checked, and in the fixture of topic-texts.test.ts.
// Left out: the goal, the why line, found lines and You'll learn, which have their own rules (goal-check.ts, youll-learn-check.ts);
// written-ahead Widgets and the reveal Widget, which are built and checked as Widgets; and names rather than words:
// the titles of the Topic, its Cases and pieces, sources, ids and emoji names (a scene's inputs are taken whole).
// No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

/**
 * What a text is, as the checks tell texts apart:
 * - `case`: a Case's story and reveal. It is dated and keeps the Case's own currency.
 * - `question`: a quiz question's prompt, choices and explanation; for a computed question (spec D2), the words on its
 *   changes and bands, since code makes its choices from them; and a computed Quick try's ask and changes, for the same reason.
 * - `earlier`: the rest of what every Topic had before the teaching fields: the concept, the principle, the Insight, the
 *   Connections, a conversation Check's prompt and pass criteria, and the daily-life line (spec #68).
 * - `deeper`: the Go deeper material (spec H1), shown only when the Learner presses Go deeper: the one text outside a
 *   Formula Card where a typed formula may sit (spec #68, ADR 0003). Its formula markers are still checked.
 * - `teaching`: teaching (spec #229, E3) that follows a question or the Case rather than the Topic's own examples: a quiz
 *   question's mix-up fixes, the fixes code writes for a computed Quick try, and where a term showed up in the story. Like
 *   the question or Case, it keeps its currency.
 * - `example`: the Topic's own everyday examples: the Running example, terms, Skills, templates, Concept cards and their
 *   recipe presets, Quick tries with their choices and fixes, and Primers (spec C3) with theirs.
 * - `scene`: every string in the Topic's scenes and in the Running example's scene (ids and emoji names included: the
 *   scene's recipe knows which are words).
 */
export type TextGroup = "case" | "question" | "earlier" | "deeper" | "teaching" | "example" | "scene";

export type TopicText = { where: string; text: string; group: TextGroup };

/** What the walker reads. The Topic schema's own refinement passes a Topic file before its Connections get titles. */
export type TextSource = Pick<Topic, "cases" | "concept" | "principle" | "insight" | "questions" | "checks" | "runningExample" | "terms" | "skills" | "templates" | "scenes" | "primers"> & {
  goDeeper?: string;
  dailyLife?: string;
  connections?: readonly { text: string }[];
};

/** Every string anywhere in a value, with its path ("beats.1.says"), for a recipe's inputs. */
function stringsAt(value: unknown, path = ""): { path: string; text: string }[] {
  if (typeof value === "string") return [{ path, text: value }];
  const at = (key: string | number) => (path ? `${path}.${key}` : String(key));
  if (Array.isArray(value)) return value.flatMap((v, i) => stringsAt(v, at(i)));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => stringsAt(v, at(k)));
  return [];
}

/** Every text in a Topic, once each, with a label saying where it is and the group it belongs to. */
export function topicTexts(topic: TextSource): TopicText[] {
  const texts: TopicText[] = [];
  const add = (group: TextGroup, where: string, text: string) => texts.push({ where, text, group });
  const fixedTry = (at: string, q: FixedQuickTry) => {
    add("example", `${at} ask`, q.ask);
    if (q.label) add("example", `${at} label`, q.label);
    if (q.halfDone) add("example", `${at} half-done step`, q.halfDone);
    for (const choice of q.choices ?? []) {
      add("example", `${at} choice "${choice.id}"`, choice.text);
      if (choice.mistake) add("example", `${at} choice "${choice.id}" fix`, choice.mistake.fix);
    }
    (q.mistakes ?? []).forEach((m, i) => add("example", `${at} fix ${i + 1}`, m.fix));
  };

  for (const c of topic.cases) {
    add("case", `Case "${c.id}" story`, c.story);
    add("case", `Case "${c.id}" reveal`, c.reveal);
  }
  add("earlier", "concept", topic.concept);
  if (topic.goDeeper) add("deeper", "Go deeper", topic.goDeeper);
  add("earlier", "principle", topic.principle);
  if (topic.dailyLife) add("earlier", "daily-life line", topic.dailyLife);
  if (topic.insight) {
    add("earlier", "insight question", topic.insight.question);
    add("earlier", "insight written", topic.insight.written);
    add("earlier", "insight foundWhen", topic.insight.foundWhen);
    topic.insight.hints.forEach((h, i) => add("earlier", `insight hint ${i + 1}`, h));
  }
  (topic.connections ?? []).forEach((c, i) => add("earlier", `Connection ${i + 1}`, c.text));
  for (const q of topic.questions) {
    add("question", `question "${q.id}" prompt`, q.prompt);
    if ("computed" in q) {
      for (const c of q.computed.changes) add("question", `question "${q.id}" change "${c.id}"`, c.label);
      for (const b of q.computed.bands ?? []) add("question", `question "${q.id}" band "${b.id}"`, b.label);
      if (q.explanation) add("question", `question "${q.id}" explanation`, q.explanation);
      continue;
    }
    for (const c of q.choices) {
      add("question", `question "${q.id}" choice "${c.id}"`, c.text);
      if (c.mistake) add("teaching", `question "${q.id}" choice "${c.id}" fix`, c.mistake.fix);
    }
    add("question", `question "${q.id}" explanation`, q.explanation);
  }
  for (const c of topic.checks) {
    if (c.kind !== "conversation") continue;
    add("earlier", `Check "${c.id}" prompt`, c.prompt);
    add("earlier", `Check "${c.id}" pass criteria`, c.passCriteria);
  }

  if (topic.runningExample) add("example", "the Running example", topic.runningExample.text);
  for (const x of topic.terms) {
    add("example", `term "${x.term}"`, `${x.term}: ${x.means}`);
    if (x.pro) add("example", `term "${x.term}" pro`, x.pro);
    if (x.example) add("example", `term "${x.term}" example`, x.example);
    if (x.inStory) add("teaching", `term "${x.term}" in the story`, x.inStory);
  }
  for (const s of topic.skills) {
    add("example", `Skill "${s.id}" rule`, s.rule);
    if (s.analogy) add("example", `Skill "${s.id}" analogy`, s.analogy);
  }
  for (const x of topic.templates) {
    add("example", `template "${x.id}" ask`, x.ask);
    if (x.label) add("example", `template "${x.id}" label`, x.label);
    if (x.halfDone) add("example", `template "${x.id}" half-done step`, x.halfDone.shows);
    for (const m of x.mistakes) {
      add("example", `template "${x.id}" fix for ${m.tag}`, m.fix);
      if (m.label) add("example", `template "${x.id}" label for ${m.tag}`, m.label);
    }
  }
  for (const c of topic.checks) {
    const card = c.card;
    if (card) {
      add("example", `Check "${c.id}" card title`, card.title);
      card.lines.forEach((line, i) => add("example", `Check "${c.id}" card line ${i + 1}`, line));
      add("example", `Check "${c.id}" card write-down`, card.writeDown);
      const preset = card.widget;
      if (preset && "recipe" in preset) {
        if (preset.title) add("example", `Check "${c.id}" card preset title`, preset.title);
        for (const { path, text } of stringsAt(preset.inputs)) add("example", `Check "${c.id}" card preset ${path}`, text);
      }
    }
    for (const q of c.quickTries) {
      if (!("id" in q)) continue;
      const at = `Check "${c.id}" Quick try "${q.id}"`;
      if (!q.computed) {
        fixedTry(at, q);
        continue;
      }
      // A computed Quick try follows its Case like a computed question: its words keep the Case's currency, and the
      // fixes code writes from the figures are teaching that follows it (spec D2, D3).
      add("question", `${at} ask`, q.ask);
      for (const change of q.computed.changes) add("question", `${at} change "${change.id}"`, change.label);
      for (const choice of q.choices ?? []) if (choice.mistake) add("teaching", `${at} choice "${choice.id}" fix`, choice.mistake.fix);
    }
  }
  for (const p of topic.primers ?? []) {
    add("example", `Primer "${p.id}" title`, p.title);
    p.lines.forEach((line, i) => add("example", `Primer "${p.id}" line ${i + 1}`, line));
    fixedTry(`Primer "${p.id}" Quick try "${p.quickTry.id}"`, p.quickTry);
    const preset = p.widget;
    if (preset && "recipe" in preset) {
      if (preset.title) add("example", `Primer "${p.id}" preset title`, preset.title);
      for (const { path, text } of stringsAt(preset.inputs)) add("example", `Primer "${p.id}" preset ${path}`, text);
    }
  }

  for (const s of topic.scenes) {
    if (s.title) add("scene", `Scene "${s.id}" title`, s.title);
    for (const { path, text } of stringsAt(s.inputs)) add("scene", `Scene "${s.id}" ${path}`, text);
  }
  const running = topic.runningExample?.scene;
  if (running) for (const { path, text } of stringsAt(running)) add("scene", `the Running example's scene ${path}`, text);
  return texts;
}

/** The texts of the given groups, in the order `topicTexts` gives them. */
export function textsIn(topic: TextSource, groups: readonly TextGroup[]): TopicText[] {
  return topicTexts(topic).filter((t) => groups.includes(t.group));
}
