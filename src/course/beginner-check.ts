import type { Topic } from "./map.ts";

// The beginner rules in the course check (spec #68, "Seam 2, the course check"): a Spine Topic brings at most four new
// words (its Lingo terms); no Spine Check asks for the Learner's own story (Spine Checks judge Stories); no "your story"
// wording anywhere in a Spine Topic; and every Spine Topic has a daily-life line. Each rule starts with a list of the
// Spine Topics that break it today, and each list can only shrink:
// - a Topic off its list that breaks the rule fails, with a message naming the rule;
// - a Topic on its list that follows the rule fails until it comes off;
// - a Topic on a list it did not start on (BEGINNER_STARTED_WITH) fails, even one that breaks the rule;
// - an id on a list that is not a Spine Topic fails.
// One id per line, sorted, so the tickets that rewrite Topics and delete their ids merge cleanly. Never add an id.
// The daily-life rule also runs on every converted Elective (a Topic with Skills, its teaching written ahead): spec story
// 57 asks it of each Topic, and those Electives carry Principle steps written for beginners. It has no list: every
// converted Elective has its line today. An Elective not yet converted is taught live and is left out (review 2, G32).
// No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

/** The most new words (Lingo terms) a Spine Topic brings. */
export const MAX_NEW_WORDS = 4;

/** Spine Topics that bring more than four new words. */
export const NEW_WORDS_NOT_YET: readonly string[] = [
  "spine-09-to-one-share",
  "spine-10-survival",
  "spine-11-story-to-numbers",
  "spine-12-price-or-value",
];

/** Spine Topics with a Check that asks for the Learner's own story. */
export const OWN_STORY_NOT_YET: readonly string[] = [
  "spine-10-survival",
  "spine-11-story-to-numbers",
  "spine-14-being-wrong",
];

/** Spine Topics that say "your story". */
export const YOUR_STORY_NOT_YET: readonly string[] = [
  "spine-12-price-or-value",
  "spine-13-price-assumes",
  "spine-14-being-wrong",
];

/** Spine Topics with no daily-life line. */
export const DAILY_LIFE_NOT_YET: readonly string[] = [
  "spine-09-to-one-share",
  "spine-10-survival",
  "spine-11-story-to-numbers",
  "spine-12-price-or-value",
  "spine-13-price-assumes",
  "spine-14-being-wrong",
  "spine-15-value-yourself",
];

export type BeginnerLists = { newWords: readonly string[]; ownStory: readonly string[]; yourStory: readonly string[]; dailyLife: readonly string[] };
type Rule = keyof BeginnerLists;

export const BEGINNER_LISTS: BeginnerLists = { newWords: NEW_WORDS_NOT_YET, ownStory: OWN_STORY_NOT_YET, yourStory: YOUR_STORY_NOT_YET, dailyLife: DAILY_LIFE_NOT_YET };

/**
 * The lists as spec #68's ticket #87 wrote them (commit 43812ba), frozen as literals so they cannot follow the live lists.
 * Never edit: a list id that is not here was added, and fails.
 */
export const BEGINNER_STARTED_WITH: BeginnerLists = {
  newWords: [
    "spine-01-worth",
    "spine-02-money-later",
    "spine-03-cash",
    "spine-04-growth",
    "spine-05-margins",
    "spine-06-growth-cost",
    "spine-07-risk",
    "spine-09-to-one-share",
    "spine-10-survival",
    "spine-11-story-to-numbers",
    "spine-12-price-or-value",
  ],
  ownStory: [
    "spine-01-worth",
    "spine-05-margins",
    "spine-06-growth-cost",
    "spine-07-risk",
    "spine-10-survival",
    "spine-11-story-to-numbers",
    "spine-14-being-wrong",
    "spine-15-value-yourself",
  ],
  yourStory: [
    "spine-01-worth",
    "spine-12-price-or-value",
    "spine-13-price-assumes",
    "spine-14-being-wrong",
    "spine-15-value-yourself",
  ],
  dailyLife: [
    "spine-02-money-later",
    "spine-03-cash",
    "spine-04-growth",
    "spine-05-margins",
    "spine-06-growth-cost",
    "spine-07-risk",
    "spine-08-far-future",
    "spine-09-to-one-share",
    "spine-10-survival",
    "spine-11-story-to-numbers",
    "spine-12-price-or-value",
    "spine-13-price-assumes",
    "spine-14-being-wrong",
    "spine-15-value-yourself",
  ],
};

