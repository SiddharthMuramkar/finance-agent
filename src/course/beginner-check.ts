import type { Topic } from "./map.ts";

// The beginner rules in the course check (spec #68, "Seam 2, the course check"): a Spine Topic brings at most four new
// words (its Lingo terms); no Spine Check asks for the Learner's own story (Spine Checks judge Stories); no "your story"
// wording anywhere in a Spine Topic; and every Spine Topic has a daily-life line. Every Spine Topic follows every rule,
// including Topics added later: there is no list of known failures.
// No "@/" imports, so `scripts/check-course.mjs` can run it under plain Node.

/** The most new words (Lingo terms) a Spine Topic brings. */
export const MAX_NEW_WORDS = 4;

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

/** Every beginner rule this Spine Topic breaks, in words: new words, own story, "your story", daily life. */
function ruleProblems(t: Topic): string[] {
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
  return [...newWords, ...ownStory, ...yourStory, ...dailyLife];
}

/** Every problem the beginner rules find in these Topics' Spine Topics. */
export function beginnerCheckErrors(topics: readonly Topic[]): string[] {
  return topics.filter((t) => t.stage === "spine").flatMap((t) => ruleProblems(t).map((p) => `Spine Topic "${t.id}" ${p} (spec #68)`));
}