const LIST_NAME: Record<Rule, string> = {
  newWords: "NEW_WORDS_NOT_YET",
  ownStory: "OWN_STORY_NOT_YET",
  yourStory: "YOUR_STORY_NOT_YET",
  dailyLife: "DAILY_LIFE_NOT_YET",
};
const RULE_NAME: Record<Rule, string> = { newWords: "new-words", ownStory: "own-story", yourStory: '"your story"', dailyLife: "daily-life" };
const FILE = "src/course/beginner-check.ts";

/**
 * Asks that make a Check about the Learner's own story rather than judging someone's: "Tell Amazon's story", "as you
 * would set", "how you would value", "your own range", "as you see it". "In your own words" is explaining, not a story.
 */
const OWN_STORY_ASKS: readonly RegExp[] = [
  /\btell\b[^.?!]*?\bstory\b/i,
  /\b(?:as|how) you would (?:set|value)\b/i,
  /\byour own (?:story|range|value|valuation|settings?)\b/i,
  /\bas you see it\b/i,
];

/** "your story", "your own story", "your Valuation story". */
const YOUR_STORY = /\byour\s+(?:\w+\s+)?story\b/i;

/** Every string anywhere in a value, with its path ("explore.workbench.title"). */
function stringsAt(value: unknown, path = ""): { path: string; text: string }[] {
  if (typeof value === "string") return [{ path, text: value }];
  const at = (key: string | number) => (path ? `${path}.${key}` : String(key));
  if (Array.isArray(value)) return value.flatMap((v, i) => stringsAt(v, at(i)));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => stringsAt(v, at(k)));
  return [];
}

/** What a Spine Topic does against each beginner rule: a problem in words, or nothing when it follows the rule. */
function ruleProblems(t: Topic): Record<Rule, string[]> {
  const words = t.terms.map((x) => x.term);
  const newWords =
    words.length > MAX_NEW_WORDS
      ? [`brings ${words.length} new words (${words.join(", ")}); a Spine Topic brings at most ${MAX_NEW_WORDS}: move the rest to Go deeper or an Elective`]
      : [];
  const ownStory = t.checks.flatMap((c) => {
    if (c.kind !== "conversation") return [];
    const ask = OWN_STORY_ASKS.map((re) => c.prompt.match(re)?.[0]).find(Boolean);
    return ask ? [`has a Check "${c.id}" that asks for the Learner's own story ("${ask}"); a Spine Check judges a Story instead`] : [];
  });
  const yourStory = stringsAt(t)
    .filter(({ text }) => YOUR_STORY.test(text))
    .map(({ path }) => `says "your story" at ${path}; name whose Story it is instead`);
  const dailyLife = t.dailyLife ? [] : ["has no daily-life line; give it a dailyLife line from a beginner's day"];
  return { newWords, ownStory, yourStory, dailyLife };
}

/** Every problem the beginner rules find in these Topics' Spine Topics and converted Electives, and in the lists of known failures. */
export function beginnerCheckErrors(topics: readonly Topic[], opts?: { lists?: BeginnerLists; startedWith?: BeginnerLists }): string[] {
  const lists = opts?.lists ?? BEGINNER_LISTS;
  const startedWith = opts?.startedWith ?? BEGINNER_STARTED_WITH;
  const spine = topics.filter((t) => t.stage === "spine");
  const ids = new Set(spine.map((t) => t.id));
  const rules = Object.keys(LIST_NAME) as Rule[];
  const errors: string[] = [];
  for (const rule of rules) {
    for (const id of lists[rule]) {
      if (!ids.has(id)) errors.push(`List: "${id}" is on ${LIST_NAME[rule]} but is not a Spine Topic: remove it from ${FILE}`);
      else if (!startedWith[rule].includes(id)) {
        errors.push(`List: Topic "${id}" was added to ${LIST_NAME[rule]}, which only shrinks: make the Topic follow the rule instead (${FILE})`);
      }
    }
  }
  const convertedElectives = topics.filter((t) => t.stage !== "spine" && t.skills.length > 0);
  for (const t of convertedElectives) {
    if (!t.dailyLife) errors.push(`Elective "${t.id}" has Skills (a converted Topic) but no daily-life line; give it a dailyLife line from a beginner's day (spec #68 story 57)`);
  }
  for (const t of spine) {
    const problems = ruleProblems(t);
    for (const rule of rules) {
      const listed = lists[rule].includes(t.id);
      if (listed && !problems[rule].length) errors.push(`List: Topic "${t.id}" follows the ${RULE_NAME[rule]} rule: remove it from ${LIST_NAME[rule]} in ${FILE}`);
      if (!listed) errors.push(...problems[rule].map((p) => `Spine Topic "${t.id}" ${p} (spec #68)`));
    }
  }
  return errors;
}
